/**
 * Worker 入口文件 - 使用 Hono 框架
 * 第一阶段：建立"大脑中枢"，提供影子接口 /api/v2/analyze
 * 第二阶段：引入 KV 缓存，定期汇总平均分
 * 迁移说明：已完整迁移原有 worker.js 的所有功能
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { calculateDimensions, RARITY_SCORES, DIMENSIONS } from './scoring';
import { getRoastText, getPersonalityName, getVibeIndex, determinePersonalityType, generateLPDEF } from './content';

// Cloudflare Workers 类型定义（兼容性处理）
type KVNamespace = {
  get(key: string, type?: 'text'): Promise<string | null>;
  get(key: string, type: 'json'): Promise<any | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
};

type D1Database = {
  prepare(query: string): {
    bind(...values: any[]): {
      first<T = any>(): Promise<T | null>;
      run(): Promise<any>;
      all<T = any>(): Promise<any>;
    };
  };
};

type ScheduledEvent = {
  type: 'scheduled';
  scheduledTime: number;
  cron: string;
};

type ExecutionContext = {
  waitUntil(promise: Promise<any>): void;
  passThroughOnException(): void;
};

// 定义环境变量类型
type Env = {
  SUPABASE_URL?: string;
  SUPABASE_KEY?: string;
  STATS_STORE?: KVNamespace; // KV 存储（第二阶段使用）
  CONTENT_STORE?: KVNamespace; // KV 存储（第三阶段：文案库）
  prompts_library?: D1Database; // D1 数据库：答案之书
};

// KV 存储的键名
const KV_KEY_GLOBAL_AVERAGE = 'global_average';
const KV_KEY_LAST_UPDATE = 'global_average_last_update';
const KV_KEY_GLOBAL_AVERAGES = 'GLOBAL_AVERAGES'; // 大盘汇总数据键名
const KV_CACHE_TTL = 3600; // 缓存有效期：1小时（秒）

// 创建 Hono 应用
const app = new Hono<{ Bindings: Env }>();

// CORS 配置（兼容原有 worker.js）
app.use('/*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400, // Access-Control-Max-Age: 86400
}));

/**
 * 路由：/api/v2/analyze (第三阶段：正式接口)
 * 功能：接收聊天数据，计算 5 维度得分，返回完整分析结果（包括文案）
 * 注意：这是正式接口，替代前端本地计算
 */
app.post('/api/v2/analyze', async (c) => {
  try {
    const body = await c.req.json();
    const { chatData, lang = 'zh-CN' } = body;

    // 【防御性编程】检测旧版前端数据格式
    // 如果存在 dimensions 但不存在 chatData，说明是旧版前端发来的数据
    if (body.dimensions && (!chatData || !Array.isArray(chatData))) {
      console.warn('[Worker] 检测到旧版前端数据格式:', {
        hasDimensions: !!body.dimensions,
        hasChatData: !!chatData,
        chatDataIsArray: Array.isArray(chatData),
      });
      return c.json({
        status: 'error',
        error: '检测到旧版前端数据格式，请刷新页面后重试',
        errorCode: 'LEGACY_FORMAT_DETECTED',
        message: '检测到旧版前端数据格式，请刷新页面后重试',
      }, 400);
    }

    // 验证 chatData 格式
    if (!chatData || !Array.isArray(chatData)) {
      return c.json({
        status: 'error',
        error: 'chatData 必须是数组',
        errorCode: 'INVALID_CHATDATA',
      }, 400);
    }

    // 提取用户消息
    const userMessages = chatData.filter((item: any) => item.role === 'USER');

    if (userMessages.length === 0) {
      const defaultRoast = lang === 'en' ? 'No roast available' : '暂无吐槽';
      const defaultPersonalityName = lang === 'en' ? 'Unknown Personality' : '未知人格';
      const defaultDimensions = { L: 0, P: 0, D: 0, E: 0, F: 0 };
      const defaultRanks = {
        messageRank: 50,
        charRank: 50,
        daysRank: 50,
        jiafangRank: 50,
        ketaoRank: 50,
        avgRank: 50,
        L_rank: 50,
        P_rank: 50,
        D_rank: 50,
        E_rank: 50,
        F_rank: 50,
      };
      return c.json({
        status: 'success',
        // 1. 顶层字段（前端期望的格式）
        dimensions: defaultDimensions,
        roastText: defaultRoast,        // 必须叫 roastText 而不是 roast
        personalityName: defaultPersonalityName,
        vibeIndex: '00000',
        personalityType: 'UNKNOWN',
        lpdef: 'L0P0D0E0F0',
        statistics: {
          totalMessages: 0,
          avgMessageLength: 0,
          totalChars: 0,
        },
        // 2. 核心 ranks 对象
        ranks: defaultRanks,
        // 3. 统计字段（解决 totalUsers: 0 的显示问题）
        totalUsers: 1,
        // 4. 兼容性 data 对象（确保旧版逻辑不崩溃）
        data: {
          roast: defaultRoast,
          type: 'UNKNOWN',
          dimensions: defaultDimensions,
          vibeIndex: '00000',
          personalityName: defaultPersonalityName,
          ranks: defaultRanks
        },
        message: '没有用户消息',
      });
    }

    // 使用 scoring.ts 中的算法计算维度得分
    const dimensions = calculateDimensions(userMessages);

    // 【调试日志】输出维度计算结果
    console.log('[Worker] 📊 维度计算结果:', {
      L: dimensions.L,
      P: dimensions.P,
      D: dimensions.D,
      E: dimensions.E,
      F: dimensions.F,
      totalMessages: userMessages.length,
      sampleMessage: userMessages[0]?.text?.substring(0, 50) || 'N/A',
    });

    // 生成索引和人格类型
    const vibeIndex = getVibeIndex(dimensions);
    const personalityType = determinePersonalityType(dimensions);
    const lpdef = generateLPDEF(dimensions);

    // 【调试日志】输出人格识别结果
    console.log('[Worker] 🎭 人格识别结果:', {
      vibeIndex,
      personalityType,
      lpdef,
      dimensions,
    });

    // 获取文案（从 KV 或默认值）
    const env = c.env;
    const [roastText, personalityName] = await Promise.all([
      getRoastText(vibeIndex, lang, env),
      getPersonalityName(vibeIndex, lang, personalityType, env),
    ]);

    // 计算统计信息
    const totalMessages = userMessages.length;
    const totalChars = userMessages.reduce((sum, msg) => sum + (msg.text?.length || 0), 0);
    const avgLength = totalChars / totalMessages || 0;

    // 【地理位置采集】从 c.req.raw.cf 提取地理信息
    // 格式要求：city, country（例如：beijing, cn）
    let ipLocation = '未知';
    try {
      const cf = (c.req.raw as any)?.cf;
      if (cf) {
        const city = (cf.city || '').toLowerCase().trim();
        const country = (cf.country || '').toLowerCase().trim();
        if (city || country) {
          // 格式化为 "city, country" 格式
          const parts: string[] = [];
          if (city) parts.push(city);
          if (country) parts.push(country);
          ipLocation = parts.join(', ').trim();
          console.log('[Worker] 采集到新位置:', { city, country, location: ipLocation });
        } else {
          console.log('[Worker] 未获取到地理位置信息，使用默认值"未知"');
        }
      } else {
        console.log('[Worker] c.req.raw.cf 不存在，使用默认值"未知"');
      }
    } catch (error) {
      console.warn('[Worker] 获取地理位置信息失败:', error);
      ipLocation = '未知';
    }

    // 【计算排名数据】从 Supabase 查询真实排名
    // 初始化 ranks 对象，默认值为 50（中等排名）
    let ranks = {
      messageRank: 50,
      charRank: 50,
      daysRank: 50,
      jiafangRank: 50,
      ketaoRank: 50,
      avgRank: 50,
      L_rank: 50,
      P_rank: 50,
      D_rank: 50,
      E_rank: 50,
      F_rank: 50,
    };

    // 【保存到 Supabase】如果配置了 Supabase，保存分析结果到 user_analysis 表
    if (env.SUPABASE_URL && env.SUPABASE_KEY) {
      try {
        // 生成用户身份标识
        const userSignature = `${totalMessages}_${totalChars}_${vibeIndex}`;
        const msgUint8 = new TextEncoder().encode(userSignature);
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
        const userIdentity = Array.from(new Uint8Array(hashBuffer))
          .map(b => b.toString(16).padStart(2, '0')).join('');

        // 【构造插入 Payload】将维度分映射为小写字段名
        const analysisPayload = {
          user_identity: userIdentity,
          l: dimensions.L,        // 小写字段映射
          p: dimensions.P,
          d: dimensions.D,
          e: dimensions.E,
          f: dimensions.F,
          dimensions: dimensions, // 同时保留完整的 JSONB 格式
          vibe_index: vibeIndex,
          personality_type: personalityType,
          total_messages: totalMessages,
          total_chars: totalChars,
          ip_location: ipLocation, // 从 c.req.raw.cf 提取的地理信息
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        const insertUrl = `${env.SUPABASE_URL}/rest/v1/user_analysis`;
        // 【执行 Supabase 插入】Body 必须是数组格式
        const insertBody = JSON.stringify([analysisPayload]);

        console.log('[Worker] 📤 准备插入数据到 user_analysis 表:', {
          url: insertUrl,
          method: 'POST',
          headers: {
            'apikey': '***',
            'Authorization': 'Bearer ***',
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal',
          },
          body: insertBody,
          payload: analysisPayload,
        });

        // 【执行插入】使用 fetch 发送 POST 请求
        // Headers 必须包含 apikey, Authorization: Bearer, 和 'Prefer': 'return=minimal'
        const writeRes = await fetch(insertUrl, {
          method: 'POST',
          headers: {
            'apikey': env.SUPABASE_KEY,
            'Authorization': `Bearer ${env.SUPABASE_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal',
          },
          body: insertBody, // 数组格式：JSON.stringify([payload])
        });

        console.log('[Worker] 📥 Supabase 响应状态:', {
          ok: writeRes.ok,
          status: writeRes.status,
          statusText: writeRes.statusText,
        });

        if (writeRes.ok) {
          console.log('[Worker] ✅ 分析数据已保存到 user_analysis 表', {
            userIdentity,
            ipLocation,
            vibeIndex,
            personalityType,
            dimensions: { l: dimensions.L, p: dimensions.P, d: dimensions.D, e: dimensions.E, f: dimensions.F },
          });
        } else {
          // 【错误诊断】如果 !res.ok，必须打印 Supabase 错误详情
          const errorText = await writeRes.text().catch(() => '无法读取错误信息');
          console.error('[Supabase Error]', errorText);
          console.error('[Worker] ❌ 保存到 user_analysis 表失败:', {
            status: writeRes.status,
            statusText: writeRes.statusText,
            error: errorText,
            userIdentity,
            ipLocation,
            payload: analysisPayload,
            requestBody: insertBody,
          });
        }
      } catch (error) {
        console.error('[Worker] ❌ 保存分析数据时出错:', error);
        // 即使保存失败，也返回结果（使用基于维度分计算的排名）
      }
    }

    // 【获取总用户数和真实排名数据】
    let totalUsers = 1;
    if (env.SUPABASE_URL && env.SUPABASE_KEY) {
      try {
        // 并行获取总用户数和全局统计数据
        const [totalUsersRes, globalRes] = await Promise.all([
          fetch(`${env.SUPABASE_URL}/rest/v1/global_stats_view?select=total_count`, {
            headers: {
              'apikey': env.SUPABASE_KEY,
              'Authorization': `Bearer ${env.SUPABASE_KEY}`,
            },
          }),
          fetch(`${env.SUPABASE_URL}/rest/v1/global_stats_view?select=*`, {
            headers: {
              'apikey': env.SUPABASE_KEY,
              'Authorization': `Bearer ${env.SUPABASE_KEY}`,
            },
          }),
        ]);

        if (totalUsersRes.ok) {
          const totalData = await totalUsersRes.json();
          totalUsers = totalData[0]?.total_count || 1;
          if (totalUsers <= 0) {
            totalUsers = 1;
          }
        }

        // 查询真实排名数据（从 user_analysis 表）
        if (totalUsers > 1) {
          // 排名查询函数（带错误处理）
          const getRankCount = async (column: string, value: number): Promise<number> => {
            if (value <= 0 || !value || isNaN(value)) {
              return 0;
            }
            
            try {
              const numValue = Number(value);
              if (isNaN(numValue) || numValue <= 0) {
                return 0;
              }
              
              const queryUrl = `${env.SUPABASE_URL}/rest/v1/user_analysis?${column}=lt.${numValue}&select=id`;
              
              const res = await fetch(queryUrl, {
                headers: {
                  'apikey': env.SUPABASE_KEY,
                  'Authorization': `Bearer ${env.SUPABASE_KEY}`,
                  'Prefer': 'count=exact',
                  'Range': '0-0',
                },
              });
              
              if (!res.ok) {
                return 0;
              }
              
              const contentRange = res.headers.get('content-range');
              if (contentRange) {
                const parts = contentRange.split('/');
                if (parts.length === 2) {
                  const count = parseInt(parts[1]);
                  if (!isNaN(count) && count >= 0) {
                    return count;
                  }
                }
              }
              
              const data = await res.json().catch(() => null);
              if (Array.isArray(data)) {
                return data.length;
              }
              
              return 0;
            } catch (error: any) {
              console.error(`[Worker] ❌ 排名查询异常 (${column}):`, error);
              return 0;
            }
          };

          // 计算各维度的排名（基于维度分）
          const [beatL, beatP, beatD, beatE, beatF] = await Promise.all([
            getRankCount('l', dimensions.L),
            getRankCount('p', dimensions.P),
            getRankCount('d', dimensions.D),
            getRankCount('e', dimensions.E),
            getRankCount('f', dimensions.F),
          ]);

          // 计算统计数据的排名（基于实际统计数据）
          // 注意：user_analysis 表中可能没有这些字段，需要从 cursor_stats 表查询
          // 这里先使用维度排名作为占位符，后续可以优化
          const calcPct = (count: number): number => {
            if (totalUsers <= 0) return 50;
            const percent = Math.floor((count / totalUsers) * 100);
            return Math.min(99, Math.max(0, percent));
          };

          // 更新 ranks 对象
          ranks = {
            messageRank: calcPct(beatL),      // 消息数排名（用 L 维度）
            charRank: calcPct(beatP),          // 字符数排名（用 P 维度）
            daysRank: calcPct(beatD),         // 天数排名（用 D 维度）
            jiafangRank: calcPct(beatE),       // 甲方上身排名（用 E 维度）
            ketaoRank: calcPct(beatF),         // 赛博磕头排名（用 F 维度）
            avgRank: Math.floor((calcPct(beatL) + calcPct(beatP) + calcPct(beatD) + calcPct(beatE) + calcPct(beatF)) / 5),
            L_rank: calcPct(beatL),
            P_rank: calcPct(beatP),
            D_rank: calcPct(beatD),
            E_rank: calcPct(beatE),
            F_rank: calcPct(beatF),
          };

          console.log('[Worker] ✅ 真实排名数据已计算:', {
            totalUsers,
            ranks,
            dimensions,
          });
        }
      } catch (error) {
        console.warn('[Worker] ⚠️ 获取排名数据失败，使用默认值:', error);
        totalUsers = 1;
      }
    }

    // --- 核心修复：确保所有关键字段都在顶层，且名称与前端完全对齐 ---
    return c.json({
      status: 'success',
      // 1. 顶层字段（这是前端 React 组件直接解构的字段）
      dimensions: dimensions,
      roastText: roastText,        // 必须叫 roastText 而不是 roast
      personalityName: personalityName,
      vibeIndex: vibeIndex,
      personalityType: personalityType,
      lpdef: lpdef,
      statistics: {
        totalMessages,
        avgMessageLength: Math.round(avgLength),
        totalChars,
      },
      // 2. 核心 ranks 对象（用于显示百分比排名）
      // 前端期望的格式：messageRank, charRank, daysRank, jiafangRank, ketaoRank, avgRank
      // 同时保留 LPDEF 排名（用于雷达图对比）
      ranks: {
        // 统计数据排名（前端期望的 6 个字段）
        messageRank: ranks.messageRank || 50,
        charRank: ranks.charRank || 50,
        daysRank: ranks.daysRank || 50,
        jiafangRank: ranks.jiafangRank || 50,
        ketaoRank: ranks.ketaoRank || 50,
        avgRank: ranks.avgRank || 50,
        // LPDEF 维度排名（保留用于向后兼容和雷达图）
        L_rank: ranks.L_rank || 50,
        P_rank: ranks.P_rank || 50,
        D_rank: ranks.D_rank || 50,
        E_rank: ranks.E_rank || 50,
        F_rank: ranks.F_rank || 50,
      },
      // 3. 统计字段（解决 totalUsers: 0 的显示问题）
      totalUsers: totalUsers > 0 ? totalUsers : 1,
      
      // 4. 兼容性 data 对象（确保旧版逻辑不崩溃）
      data: {
        roast: roastText,
        type: personalityType,
        dimensions: dimensions,
        vibeIndex: vibeIndex,
        personalityName: personalityName,
        ranks: {
          messageRank: ranks.messageRank || 50,
          charRank: ranks.charRank || 50,
          daysRank: ranks.daysRank || 50,
          jiafangRank: ranks.jiafangRank || 50,
          ketaoRank: ranks.ketaoRank || 50,
          avgRank: ranks.avgRank || 50,
          L_rank: ranks.L_rank || 50,
          P_rank: ranks.P_rank || 50,
          D_rank: ranks.D_rank || 50,
          E_rank: ranks.E_rank || 50,
          F_rank: ranks.F_rank || 50,
        }
      }
    });
  } catch (error: any) {
    console.error('[Worker] /api/v2/analyze 错误:', error);
    const errorRanks = {
      messageRank: 50,
      charRank: 50,
      daysRank: 50,
      jiafangRank: 50,
      ketaoRank: 50,
      avgRank: 50,
      L_rank: 50,
      P_rank: 50,
      D_rank: 50,
      E_rank: 50,
      F_rank: 50,
    };
    return c.json({
      status: 'error',
      error: error.message || '未知错误',
      // 即使出错也返回 ranks 字段（默认值）
      ranks: errorRanks,
      // 兼容性 data 对象
      data: {
        ranks: errorRanks
      },
      totalUsers: 1,
    }, 500);
  }
});

/**
 * 路由：/api/random_prompt（答案之书）
 * 功能：从 D1 数据库随机获取一条答案之书记录
 */
app.get('/api/random_prompt', async (c) => {
  try {
    const env = c.env;
    
    if (!env.prompts_library) {
      return c.json({
        data: null,
        status: 'error',
        error: 'D1 数据库未配置',
      }, 500);
    }
    
    // 获取语言参数，支持多种格式
    const langParam = c.req.query('lang') || 'cn';
    const lang = ['en', 'en-US', 'en-GB'].includes(langParam) ? 'en' : 'cn';
    
    // 从 D1 数据库查询随机记录
    const result = await env.prompts_library.prepare(
      'SELECT id, content, note as author FROM answer_book WHERE lang = ? ORDER BY RANDOM() LIMIT 1'
    ).bind(lang).first();
    
    return c.json({
      data: result,
      status: 'success',
    });
  } catch (error: any) {
    console.error('[Worker] /api/random_prompt 错误:', error);
    return c.json({
      data: null,
      status: 'error',
      error: error.message || '未知错误',
    }, 500);
  }
});

/**
 * 路由：/api/analyze（兼容原有 worker.js）
 * 功能：接收分析数据，写入 Supabase，并返回多维排名
 * 注意：这是原有接口，保持向后兼容
 */
app.post('/api/analyze', async (c) => {
  try {
    const env = c.env;
    const body = await c.req.json();
    const clientIP = c.req.header('CF-Connecting-IP') || 'anonymous';
    
    if (!env.SUPABASE_URL || !env.SUPABASE_KEY) {
      return c.json({
        status: 'error',
        success: false,
        error: 'Supabase 环境变量未配置',
      }, 500);
    }
    
    // 1. 数据深度挖掘（兼容扁平化及嵌套结构）
    const sources = [body, body.statistics || {}, body.metadata || {}, body.stats || {}];
    const findVal = (keys: string[]): number => {
      for (const source of sources) {
        for (const key of keys) {
          if (source[key] !== undefined && source[key] !== null) {
            return Number(source[key]);
          }
        }
      }
      return 0;
    };
    
    // 字段映射（修复冲突）
    const ketao = findVal(['ketao', 'qingCount', 'politeCount']);
    const jiafang = findVal(['jiafang', 'buCount', 'negationCount']);
    const totalChars = findVal(['totalUserChars', 'totalChars', 'total_user_chars']);
    const userMessages = findVal(['userMessages', 'totalMessages', 'user_messages', 'messageCount']);
    const avgLength = findVal(['avgMessageLength', 'avgUserMessageLength', 'avg_length']);
    const days = findVal(['usageDays', 'days', 'workDays']);
    
    const dimensions = body.dimensions || body.stats?.dimensions || {};
    const vibeIndex = String(body.vibeIndex || body.stats?.vibeIndex || '00000');
    const personality = body.personalityType || body.personality || 'Unknown';
    
    // 2. 用户身份指纹优化
    let userIdentity: string;
    if (body.deviceId) {
      const msgUint8 = new TextEncoder().encode(body.deviceId);
      const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
      userIdentity = Array.from(new Uint8Array(hashBuffer))
        .map(b => b.toString(16).padStart(2, '0')).join('');
    } else {
      const signature = `${userMessages}_${totalChars}`;
      const msgUint8 = new TextEncoder().encode(signature);
      const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
      userIdentity = Array.from(new Uint8Array(hashBuffer))
        .map(b => b.toString(16).padStart(2, '0')).join('');
    }
    
    // 3. 写入 Supabase
    const payload = {
      user_identity: userIdentity,
      user_messages: userMessages,
      total_user_chars: totalChars,
      days: days,
      jiafang: jiafang,
      ketao: ketao,
      feihua: totalChars,
      avg_length: avgLength,
      vibe_index: vibeIndex,
      personality: personality,
      dimensions: dimensions,
      metadata: { ...body.metadata, ...body.statistics },
      updated_at: new Date().toISOString(),
    };
    
    const writeRes = await fetch(`${env.SUPABASE_URL}/rest/v1/cursor_stats`, {
      method: 'POST',
      headers: {
        'apikey': env.SUPABASE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates',
      },
      body: JSON.stringify(payload),
    });
    
    if (!writeRes.ok) {
      const errorText = await writeRes.text().catch(() => '无法读取错误信息');
      console.error('[Worker] ❌ 数据库写入失败:', {
        status: writeRes.status,
        statusText: writeRes.statusText,
        error: errorText,
        userIdentity: userIdentity,
        payload: payload,
      });
    } else {
      const writeData = await writeRes.json().catch(() => null);
      console.log('[Worker] ✅ 数据写入成功:', {
        userIdentity: userIdentity,
        method: Array.isArray(writeData) && writeData.length > 0 ? 'UPDATE' : 'INSERT',
      });
    }
    
    // 4. 并行计算排名 + 获取全局平均值
    const [totalUsersRes, globalRes] = await Promise.all([
      fetch(`${env.SUPABASE_URL}/rest/v1/global_stats_view?select=total_count`, {
        headers: { 
          'apikey': env.SUPABASE_KEY, 
          'Authorization': `Bearer ${env.SUPABASE_KEY}` 
        },
      }),
      fetch(`${env.SUPABASE_URL}/rest/v1/global_stats_view?select=*`, {
        headers: { 
          'apikey': env.SUPABASE_KEY, 
          'Authorization': `Bearer ${env.SUPABASE_KEY}` 
        },
      }),
    ]);
    
    let totalUsers = 1;
    let gRow: any = {};
    
    try {
      const totalData = await totalUsersRes.json();
      totalUsers = totalData[0]?.total_count || 1;
      if (totalUsers <= 0) {
        console.warn('[Worker] ⚠️ 总人数为 0 或无效，使用默认值 1');
        totalUsers = 1;
      }
    } catch (error) {
      console.error('[Worker] ❌ 获取总人数失败:', error);
      totalUsers = 1;
    }
    
    try {
      const globalData = await globalRes.json();
      gRow = globalData[0] || {};
    } catch (error) {
      console.error('[Worker] ❌ 获取全局平均值失败:', error);
      gRow = {};
    }
    
    // 5. 排名查询函数（带错误处理）
    const getRankCount = async (column: string, value: number): Promise<number> => {
      if (value <= 0 || !value || isNaN(value)) {
        console.warn(`[Worker] ⚠️ 排名查询跳过：无效值 (${column}=${value})`);
        return 0;
      }
      
      try {
        const numValue = Number(value);
        if (isNaN(numValue) || numValue <= 0) {
          console.warn(`[Worker] ⚠️ 排名查询跳过：值不是有效数字 (${column}=${value})`);
          return 0;
        }
        
        const queryUrl = `${env.SUPABASE_URL}/rest/v1/cursor_stats?${column}=lt.${numValue}&select=id`;
        
        const res = await fetch(queryUrl, {
          headers: {
            'apikey': env.SUPABASE_KEY,
            'Authorization': `Bearer ${env.SUPABASE_KEY}`,
            'Prefer': 'count=exact',
            'Range': '0-0',
          },
        });
        
        if (!res.ok) {
          const errorText = await res.text().catch(() => '无法读取错误信息');
          console.warn(`[Worker] ⚠️ 排名查询失败 (${column}):`, {
            status: res.status,
            statusText: res.statusText,
            error: errorText,
          });
          return 0;
        }
        
        const contentRange = res.headers.get('content-range');
        if (contentRange) {
          const parts = contentRange.split('/');
          if (parts.length === 2) {
            const count = parseInt(parts[1]);
            if (!isNaN(count) && count >= 0) {
              return count;
            }
          }
        }
        
        const data = await res.json().catch(() => null);
        if (Array.isArray(data)) {
          return data.length;
        }
        
        return 0;
      } catch (error: any) {
        console.error(`[Worker] ❌ 排名查询异常 (${column}):`, error);
        return 0;
      }
    };
    
    const [beatMsg, beatChar, beatDay, beatJia, beatKe, beatAvg] = await Promise.all([
      getRankCount('user_messages', userMessages),
      getRankCount('total_user_chars', totalChars),
      getRankCount('days', days),
      getRankCount('jiafang', jiafang),
      getRankCount('ketao', ketao),
      getRankCount('avg_length', avgLength),
    ]);
    
    const calcPct = (count: number): number => {
      if (totalUsers <= 0) return 0;
      const percent = Math.floor((count / totalUsers) * 100);
      return Math.min(99, Math.max(0, percent));
    };
    
    const ranks = {
      messageRank: calcPct(beatMsg),
      charRank: calcPct(beatChar),
      daysRank: calcPct(beatDay),
      jiafangRank: calcPct(beatJia),
      ketaoRank: calcPct(beatKe),
      avgRank: calcPct(beatAvg),
    };
    
    // 6. 返回完整数据包
    return c.json({
      status: 'success',
      success: true,
      totalUsers: totalUsers,
      ranking: beatMsg,
      rankPercent: ranks.messageRank,
      defeated: beatMsg,
      ranks: ranks,
      globalAverage: {
        L: parseFloat(gRow.avg_l || 50),
        P: parseFloat(gRow.avg_p || 50),
        D: parseFloat(gRow.avg_d || 50),
        E: parseFloat(gRow.avg_e || 50),
        F: parseFloat(gRow.avg_f || 50),
      },
      stats: { userMessages, totalChars, days, jiafang, ketao, avgLength },
    });
  } catch (error: any) {
    console.error('[Worker] /api/analyze 错误:', error);
    return c.json({
      status: 'error',
      success: false,
      error: error.message || '未知错误',
      timestamp: new Date().toISOString(),
    }, 500);
  }
});

/**
 * 【第二阶段新增】路由：/api/global-average
 * 功能：获取全局平均分，优先从 KV 读取，如果不存在或过期则从 Supabase 查询并缓存
 */
app.get('/api/global-average', async (c) => {
  try {
    const env = c.env;
    const defaultAverage = { L: 50, P: 50, D: 50, E: 50, F: 50 };

    // 如果没有配置 KV，直接查询 Supabase
    if (!env.STATS_STORE) {
      console.warn('[Worker] KV 未配置，直接查询 Supabase');
      return await fetchFromSupabase(env, defaultAverage, c);
    }

    // 尝试从 KV 读取缓存
    try {
      const cachedData = await env.STATS_STORE.get(KV_KEY_GLOBAL_AVERAGE, 'json');
      const lastUpdate = await env.STATS_STORE.get(KV_KEY_LAST_UPDATE);

      if (cachedData && lastUpdate) {
        const lastUpdateTime = parseInt(lastUpdate, 10);
        const now = Math.floor(Date.now() / 1000);
        const age = now - lastUpdateTime;

        // 如果缓存未过期（1小时内），直接返回
        if (age < KV_CACHE_TTL) {
          console.log(`[Worker] ✅ 从 KV 返回缓存数据（${age}秒前更新）`);
          return c.json({
            status: 'success',
            success: true, // 兼容字段
            globalAverage: cachedData,
            source: 'kv_cache',
            cachedAt: lastUpdateTime,
            age: age,
          });
        } else {
          console.log(`[Worker] ⚠️ KV 缓存已过期（${age}秒），重新查询 Supabase`);
        }
      }
    } catch (error) {
      console.warn('[Worker] KV 读取失败，降级到 Supabase:', error);
    }

    // KV 缓存不存在或已过期，从 Supabase 查询并更新 KV
    return await fetchFromSupabase(env, defaultAverage, c, true);
  } catch (error: any) {
    console.error('[Worker] /api/global-average 错误:', error);
    return c.json({
      status: 'error',
      error: error.message || '未知错误',
      globalAverage: { L: 50, P: 50, D: 50, E: 50, F: 50 },
    }, 500);
  }
});

/**
 * 【大盘功能】路由：/api/stats/dashboard
 * 功能：返回全网数据大盘的聚合数据
 * 注意：CORS 中间件已配置，支持 GET 方式访问
 */
app.get('/api/stats/dashboard', async (c) => {
  try {
    const env = c.env;
    console.log('[Worker] 开始处理 /api/stats/dashboard 请求');
    
    // 1. 获取总用户数（从 global_stats_view）
    let totalUsers = 0;
    if (env.SUPABASE_URL && env.SUPABASE_KEY) {
      try {
        const res = await fetch(`${env.SUPABASE_URL}/rest/v1/global_stats_view?select=total_count`, {
          headers: {
            'apikey': env.SUPABASE_KEY,
            'Authorization': `Bearer ${env.SUPABASE_KEY}`,
          },
        });
        if (res.ok) {
          const data = await res.json();
          totalUsers = data[0]?.total_count || 0;
          console.log('[Worker] 获取总用户数:', totalUsers);
        }
      } catch (error) {
        console.warn('[Worker] 获取总用户数失败:', error);
      }
    }

    // 2. 获取全局平均值（从 KV 的 GLOBAL_AVERAGES 键）
    // 添加 try-catch 保护，防止 KV 服务异常导致整个接口挂掉
    let averages = { L: 50, P: 50, D: 50, E: 50, F: 50 };
    if (env.STATS_STORE) {
      try {
        console.log('[Worker] 尝试从 KV 读取 GLOBAL_AVERAGES...');
        const cached = await env.STATS_STORE.get(KV_KEY_GLOBAL_AVERAGES, 'json');
        if (cached) {
          averages = cached;
          console.log('[Worker] ✅ 从 KV 读取 GLOBAL_AVERAGES 成功:', averages);
        } else {
          // 如果 GLOBAL_AVERAGES 不存在，尝试从 global_average 读取
          console.log('[Worker] GLOBAL_AVERAGES 不存在，尝试读取 global_average...');
          const fallback = await env.STATS_STORE.get(KV_KEY_GLOBAL_AVERAGE, 'json');
          if (fallback) {
            averages = fallback;
            console.log('[Worker] ✅ 从 KV 读取 global_average 成功:', averages);
          } else {
            console.log('[Worker] KV 中未找到平均值数据，使用默认值:', averages);
          }
        }
      } catch (error) {
        // KV 服务异常时使用默认值，不影响整个接口
        console.warn('[Worker] ⚠️ 从 KV 读取全局平均值失败，使用默认值:', error);
        averages = { L: 50, P: 50, D: 50, E: 50, F: 50 };
      }
    } else {
      console.log('[Worker] STATS_STORE 未配置，使用默认平均值');
    }

    // 3. 获取地理位置分布统计（按 ip_location 分组计数，Top 10）
    let locations: Array<{ name: string; count: number }> = [];
    if (env.SUPABASE_URL && env.SUPABASE_KEY) {
      try {
        console.log('[Worker] 开始查询地理位置分布...');
        // 查询所有非空的 ip_location 记录
        const res = await fetch(
          `${env.SUPABASE_URL}/rest/v1/user_analysis?select=ip_location&ip_location=not.is.null`,
          {
            headers: {
              'apikey': env.SUPABASE_KEY,
              'Authorization': `Bearer ${env.SUPABASE_KEY}`,
            },
          }
        );
        
        if (res.ok) {
          const data = await res.json();
          console.log('[Worker] 查询到地理位置记录数:', data.length);
          
          // 统计每个地理位置的出现次数
          const locationMap = new Map<string, number>();
          data.forEach((item: any) => {
            if (item.ip_location && item.ip_location !== '未知') {
              const count = locationMap.get(item.ip_location) || 0;
              locationMap.set(item.ip_location, count + 1);
            }
          });
          
          // 转换为数组并按数量排序，取前 10
          locations = Array.from(locationMap.entries())
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);
          
          console.log('[Worker] ✅ 地理位置分布统计完成，Top 10:', locations);
        } else {
          console.warn('[Worker] 查询地理位置分布失败，HTTP 状态:', res.status);
        }
      } catch (error) {
        console.warn('[Worker] 获取地理位置分布失败:', error);
      }
    }

    // 4. 获取最近动态（最近 5 条记录，仅保留 created_at 和 personality_type）
    let recent: Array<{ time: string; type: string }> = [];
    if (env.SUPABASE_URL && env.SUPABASE_KEY) {
      try {
        console.log('[Worker] 开始查询最近动态...');
        const res = await fetch(
          `${env.SUPABASE_URL}/rest/v1/user_analysis?select=created_at,personality_type&order=created_at.desc&limit=5`,
          {
            headers: {
              'apikey': env.SUPABASE_KEY,
              'Authorization': `Bearer ${env.SUPABASE_KEY}`,
            },
          }
        );
        
        if (res.ok) {
          const data = await res.json();
          recent = data.map((item: any) => ({
            time: item.created_at || new Date().toISOString(),
            type: item.personality_type || 'UNKNOWN',
          }));
          console.log('[Worker] ✅ 获取最近动态成功，记录数:', recent.length);
        } else {
          console.warn('[Worker] 查询最近动态失败，HTTP 状态:', res.status);
        }
      } catch (error) {
        console.warn('[Worker] 获取最近动态失败:', error);
      }
    }

    // 返回符合用户要求的格式
    const result = {
      status: 'success',
      totalUsers,
      averages,
      locations,
      recent,
    };

    console.log('[Worker] ✅ /api/stats/dashboard 处理完成:', {
      totalUsers,
      locationsCount: locations.length,
      recentCount: recent.length,
    });

    return c.json(result);
  } catch (error: any) {
    console.error('[Worker] ❌ /api/stats/dashboard 错误:', error);
    return c.json({
      status: 'error',
      error: error.message || '未知错误',
      totalUsers: 0,
      averages: { L: 50, P: 50, D: 50, E: 50, F: 50 },
      locations: [],
      recent: [],
    }, 500);
  }
});

/**
 * 【第二阶段新增】从 Supabase 查询全局平均值
 * @param env - 环境变量
 * @param defaultAverage - 默认平均值
 * @param c - Hono 上下文
 * @param updateKV - 是否更新 KV 缓存
 */
async function fetchFromSupabase(
  env: Env,
  defaultAverage: { L: number; P: number; D: number; E: number; F: number },
  c: any,
  updateKV: boolean = false
) {
  if (!env.SUPABASE_URL || !env.SUPABASE_KEY) {
    console.warn('[Worker] ⚠️ Supabase 环境变量未配置，返回默认值');
    return c.json({
      status: 'success',
      success: true, // 兼容字段
      globalAverage: defaultAverage,
      message: 'Supabase 环境变量未配置',
      source: 'default',
    });
  }

  try {
    const res = await fetch(`${env.SUPABASE_URL}/rest/v1/global_stats_view?select=*`, {
      headers: {
        'apikey': env.SUPABASE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_KEY}`,
      },
    });

    if (!res.ok) {
      throw new Error(`Supabase 查询失败: ${res.status}`);
    }

    const data = await res.json();
    const row = data[0] || {};

    const globalAverage = {
      L: parseFloat(row.avg_l || 50),
      P: parseFloat(row.avg_p || 50),
      D: parseFloat(row.avg_d || 50),
      E: parseFloat(row.avg_e || 50),
      F: parseFloat(row.avg_f || 50),
    };

    // 如果启用 KV 更新，写入缓存
    if (updateKV && env.STATS_STORE) {
      try {
        const now = Math.floor(Date.now() / 1000);
        await env.STATS_STORE.put(KV_KEY_GLOBAL_AVERAGE, JSON.stringify(globalAverage));
        await env.STATS_STORE.put(KV_KEY_LAST_UPDATE, now.toString());
        console.log('[Worker] ✅ 已更新 KV 缓存');
      } catch (error) {
        console.warn('[Worker] ⚠️ KV 写入失败:', error);
      }
    }

    return c.json({
      status: 'success',
      success: true, // 兼容字段
      globalAverage,
      totalUsers: parseInt(row.total_count || 0),
      source: updateKV ? 'supabase_and_kv' : 'supabase',
    });
  } catch (error: any) {
    console.error('[Worker] Supabase 查询失败:', error);
    return c.json({
      status: 'error',
      error: error.message || 'Supabase 查询失败',
      globalAverage: defaultAverage,
      source: 'error_fallback',
    }, 500);
  }
}

/**
 * 【第二阶段新增】汇总逻辑（提取为独立函数，便于复用）
 * 从 Supabase 查询全局平均值并存入 KV
 * @param env - 环境变量
 * @returns {Promise<Object>} 返回汇总结果
 */
async function performAggregation(env: Env): Promise<{ success: boolean; globalAverage?: any; error?: string }> {
  try {
    if (!env.SUPABASE_URL || !env.SUPABASE_KEY) {
      const error = 'Supabase 环境变量未配置';
      console.warn(`[Worker] ⚠️ ${error}`);
      return { success: false, error };
    }

    if (!env.STATS_STORE) {
      const error = 'KV 未配置';
      console.warn(`[Worker] ⚠️ ${error}`);
      return { success: false, error };
    }

    // 从 Supabase 查询全局平均值
    const res = await fetch(`${env.SUPABASE_URL}/rest/v1/global_stats_view?select=*`, {
      headers: {
        'apikey': env.SUPABASE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_KEY}`,
      },
    });

    if (!res.ok) {
      const errorText = await res.text().catch(() => '无法读取错误信息');
      throw new Error(`Supabase 查询失败: ${res.status}, ${errorText}`);
    }

    const data = await res.json();
    const row = data[0] || {};

    const globalAverage = {
      L: parseFloat(row.avg_l || 50),
      P: parseFloat(row.avg_p || 50),
      D: parseFloat(row.avg_d || 50),
      E: parseFloat(row.avg_e || 50),
      F: parseFloat(row.avg_f || 50),
    };

    // 写入 KV（确认使用正确的绑定名称 STATS_STORE）
    const now = Math.floor(Date.now() / 1000);
    await env.STATS_STORE.put(KV_KEY_GLOBAL_AVERAGE, JSON.stringify(globalAverage));
    await env.STATS_STORE.put(KV_KEY_LAST_UPDATE, now.toString());

    console.log('[Worker] ✅ 汇总任务完成，已写入 KV:', {
      globalAverage,
      timestamp: now,
      kvKeys: {
        average: KV_KEY_GLOBAL_AVERAGE,
        lastUpdate: KV_KEY_LAST_UPDATE
      }
    });

    return { success: true, globalAverage };
  } catch (error: any) {
    const errorMessage = error.message || '未知错误';
    console.error('[Worker] ❌ 汇总任务失败:', errorMessage);
    return { success: false, error: errorMessage };
  }
}

/**
 * 【第二阶段新增】定期汇总任务（Cron Trigger）
 * 每小时执行一次，从 Supabase 汇总平均分并存入 KV
 * 注意：需要在 wrangler.toml 中配置 cron_triggers
 */
export async function scheduled(event: ScheduledEvent, env: Env, ctx: any) {
  console.log('[Worker] 开始定期汇总任务（Cron Trigger）...', {
    type: event.type,
    scheduledTime: new Date(event.scheduledTime * 1000).toISOString(),
    cron: event.cron,
  });
  
  const result = await performAggregation(env);
  
  if (result.success) {
    console.log('[Worker] ✅ 定期汇总任务完成');
  } else {
    console.error('[Worker] ❌ 定期汇总任务失败:', result.error);
  }
}

/**
 * 路由：手动触发汇总任务（用于测试）
 * 功能：手动触发汇总逻辑，从 Supabase 获取数据并存入 KV
 * 访问方式：GET /cdn-cgi/handler/scheduled
 */
app.get('/cdn-cgi/handler/scheduled', async (c) => {
  try {
    const env = c.env;
    console.log('[Worker] 手动触发汇总任务...');
    
    const result = await performAggregation(env);
    
    if (result.success) {
      return c.json({
        status: 'success',
        message: '汇总任务执行成功',
        globalAverage: result.globalAverage,
        timestamp: new Date().toISOString(),
      });
    } else {
      return c.json({
        status: 'error',
        error: result.error || '汇总任务执行失败',
        timestamp: new Date().toISOString(),
      }, 500);
    }
  } catch (error: any) {
    console.error('[Worker] 手动触发汇总任务失败:', error);
    return c.json({
      status: 'error',
      error: error.message || '未知错误',
      timestamp: new Date().toISOString(),
    }, 500);
  }
});

/**
 * 路由：存活检查 & 状态（兼容原有 worker.js）
 * 功能：返回总用户数和 API 状态
 */
app.get('/', async (c) => {
  try {
    const env = c.env;
    
    // 如果配置了 Supabase，查询总用户数
    if (env.SUPABASE_URL && env.SUPABASE_KEY) {
      try {
        const res = await fetch(`${env.SUPABASE_URL}/rest/v1/global_stats_view?select=total_count`, {
          headers: { 
            'apikey': env.SUPABASE_KEY, 
            'Authorization': `Bearer ${env.SUPABASE_KEY}` 
          }
        });
        const data = await res.json();
        return c.json({
          status: 'success',
          totalUsers: data[0]?.total_count || 0,
          message: 'Cursor Vibe API is active',
          endpoints: {
            analyze: '/api/analyze',
            v2Analyze: '/api/v2/analyze',
            globalAverage: '/api/global-average',
            randomPrompt: '/api/random_prompt',
          },
        });
      } catch (error) {
        console.warn('[Worker] 获取总用户数失败:', error);
      }
    }
    
    // 降级：返回基本信息
    return c.json({
      status: 'success',
      message: 'Vibe Codinger Worker API v2.0',
      endpoints: {
        analyze: '/api/analyze',
        v2Analyze: '/api/v2/analyze',
        globalAverage: '/api/global-average',
        randomPrompt: '/api/random_prompt',
      },
    });
  } catch (error: any) {
    return c.json({
      status: 'error',
      error: error.message || '未知错误',
    }, 500);
  }
});

export default {
  fetch: app.fetch, // Hono 完美支持这种简写
  scheduled: scheduled // 必须显式导出这个函数，否则 Cron 触发器不会生效
};