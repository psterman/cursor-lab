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
 * 路由：/api/v2/analyze (全量重构版本)
 * 功能：接收聊天数据，计算 5 维度得分，返回完整分析结果（包括文案）
 * 核心特性：
 * 1. 身份匿名化：统一将 user_name 设为 '匿名受害者'
 * 2. 全量维度指标：包含五维分、衍生排名、基础统计、特征编码
 * 3. 异步存储：使用 waitUntil + merge-duplicates 策略
 * 4. 地理与环境：支持 IP 定位和语言识别
 */
app.post('/api/v2/analyze', async (c) => {
  try {
    const body = await c.req.json();
    // 【地理与环境】使用 body.lang 或默认 'zh-CN'
    const lang = body.lang || 'zh-CN';
    const { chatData } = body;

    // 【防御性编程】检测旧版前端数据格式
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
        dimensions: defaultDimensions,
        roastText: defaultRoast,
        personalityName: defaultPersonalityName,
        vibeIndex: '00000',
        personalityType: 'UNKNOWN',
        lpdef: 'L0P0D0E0F0',
        statistics: {
          totalMessages: 0,
          avgMessageLength: 0,
          totalChars: 0,
        },
        ranks: defaultRanks,
        totalUsers: 1,
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

    // 【特征编码】生成索引和人格类型
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

    // 【基础统计】计算统计信息
    const totalMessages = userMessages.length;
    const totalChars = userMessages.reduce((sum, msg) => sum + (msg.text?.length || 0), 0);
    const avgMessageLength = Math.round(totalChars / totalMessages || 0);

    // 【地理与环境】从请求头获取 IP 国家信息
    const ipLocation = c.req.header('cf-ipcountry') || 'Unknown';
    const normalizedIpLocation = (ipLocation && ipLocation.trim() && ipLocation !== 'XX') 
      ? ipLocation.toUpperCase() 
      : 'Unknown';

    // 【计算排名数据】从 Supabase 查询真实排名
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

    let totalUsers = 1;
    if (env.SUPABASE_URL && env.SUPABASE_KEY) {
      try {
        // 并行获取总用户数和全局统计数据
        const [totalUsersRes] = await Promise.all([
          fetch(`${env.SUPABASE_URL}/rest/v1/global_stats_v3_view?select=total_count`, {
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
          const [beatL, beatP, beatD, beatE, beatF, beatMsg, beatChar] = await Promise.all([
            getRankCount('l', dimensions.L),
            getRankCount('p', dimensions.P),
            getRankCount('d', dimensions.D),
            getRankCount('e', dimensions.E),
            getRankCount('f', dimensions.F),
            getRankCount('total_messages', totalMessages),
            getRankCount('total_chars', totalChars),
          ]);

          // 计算百分比排名
          const calcPct = (count: number): number => {
            if (totalUsers <= 0) return 50;
            const percent = Math.floor((count / totalUsers) * 100);
            return Math.min(99, Math.max(0, percent));
          };

          // 更新 ranks 对象（使用实际统计数据计算排名）
          ranks = {
            messageRank: calcPct(beatMsg),
            charRank: calcPct(beatChar),
            daysRank: calcPct(beatD),
            jiafangRank: calcPct(beatE),
            ketaoRank: calcPct(beatF),
            avgRank: Math.floor((calcPct(beatMsg) + calcPct(beatChar) + calcPct(beatD) + calcPct(beatE) + calcPct(beatF)) / 5),
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

    // 构建返回结果
    const result = {
      status: 'success',
      dimensions: dimensions,
      roastText: roastText,
      personalityName: personalityName,
      vibeIndex: vibeIndex,
      personalityType: personalityType,
      lpdef: lpdef,
      statistics: {
        totalMessages,
        avgMessageLength,
        totalChars,
      },
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
      },
      totalUsers: totalUsers > 0 ? totalUsers : 1,
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
      },
      personality: {
        type: personalityType,
      }
    };

    // 【异步存储】使用 waitUntil 异步写入 Supabase
    if (env.SUPABASE_URL && env.SUPABASE_KEY) {
      try {
        const executionCtx = c.executionCtx;
        if (executionCtx && typeof executionCtx.waitUntil === 'function') {
          // 【唯一冲突标识】生成 fingerprint 哈希
          const fingerprintSource = `${lpdef}${totalChars}${totalMessages}`;
          const fingerprintUint8 = new TextEncoder().encode(fingerprintSource);
          const fingerprintBuffer = await crypto.subtle.digest('SHA-256', fingerprintUint8);
          const fingerprint = Array.from(new Uint8Array(fingerprintBuffer))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');

          // 【全量维度指标】构建完整的数据负载
          const payload = {
            // 【身份匿名化】统一设为 '匿名受害者'
            user_name: '匿名受害者',
            // 【五维分】来自 result.dimensions
            l: dimensions.L || 0,
            p: dimensions.P || 0,
            d: dimensions.D || 0,
            e: dimensions.E || 0,
            f: dimensions.F || 0,
            dimensions: dimensions, // 保留完整 JSONB 格式
            // 【衍生排名】来自 result.ranks
            jiafang_rank: ranks.jiafangRank || 50,
            ketao_rank: ranks.ketaoRank || 50,
            days_rank: ranks.daysRank || 50,
            avg_rank: ranks.avgRank || 50,
            // 【基础统计】
            total_messages: totalMessages,
            total_chars: totalChars,
            avg_message_length: avgMessageLength,
            // 【特征编码】
            lpdef: lpdef,
            vibe_index: vibeIndex,
            personality_type: personalityType,
            // 【地理与环境】
            ip_location: normalizedIpLocation,
            lang: lang,
            // 【唯一冲突标识】
            fingerprint: fingerprint,
            // 时间戳
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };

          console.log(`[DB] 准备写入数据（匿名受害者）:`, {
            fingerprint,
            lpdef,
            total_messages: totalMessages,
            total_chars: totalChars,
            ip_location: normalizedIpLocation,
            lang,
          });

          // 【异步存储】使用 waitUntil + merge-duplicates 策略
          executionCtx.waitUntil(
            fetch(`${env.SUPABASE_URL}/rest/v1/user_analysis?on_conflict=fingerprint`, {
              method: 'POST',
              headers: {
                'apikey': env.SUPABASE_KEY,
                'Authorization': `Bearer ${env.SUPABASE_KEY}`,
                'Content-Type': 'application/json',
                // 这里的 resolution=merge-duplicates 配合 URL 上的 on_conflict 才会生效
                'Prefer': 'resolution=merge-duplicates,return=minimal', 
              },
              body: JSON.stringify([payload]),
            })
              .then(res => {
                console.log(`[DB] 写入完成，状态码: ${res.status}`);
                if (!res.ok) {
                  return res.text().then(errorText => {
                    console.error('[DB] 写入失败:', {
                      status: res.status,
                      statusText: res.statusText,
                      error: errorText,
                      fingerprint,
                      payload,
                    });
                  });
                } else {
                  console.log('[DB] ✅ 数据已成功写入 Supabase:', {
                    fingerprint,
                    lpdef,
                    ip_location: normalizedIpLocation,
                  });
                }
              })
              .catch(error => {
                console.error('[DB] 写入异常:', error);
              })
          );
        } else {
          console.warn('[DB] ⚠️ executionCtx.waitUntil 不可用，跳过数据库写入');
        }
      } catch (error) {
        // 异常防御：防止后台任务报错影响主进程
        console.warn('[DB] ⚠️ 数据库写入逻辑异常，跳过写入:', error);
      }
    }

    // 返回结果（不阻塞数据库写入）
    return c.json(result);
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
      ranks: errorRanks,
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
    
    // 3. 写入 Supabase - 直接写入 user_analysis 表
    // 【字段对齐】确保字段名与 user_analysis 表定义完全一致
    // 参考 /api/v2/analyze 中的字段映射
    // 【调试日志】在写入前添加调试日志
    console.log('[Debug] 准备写入 user_analysis:', JSON.stringify(body, null, 2));
    
    const payload = {
      user_identity: userIdentity,
      l: dimensions.L || 0,        // 小写字段映射
      p: dimensions.P || 0,
      d: dimensions.D || 0,
      e: dimensions.E || 0,
      f: dimensions.F || 0,
      dimensions: dimensions,      // 同时保留完整的 JSONB 格式
      vibe_index: vibeIndex,
      personality_type: personality, // 注意：user_analysis 表使用 personality_type，不是 personality
      total_messages: userMessages,  // 注意：user_analysis 表使用 total_messages，不是 user_messages
      total_chars: totalChars,      // 注意：user_analysis 表使用 total_chars，不是 total_user_chars
      ip_location: clientIP !== 'anonymous' ? clientIP : '未知', // 从请求头获取 IP
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    
    const insertUrl = `${env.SUPABASE_URL}/rest/v1/user_analysis`;
    // 【执行 Supabase 插入】Body 必须是数组格式
    const insertBody = JSON.stringify([payload]);
    
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
      payload: payload,
    });
    
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
    
    if (!writeRes.ok) {
      const errorText = await writeRes.text().catch(() => '无法读取错误信息');
      console.error('[Worker] ❌ 保存到 user_analysis 表失败:', {
        status: writeRes.status,
        statusText: writeRes.statusText,
        error: errorText,
        userIdentity: userIdentity,
        payload: payload,
        requestBody: insertBody,
      });
    } else {
      console.log('[Worker] ✅ 分析数据已保存到 user_analysis 表', {
        userIdentity,
        ipLocation: payload.ip_location,
        vibeIndex,
        personalityType: personality,
        dimensions: { l: dimensions.L, p: dimensions.P, d: dimensions.D, e: dimensions.E, f: dimensions.F },
      });
    }
    
    // 4. 并行计算排名 + 获取全局平均值
    const [totalUsersRes, globalRes] = await Promise.all([
      fetch(`${env.SUPABASE_URL}/rest/v1/global_stats_v3_view?select=total_count`, {
        headers: { 
          'apikey': env.SUPABASE_KEY, 
          'Authorization': `Bearer ${env.SUPABASE_KEY}` 
        },
      }),
      fetch(`${env.SUPABASE_URL}/rest/v1/global_stats_v3_view?select=*`, {
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
        
        // 【移除 cursor_stats 查询】改为查询 user_analysis 表
        // 字段名映射：user_messages -> total_messages, total_user_chars -> total_chars
        let mappedColumn = column;
        if (column === 'user_messages') {
          mappedColumn = 'total_messages';
        } else if (column === 'total_user_chars') {
          mappedColumn = 'total_chars';
        } else if (column === 'days' || column === 'jiafang' || column === 'ketao' || column === 'avg_length') {
          // 这些字段在 user_analysis 表中不存在，跳过排名查询
          console.warn(`[Worker] ⚠️ 字段 ${column} 在 user_analysis 表中不存在，跳过排名查询`);
          return 0;
        }
        
        const queryUrl = `${env.SUPABASE_URL}/rest/v1/user_analysis?${mappedColumn}=lt.${numValue}&select=id`;
        
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
    
    // 【字段映射】user_analysis 表的字段名与 cursor_stats 不同
    // user_messages -> total_messages
    // total_user_chars -> total_chars
    // days, jiafang, ketao, avg_length 在 user_analysis 表中不存在，使用维度分进行排名
    const [beatMsg, beatChar, beatL, beatP, beatD, beatE, beatF] = await Promise.all([
      getRankCount('total_messages', userMessages),  // 映射到 total_messages
      getRankCount('total_chars', totalChars),        // 映射到 total_chars
      getRankCount('l', dimensions.L || 0),           // 使用维度分 L
      getRankCount('p', dimensions.P || 0),           // 使用维度分 P
      getRankCount('d', dimensions.D || 0),           // 使用维度分 D
      getRankCount('e', dimensions.E || 0),           // 使用维度分 E
      getRankCount('f', dimensions.F || 0),           // 使用维度分 F
    ]);
    
    const calcPct = (count: number): number => {
      if (totalUsers <= 0) return 0;
      const percent = Math.floor((count / totalUsers) * 100);
      return Math.min(99, Math.max(0, percent));
    };
    
    // 【排名计算】使用维度分进行排名，替代不存在的字段
    const ranks = {
      messageRank: calcPct(beatMsg),
      charRank: calcPct(beatChar),
      daysRank: calcPct(beatD),      // 使用维度 D 替代 days
      jiafangRank: calcPct(beatE),   // 使用维度 E 替代 jiafang
      ketaoRank: calcPct(beatF),     // 使用维度 F 替代 ketao
      avgRank: Math.floor((calcPct(beatMsg) + calcPct(beatChar) + calcPct(beatL) + calcPct(beatP) + calcPct(beatD) + calcPct(beatE) + calcPct(beatF)) / 7),
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
 * 重构：确保返回结构100%完整，包含所有必需字段
 */
app.get('/api/global-average', async (c) => {
  try {
    // 【强制置顶判断】将 force_refresh 判断放在函数第一行
    const forceRefresh = c.req.query('force_refresh') === 'true';
    
    const env = c.env;
    
    // 强制补全 dimensions 字典（前端雷达图显示文字的关键）
    const defaultDimensions = {
      L: { label: '逻辑力' },
      P: { label: '耐心值' },
      D: { label: '细腻度' },
      E: { label: '情绪化' },
      F: { label: '频率感' }
    };
    const defaultAverage = { L: 50, P: 50, D: 50, E: 50, F: 50 };

    // 【强制刷新逻辑】如果是 true，必须跳过任何 KV 读取逻辑，直接进入数据库查询
    if (forceRefresh) {
      console.log('[Worker] 🔄 强制刷新，跳过 KV 缓存');
      console.log('--- 正在穿透缓存获取最新数据 ---');
      return await fetchFromSupabase(env, defaultAverage, defaultDimensions, c, true);
    }

    // 如果没有配置 KV，直接查询 Supabase
    if (!env.STATS_STORE) {
      console.warn('[Worker] KV 未配置，直接查询 Supabase');
      console.log('--- 正在穿透缓存获取最新数据 ---');
      return await fetchFromSupabase(env, defaultAverage, defaultDimensions, c, false);
    }

    // 尝试从 KV 读取缓存
    try {
      const cachedData = await env.STATS_STORE.get(KV_KEY_GLOBAL_AVERAGE, 'json');
      const lastUpdate = await env.STATS_STORE.get(KV_KEY_LAST_UPDATE);

      // 【缓存校验升级】必须检查 if (cachedData && cachedData.dimensions)
      // 如果 dimensions 缺失，哪怕不是强制刷新，也必须废弃该缓存去查数据库
      if (cachedData && lastUpdate) {
        // 检查缓存是否包含 dimensions 字段
        if (!cachedData.dimensions) {
          console.warn('[Worker] ⚠️ 检测到旧版缓存数据（缺少 dimensions），忽略缓存，重新查询');
          console.log('--- 正在穿透缓存获取最新数据 ---');
          return await fetchFromSupabase(env, defaultAverage, defaultDimensions, c, true);
        }

        const lastUpdateTime = parseInt(lastUpdate, 10);
        const now = Math.floor(Date.now() / 1000);
        const age = now - lastUpdateTime;

        // 如果缓存未过期（1小时内），需要获取其他统计数据
        if (age < KV_CACHE_TTL) {
          console.log(`[Worker] ✅ 从 KV 返回缓存数据（${age}秒前更新）`);
          
          // 即使使用缓存，也需要获取其他统计数据（最近受害者、地理位置等）
          // 这些数据变化频繁，不适合缓存
          if (env.SUPABASE_URL && env.SUPABASE_KEY) {
            try {
              // 并行查询统计数据
              const [totalUsersRes, recentVictimsRes, allLocationsRes, dashboardSummaryRes] = await Promise.all([
                // 总用户数
                fetch(`${env.SUPABASE_URL}/rest/v1/global_stats_v3_view?select=total_count`, {
                  headers: {
                    'apikey': env.SUPABASE_KEY,
                    'Authorization': `Bearer ${env.SUPABASE_KEY}`,
                  },
                }),
                // 最近受害者（最新的 5 条记录）
                fetch(`${env.SUPABASE_URL}/rest/v1/user_analysis?select=personality_type,ip_location,created_at&order=created_at.desc&limit=5`, {
                  headers: {
                    'apikey': env.SUPABASE_KEY,
                    'Authorization': `Bearer ${env.SUPABASE_KEY}`,
                  },
                }),
                // 所有地理位置（用于统计城市数和热力排行）
                fetch(`${env.SUPABASE_URL}/rest/v1/user_analysis?select=ip_location&ip_location=not.is.null`, {
                  headers: {
                    'apikey': env.SUPABASE_KEY,
                    'Authorization': `Bearer ${env.SUPABASE_KEY}`,
                  },
                }),
                // 汇总统计数据（从 dashboard_summary_view 获取 total_words）
                fetch(`${env.SUPABASE_URL}/rest/v1/dashboard_summary_view?select=total_words`, {
                  headers: {
                    'apikey': env.SUPABASE_KEY,
                    'Authorization': `Bearer ${env.SUPABASE_KEY}`,
                  },
                }),
              ]);

              // 处理总用户数
              let totalUsers = 1;
              if (totalUsersRes.ok) {
                const totalData = await totalUsersRes.json();
                totalUsers = totalData[0]?.total_count || 1;
                if (totalUsers <= 0) {
                  totalUsers = 1;
                }
              }

              // 处理最近受害者
              // 确保 recentVictims 数组中包含 name 字段
              let recentVictims: Array<{ name: string; type: string; location: string; time: string }> = [];
              if (recentVictimsRes.ok) {
                try {
                  const victimsData = await recentVictimsRes.json();
                  recentVictims = victimsData.map((item: any, index: number) => {
                    const type = item.personality_type || 'UNKNOWN';
                    const location = item.ip_location || '未知';
                    // 如果数据库没有 user_name，根据 type 生成一个临时名称
                    const name = item.user_name || item.name || `匿名受害者${index + 1}`;
                    return {
                      name: name,
                      type: type,
                      location: location,
                      time: item.created_at || new Date().toISOString(),
                    };
                  });
                } catch (error) {
                  console.warn('[Worker] ⚠️ 解析最近受害者数据失败:', error);
                }
              }

              // 处理地理位置统计
              // 将 locationRank 中的字段统一为前端要求的格式：{ name: string, value: number }
              let cityCount = 0;
              let locationRank: Array<{ name: string; value: number }> = [];
              
              if (allLocationsRes.ok) {
                try {
                  const locationsData = await allLocationsRes.json();
                  const locationMap = new Map<string, number>();
                  locationsData.forEach((item: any) => {
                    if (item.ip_location && item.ip_location !== '未知') {
                      const count = locationMap.get(item.ip_location) || 0;
                      locationMap.set(item.ip_location, count + 1);
                    }
                  });
                  cityCount = locationMap.size;
                  // 映射为前端要求的格式：{ name: location, value: count }
                  locationRank = Array.from(locationMap.entries())
                    .map(([location, count]) => ({ name: location, value: count }))
                    .sort((a, b) => b.value - a.value)
                    .slice(0, 5);
                } catch (error) {
                  console.warn('[Worker] ⚠️ 解析地理位置数据失败:', error);
                }
              }

              // 处理吐槽字数统计（从 dashboard_summary_view 获取 total_words）
              let totalRoastWords = 0;
              if (dashboardSummaryRes.ok) {
                try {
                  const summaryData = await dashboardSummaryRes.json();
                  const summaryRow = summaryData[0] || {};
                  totalRoastWords = parseInt(summaryRow.total_words || 0);
                  console.log('[Worker] ✅ 从 dashboard_summary_view 获取 total_words:', totalRoastWords);
                } catch (error) {
                  console.warn('[Worker] ⚠️ 解析 dashboard_summary_view 数据失败:', error);
                  // 降级方案：如果 dashboard_summary_view 不存在或失败，尝试查询所有记录并计算
                  try {
                    const roastWordsRes = await fetch(`${env.SUPABASE_URL}/rest/v1/user_analysis?select=roast_text`, {
                      headers: {
                        'apikey': env.SUPABASE_KEY,
                        'Authorization': `Bearer ${env.SUPABASE_KEY}`,
                      },
                    });
                    
                    if (roastWordsRes.ok) {
                      const roastData = await roastWordsRes.json();
                      totalRoastWords = roastData.reduce((sum: number, item: any) => {
                        const text = item.roast_text || '';
                        return sum + text.length;
                      }, 0);
                      console.log('[Worker] ✅ 降级方案：从 user_analysis 计算 totalRoastWords:', totalRoastWords);
                    }
                  } catch (fallbackError) {
                    console.warn('[Worker] ⚠️ 降级方案也失败:', fallbackError);
                  }
                }
              } else {
                console.warn('[Worker] ⚠️ dashboard_summary_view 查询失败，HTTP 状态:', dashboardSummaryRes.status);
                // 降级方案：如果 dashboard_summary_view 不存在，尝试查询所有记录并计算
                try {
                  const roastWordsRes = await fetch(`${env.SUPABASE_URL}/rest/v1/user_analysis?select=roast_text`, {
                    headers: {
                      'apikey': env.SUPABASE_KEY,
                      'Authorization': `Bearer ${env.SUPABASE_KEY}`,
                    },
                  });
                  
                  if (roastWordsRes.ok) {
                    const roastData = await roastWordsRes.json();
                    totalRoastWords = roastData.reduce((sum: number, item: any) => {
                      const text = item.roast_text || '';
                      return sum + text.length;
                    }, 0);
                    console.log('[Worker] ✅ 降级方案：从 user_analysis 计算 totalRoastWords:', totalRoastWords);
                  }
                } catch (fallbackError) {
                  console.warn('[Worker] ⚠️ 降级方案也失败:', fallbackError);
                }
              }

              // 【核心重构】确保返回的 JSON 包含所有前端需要的 Key，严格按照用户要求的格式
              // 从缓存数据中提取 globalAverage（如果缓存包含 dimensions，需要分离出来）
              // 缓存数据格式可能是 { L: 68, P: 72, ..., dimensions: {...} } 或 { L: 68, P: 72, ... }
              let cachedGlobalAverage: { L: number; P: number; D: number; E: number; F: number };
              if (cachedData.dimensions) {
                // 新版本缓存：包含 dimensions，需要分离
                cachedGlobalAverage = {
                  L: cachedData.L || 50,
                  P: cachedData.P || 50,
                  D: cachedData.D || 50,
                  E: cachedData.E || 50,
                  F: cachedData.F || 50,
                };
              } else {
                // 旧版本缓存：不包含 dimensions，直接使用（理论上不会到这里，因为前面已经检查过）
                cachedGlobalAverage = cachedData;
              }
              
              const finalTotalUsers = totalUsers || 1;
              
              // 【硬编码注入】在返回之前，手动将 dimensions 字典注入到 JSON 中，确保万无一失
              // 统一使用 globalAverage 字段（不要用 averages）
              const responseData = {
                status: 'success',
                success: true,
                // 1. 维度分（统一使用 globalAverage）
                globalAverage: cachedGlobalAverage,
                // 2. 参与人数 (必须有，不然卡片显示 0)
                totalUsers: finalTotalUsers,
                // 3. 标签定义 (必须有，不然雷达图不显示文字) - 硬编码注入
                dimensions: {
                  L: { label: '逻辑力' },
                  P: { label: '耐心值' },
                  D: { label: '细腻度' },
                  E: { label: '情绪化' },
                  F: { label: '频率感' }
                },
                // 4. 兼容性包装 (防止前端去 .data 路径下找) - 双重包装
                data: {
                  globalAverage: cachedGlobalAverage,
                  totalUsers: finalTotalUsers,
                  dimensions: {
                    L: { label: '逻辑力' },
                    P: { label: '耐心值' },
                    D: { label: '细腻度' },
                    E: { label: '情绪化' },
                    F: { label: '频率感' }
                  },
                },
                // 5. 其他统计数据
                totalRoastWords: totalRoastWords,
                cityCount: cityCount,
                locationRank: locationRank,
                recentVictims: recentVictims,
                source: 'kv_cache',
                cachedAt: lastUpdateTime,
                age: age,
              };

              // 【调试日志】在返回前输出完整数据，方便调试
              console.log('[Debug] 最终发送数据:', JSON.stringify(responseData, null, 2));
              console.log('[Worker] 发送给前端的数据:', JSON.stringify(responseData, null, 2));
              console.log('[Worker] ✅ 从 KV 缓存返回完整数据:', {
                hasGlobalAverage: !!responseData.globalAverage,
                hasDimensions: !!responseData.dimensions,
                hasTotalUsers: !!responseData.totalUsers,
                hasData: !!responseData.data,
                totalUsers: responseData.totalUsers,
                globalAverage: responseData.globalAverage,
                source: responseData.source,
              });

              return c.json(responseData);
            } catch (error) {
              console.warn('[Worker] ⚠️ 获取统计数据失败，使用默认值:', error);
              // 降级：只返回缓存的平均值（但必须包含所有必需字段）
              let cachedGlobalAverage: { L: number; P: number; D: number; E: number; F: number };
              if (cachedData.dimensions) {
                // 新版本缓存：包含 dimensions，需要分离
                cachedGlobalAverage = {
                  L: cachedData.L || 50,
                  P: cachedData.P || 50,
                  D: cachedData.D || 50,
                  E: cachedData.E || 50,
                  F: cachedData.F || 50,
                };
              } else {
                // 旧版本缓存：不包含 dimensions，直接使用（理论上不会到这里）
                cachedGlobalAverage = cachedData;
              }
              
              // 【硬编码注入】在返回之前，手动将 dimensions 字典注入到 JSON 中，确保万无一失
              // 统一使用 globalAverage 字段（不要用 averages）
              const responseData = {
                status: 'success',
                success: true,
                // 1. 维度分（统一使用 globalAverage）
                globalAverage: cachedGlobalAverage,
                // 2. 参与人数 (必须有，不然卡片显示 0)
                totalUsers: 1,
                // 3. 标签定义 (必须有，不然雷达图不显示文字) - 硬编码注入
                dimensions: {
                  L: { label: '逻辑力' },
                  P: { label: '耐心值' },
                  D: { label: '细腻度' },
                  E: { label: '情绪化' },
                  F: { label: '频率感' }
                },
                // 4. 兼容性包装 (防止前端去 .data 路径下找) - 双重包装
                data: {
                  globalAverage: cachedGlobalAverage,
                  totalUsers: 1,
                  dimensions: {
                    L: { label: '逻辑力' },
                    P: { label: '耐心值' },
                    D: { label: '细腻度' },
                    E: { label: '情绪化' },
                    F: { label: '频率感' }
                  },
                },
                // 5. 其他统计数据（默认值）
                totalRoastWords: 0,
                cityCount: 0,
                locationRank: [],
                recentVictims: [],
                source: 'kv_cache',
                cachedAt: lastUpdateTime,
                age: age,
              };

              // 【调试日志】在返回前输出完整数据，方便调试
              console.log('[Debug] 最终发送数据:', JSON.stringify(responseData, null, 2));
              console.log('[Worker] 发送给前端的数据:', JSON.stringify(responseData, null, 2));
              console.log('[Worker] ⚠️ 降级返回（统计数据获取失败）:', {
                hasGlobalAverage: !!responseData.globalAverage,
                hasDimensions: !!responseData.dimensions,
                hasTotalUsers: !!responseData.totalUsers,
                hasData: !!responseData.data,
                globalAverage: responseData.globalAverage,
                source: responseData.source,
              });

              return c.json(responseData);
            }
          } else {
            // 没有 Supabase 配置，返回默认值（但必须包含所有必需字段）
            let cachedGlobalAverage: { L: number; P: number; D: number; E: number; F: number };
            if (cachedData.dimensions) {
              // 新版本缓存：包含 dimensions，需要分离
              cachedGlobalAverage = {
                L: cachedData.L || 50,
                P: cachedData.P || 50,
                D: cachedData.D || 50,
                E: cachedData.E || 50,
                F: cachedData.F || 50,
              };
            } else {
              // 旧版本缓存：不包含 dimensions，直接使用（理论上不会到这里）
              cachedGlobalAverage = cachedData;
            }
            
            // 【硬编码注入】在返回之前，手动将 dimensions 字典注入到 JSON 中，确保万无一失
            // 统一使用 globalAverage 字段（不要用 averages）
            const responseData = {
              status: 'success',
              success: true,
              // 1. 维度分（统一使用 globalAverage）
              globalAverage: cachedGlobalAverage,
              // 2. 参与人数 (必须有，不然卡片显示 0)
              totalUsers: 1,
              // 3. 标签定义 (必须有，不然雷达图不显示文字) - 硬编码注入
              dimensions: {
                L: { label: '逻辑力' },
                P: { label: '耐心值' },
                D: { label: '细腻度' },
                E: { label: '情绪化' },
                F: { label: '频率感' }
              },
              // 4. 兼容性包装 (防止前端去 .data 路径下找) - 双重包装
              data: {
                globalAverage: cachedGlobalAverage,
                totalUsers: 1,
                dimensions: {
                  L: { label: '逻辑力' },
                  P: { label: '耐心值' },
                  D: { label: '细腻度' },
                  E: { label: '情绪化' },
                  F: { label: '频率感' }
                },
              },
              // 5. 其他统计数据（默认值）
              totalRoastWords: 0,
              cityCount: 0,
              locationRank: [],
              recentVictims: [],
              source: 'kv_cache',
              cachedAt: lastUpdateTime,
              age: age,
            };

            // 【调试日志】在返回前输出完整数据，方便调试
            console.log('[Debug] 最终发送数据:', JSON.stringify(responseData, null, 2));
            console.log('[Worker] 发送给前端的数据:', JSON.stringify(responseData, null, 2));
            console.log('[Worker] ⚠️ 无 Supabase 配置，返回默认值:', {
              hasGlobalAverage: !!responseData.globalAverage,
              hasDimensions: !!responseData.dimensions,
              hasTotalUsers: !!responseData.totalUsers,
              hasData: !!responseData.data,
              globalAverage: responseData.globalAverage,
              source: responseData.source,
            });

            return c.json(responseData);
          }
        } else {
          console.log(`[Worker] ⚠️ KV 缓存已过期（${age}秒），重新查询 Supabase`);
          console.log('--- 正在穿透缓存获取最新数据 ---');
          return await fetchFromSupabase(env, defaultAverage, defaultDimensions, c, true);
        }
      } else {
        // 缓存不存在，直接查询数据库
        console.log('[Worker] ⚠️ KV 缓存不存在，直接查询 Supabase');
        console.log('--- 正在穿透缓存获取最新数据 ---');
        return await fetchFromSupabase(env, defaultAverage, defaultDimensions, c, true);
      }
    } catch (error) {
      console.warn('[Worker] KV 读取失败，降级到 Supabase:', error);
      console.log('--- 正在穿透缓存获取最新数据 ---');
      return await fetchFromSupabase(env, defaultAverage, defaultDimensions, c, true);
    }

    // KV 缓存不存在或已过期，从 Supabase 查询并更新 KV
    console.log('[Worker] ⚠️ 所有缓存路径都未命中，最终降级到 Supabase');
    console.log('--- 正在穿透缓存获取最新数据 ---');
    return await fetchFromSupabase(env, defaultAverage, defaultDimensions, c, true);
  } catch (error: any) {
    console.error('[Worker] /api/global-average 错误:', error);
    const defaultAverage = { L: 50, P: 50, D: 50, E: 50, F: 50 };
    
    // 【硬编码注入】在返回之前，手动将 dimensions 字典注入到 JSON 中，确保万无一失
    // 统一使用 globalAverage 字段（不要用 averages）
    const responseData: any = {
      status: 'error',
      success: false,
      error: error.message || '未知错误',
      // 即使出错也返回默认值，确保前端不会崩溃（统一使用 globalAverage）
      globalAverage: defaultAverage,
      dimensions: {
        L: { label: '逻辑力' },
        P: { label: '耐心值' },
        D: { label: '细腻度' },
        E: { label: '情绪化' },
        F: { label: '频率感' }
      },
      totalUsers: 1,
      // 兼容性包装 - 双重包装
      data: {
        globalAverage: defaultAverage,
        totalUsers: 1,
        dimensions: {
          L: { label: '逻辑力' },
          P: { label: '耐心值' },
          D: { label: '细腻度' },
          E: { label: '情绪化' },
          F: { label: '频率感' }
        },
      },
      // 其他统计数据（默认值）
      totalRoastWords: 0,
      cityCount: 0,
      locationRank: [],
      recentVictims: [],
      source: 'error_fallback', // 添加 source 字段
    };

    // 【调试日志】在返回前输出完整数据，方便调试
    console.log('[Debug] 最终发送数据:', JSON.stringify(responseData, null, 2));
    console.log('[Worker] 发送给前端的数据:', JSON.stringify(responseData, null, 2));
    console.log('[Worker] ⚠️ 路由错误返回（但包含完整字段）:', {
      hasGlobalAverage: !!responseData.globalAverage,
      hasDimensions: !!responseData.dimensions,
      hasTotalUsers: !!responseData.totalUsers,
      hasData: !!responseData.data,
      globalAverage: responseData.globalAverage,
      source: responseData.source,
    });

    return c.json(responseData, 500);
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
    
    // 1. 获取总用户数（从 global_stats_v3_view）
    let totalUsers = 0;
    if (env.SUPABASE_URL && env.SUPABASE_KEY) {
      try {
        const res = await fetch(`${env.SUPABASE_URL}/rest/v1/global_stats_v3_view?select=total_count`, {
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
 * @param defaultDimensions - 默认维度定义
 * @param c - Hono 上下文
 * @param updateKV - 是否更新 KV 缓存
 */
async function fetchFromSupabase(
  env: Env,
  defaultAverage: { L: number; P: number; D: number; E: number; F: number },
  defaultDimensions: { L: { label: string }; P: { label: string }; D: { label: string }; E: { label: string }; F: { label: string } },
  c: any,
  updateKV: boolean = false
) {
  // 【日志跟踪】在执行数据库查询前添加日志
  console.log('--- 正在穿透缓存获取最新数据 ---');
  
  if (!env.SUPABASE_URL || !env.SUPABASE_KEY) {
    console.warn('[Worker] ⚠️ Supabase 环境变量未配置，返回默认值');
    
    // 【硬编码注入】在返回之前，手动将 dimensions 字典注入到 JSON 中，确保万无一失
    // 统一使用 globalAverage 字段（不要用 averages）
    const responseData = {
      status: 'success',
      success: true,
      // 1. 维度分（统一使用 globalAverage）
      globalAverage: defaultAverage,
      // 2. 参与人数 (必须有，不然卡片显示 0)
      totalUsers: 1,
      // 3. 标签定义 (必须有，不然雷达图不显示文字) - 硬编码注入
      dimensions: {
        L: { label: '逻辑力' },
        P: { label: '耐心值' },
        D: { label: '细腻度' },
        E: { label: '情绪化' },
        F: { label: '频率感' }
      },
      // 4. 兼容性包装 (防止前端去 .data 路径下找) - 双重包装
      data: {
        globalAverage: defaultAverage,
        totalUsers: 1,
        dimensions: {
          L: { label: '逻辑力' },
          P: { label: '耐心值' },
          D: { label: '细腻度' },
          E: { label: '情绪化' },
          F: { label: '频率感' }
        },
      },
      // 5. 其他统计数据（默认值）
      totalRoastWords: 0,
      cityCount: 0,
      locationRank: [],
      recentVictims: [],
      message: 'Supabase 环境变量未配置',
      source: 'default',
    };

    // 【调试日志】在返回前输出完整数据，方便调试
    console.log('[Debug] 最终发送数据:', JSON.stringify(responseData, null, 2));
    console.log('[Worker] 发送给前端的数据:', JSON.stringify(responseData, null, 2));
    console.log('[Worker] ✅ 返回默认值（Supabase 未配置）:', {
      hasGlobalAverage: !!responseData.globalAverage,
      hasDimensions: !!responseData.dimensions,
      hasTotalUsers: !!responseData.totalUsers,
      hasData: !!responseData.data,
      globalAverage: responseData.globalAverage,
      source: responseData.source,
    });

    return c.json(responseData);
  }

  // 用于跟踪是否使用了降级方案（直接查询 user_analysis）
  let usedFallbackQuery = false;
  
  try {
    // 【多视图合成】放弃请求 global_stats_v3_view，改为从两个视图获取数据
    // 视图 A (dashboard_summary_view)：获取 total_roast_words, city_count, total_users 以及平均分数据
    // 视图 B (extended_stats_view)：获取 location_rank 和 recent_victims 数据
    const [dashboardSummaryRes, extendedStatsRes] = await Promise.all([
      // 视图 A：获取汇总数据和平均分
      fetch(`${env.SUPABASE_URL}/rest/v1/dashboard_summary_view?select=*`, {
        headers: {
          'apikey': env.SUPABASE_KEY,
          'Authorization': `Bearer ${env.SUPABASE_KEY}`,
        },
      }),
      // 视图 B：获取地理位置排行和最近受害者
      fetch(`${env.SUPABASE_URL}/rest/v1/extended_stats_view?select=*`, {
        headers: {
          'apikey': env.SUPABASE_KEY,
          'Authorization': `Bearer ${env.SUPABASE_KEY}`,
        },
      }),
    ]);

    // 【处理视图 A (dashboard_summary_view)】获取 total_roast_words, city_count, total_users 以及平均分数据
    let globalAverage: { L: number; P: number; D: number; E: number; F: number } = defaultAverage;
    let totalUsers: number = 1;
    let totalRoastWords: number = 0;
    let cityCount: number = 0;

    if (!dashboardSummaryRes.ok) {
      console.error('[View Error] dashboard_summary_view:', `HTTP ${dashboardSummaryRes.status} - ${dashboardSummaryRes.statusText}`);
      // 如果视图 A 失败，降级到直接查询 user_analysis 表
      usedFallbackQuery = true;
      console.warn('[Worker] ⚠️ dashboard_summary_view 查询失败，降级到直接查询 user_analysis 表');
      
      const userAnalysisRes = await fetch(`${env.SUPABASE_URL}/rest/v1/user_analysis?select=l,p,d,e,f`, {
        headers: {
          'apikey': env.SUPABASE_KEY,
          'Authorization': `Bearer ${env.SUPABASE_KEY}`,
        },
      });

      if (userAnalysisRes.ok) {
        const userData = await userAnalysisRes.json();
        if (Array.isArray(userData) && userData.length > 0) {
          // 计算平均值
          const sum = userData.reduce((acc, item) => ({
            L: acc.L + (parseFloat(item.l) || 0),
            P: acc.P + (parseFloat(item.p) || 0),
            D: acc.D + (parseFloat(item.d) || 0),
            E: acc.E + (parseFloat(item.e) || 0),
            F: acc.F + (parseFloat(item.f) || 0),
          }), { L: 0, P: 0, D: 0, E: 0, F: 0 });

          const count = userData.length;
          if (count > 0) {
            globalAverage = {
              L: Math.round(sum.L / count),
              P: Math.round(sum.P / count),
              D: Math.round(sum.D / count),
              E: Math.round(sum.E / count),
              F: Math.round(sum.F / count),
            };
          }
          totalUsers = count;
        }
      }
    } else {
      try {
        const summaryData = await dashboardSummaryRes.json();
        const row = summaryData[0] || {};
        
        // 从视图 A 获取平均分数据
        globalAverage = {
          L: parseFloat(row.avg_l || row.avg_L || 50),
          P: parseFloat(row.avg_p || row.avg_P || 50),
          D: parseFloat(row.avg_d || row.avg_D || 50),
          E: parseFloat(row.avg_e || row.avg_E || 50),
          F: parseFloat(row.avg_f || row.avg_F || 50),
        };
        
        // 获取总用户数
        totalUsers = parseInt(row.total_users || row.total_count || 0);
        if (totalUsers <= 0) {
          totalUsers = 1;
        }
        
        // 获取累计吐槽字数
        totalRoastWords = parseInt(row.total_roast_words || row.total_words || 0);
        
        // 获取覆盖城市数
        cityCount = parseInt(row.city_count || 0);
        
        console.log('[Worker] ✅ 从 dashboard_summary_view 获取数据:', {
          totalUsers,
          totalRoastWords,
          cityCount,
          globalAverage,
        });
      } catch (error: any) {
        console.error('[View Error] dashboard_summary_view:', error.message || '解析失败');
        usedFallbackQuery = true;
      }
    }

    // 【处理视图 B (extended_stats_view)】获取 location_rank 和 recent_victims 数据
    let locationRank: Array<{ name: string; value: number }> = [];
    let recentVictims: Array<{ name: string; type: string; location: string; time: string }> = [];

    if (!extendedStatsRes.ok) {
      console.error('[View Error] extended_stats_view:', `HTTP ${extendedStatsRes.status} - ${extendedStatsRes.statusText}`);
      // 如果视图 B 失败，使用空数组
      console.warn('[Worker] ⚠️ extended_stats_view 查询失败，使用空数据');
    } else {
      try {
        const extendedData = await extendedStatsRes.json();
        const row = extendedData[0] || {};
        
        // 【字段映射转换】处理地理位置排行
        // 将 extended_stats_view 返回的地区数据映射为 { name: location, value: count }
        if (row.location_rank && Array.isArray(row.location_rank)) {
          locationRank = row.location_rank.map((item: any) => {
            // 兼容不同的字段名格式
            const name = item.name || item.location || '未知';
            const value = item.value !== undefined ? item.value : (item.count !== undefined ? item.count : 0);
            return { name, value };
          }).slice(0, 5); // 取 Top 5
        } else if (row.location_rank && typeof row.location_rank === 'object') {
          // 如果是对象格式，转换为数组
          locationRank = Object.entries(row.location_rank).map(([name, count]: [string, any]) => ({
            name,
            value: typeof count === 'number' ? count : parseInt(count) || 0,
          })).sort((a, b) => b.value - a.value).slice(0, 5);
        }
        
        // 【字段映射转换】处理最近受害者
        // 将返回的列表映射为 { name, location, time, type }
        if (row.recent_victims && Array.isArray(row.recent_victims)) {
          recentVictims = row.recent_victims.map((item: any, index: number) => {
            const name = item.name || item.user_name || `匿名受害者${index + 1}`;
            const location = item.location || item.ip_location || '未知';
            const time = item.time || item.created_at || item.timestamp || new Date().toISOString();
            const type = item.type || item.personality_type || 'UNKNOWN';
            return { name, location, time, type };
          });
        }
        
        console.log('[Worker] ✅ 从 extended_stats_view 获取数据:', {
          locationRankCount: locationRank.length,
          recentVictimsCount: recentVictims.length,
        });
      } catch (error: any) {
        console.error('[View Error] extended_stats_view:', error.message || '解析失败');
      }
    }
    
    // 【汇总数据】确保 totalRoastWords 和 cityCount 被正确赋值
    // 如果视图 A 没有提供这些数据，尝试从视图 B 获取
    if (totalRoastWords === 0 && extendedStatsRes.ok) {
      try {
        const extendedData = await extendedStatsRes.json();
        const row = extendedData[0] || {};
        if (row.total_roast_words) {
          totalRoastWords = parseInt(row.total_roast_words) || 0;
        }
      } catch (error) {
        // 忽略错误
      }
    }
    
    if (cityCount === 0 && locationRank.length > 0) {
      // 如果 locationRank 有数据，使用去重后的数量作为 cityCount
      cityCount = locationRank.length;
    }

    // totalRoastWords 和 cityCount 已在视图 A 处理中获取，这里不再重复处理

    // 如果启用 KV 更新，写入缓存（包含 dimensions 字段，用于版本校验）
    if (updateKV && env.STATS_STORE) {
      try {
        const now = Math.floor(Date.now() / 1000);
        // 缓存数据包含 dimensions，用于版本校验
        const cachePayload = {
          ...globalAverage,
          dimensions: defaultDimensions, // 添加 dimensions 到缓存，用于版本校验
        };
        await env.STATS_STORE.put(KV_KEY_GLOBAL_AVERAGE, JSON.stringify(cachePayload));
        await env.STATS_STORE.put(KV_KEY_LAST_UPDATE, now.toString());
        console.log('[Worker] ✅ 已更新 KV 缓存（包含 dimensions）');
      } catch (error) {
        console.warn('[Worker] ⚠️ KV 写入失败:', error);
      }
    }

    // 【核心重构】确保返回的 JSON 包含所有前端需要的 Key，严格按照用户要求的格式
    const finalTotalUsers = totalUsers || 1;
    
    // 【确保 source 字段正确】根据数据来源设置正确的 source 值
    let dataSource = 'supabase';
    if (usedFallbackQuery) {
      dataSource = 'database_direct';
    } else if (updateKV) {
      dataSource = 'supabase_and_kv';
    }
    
    // 【硬编码注入】在返回之前，手动将 dimensions 字典注入到 JSON 中，确保万无一失
    // 最终返回给前端的 JSON 必须包含：globalAverage, totalUsers, totalRoastWords, cityCount, locationRank, recentVictims
    const responseData = {
      status: 'success',
      success: true,
      // 1. 维度分（统一使用 globalAverage，不要用 averages）
      globalAverage: globalAverage,
      // 2. 参与人数 (必须有，不然卡片显示 0)
      totalUsers: finalTotalUsers,
      // 3. 标签定义 (必须有，不然雷达图不显示文字) - 硬编码注入
      dimensions: {
        L: { label: '逻辑力' },
        P: { label: '耐心值' },
        D: { label: '细腻度' },
        E: { label: '情绪化' },
        F: { label: '频率感' }
      },
      // 4. 兼容性包装 (防止前端去 .data 路径下找) - 双重包装
      data: {
        globalAverage: globalAverage,
        totalUsers: finalTotalUsers,
        dimensions: {
          L: { label: '逻辑力' },
          P: { label: '耐心值' },
          D: { label: '细腻度' },
          E: { label: '情绪化' },
          F: { label: '频率感' }
        },
      },
      // 5. 其他统计数据（必须包含）
      totalRoastWords: totalRoastWords,
      cityCount: cityCount,
      locationRank: locationRank, // 格式：{ name: string, value: number }
      recentVictims: recentVictims, // 格式：{ name: string, type: string, location: string, time: string }
      source: dataSource, // supabase_and_kv 或 database_direct 或 supabase
    };

    // 【调试日志】添加调试日志：console.log('[Debug] 最终合成数据:', JSON.stringify(responseData))
    console.log('[Debug] 最终合成数据:', JSON.stringify(responseData, null, 2));
    console.log('[Debug] 最终发送数据:', JSON.stringify(responseData, null, 2));
    console.log('[Worker] 发送给前端的数据:', JSON.stringify(responseData, null, 2));
    console.log('[Worker] ✅ /api/global-average 返回完整数据:', {
      hasGlobalAverage: !!responseData.globalAverage,
      hasDimensions: !!responseData.dimensions,
      hasTotalUsers: !!responseData.totalUsers,
      hasData: !!responseData.data,
      totalUsers: responseData.totalUsers,
      totalRoastWords: responseData.totalRoastWords,
      cityCount: responseData.cityCount,
      locationRankCount: responseData.locationRank.length,
      recentVictimsCount: responseData.recentVictims.length,
      globalAverage: responseData.globalAverage,
      source: responseData.source,
    });

    return c.json(responseData);
  } catch (error: any) {
    console.error('[Worker] Supabase 查询失败:', error);
    
    // 【硬编码注入】在返回之前，手动将 dimensions 字典注入到 JSON 中，确保万无一失
    const responseData = {
      status: 'error',
      success: false,
      error: error.message || 'Supabase 查询失败',
      // 即使出错也返回默认值，确保前端不会崩溃（统一使用 globalAverage，不要用 averages）
      globalAverage: defaultAverage,
      dimensions: {
        L: { label: '逻辑力' },
        P: { label: '耐心值' },
        D: { label: '细腻度' },
        E: { label: '情绪化' },
        F: { label: '频率感' }
      },
      totalUsers: 1,
      // 兼容性包装 - 双重包装
      data: {
        globalAverage: defaultAverage,
        totalUsers: 1,
        dimensions: {
          L: { label: '逻辑力' },
          P: { label: '耐心值' },
          D: { label: '细腻度' },
          E: { label: '情绪化' },
          F: { label: '频率感' }
        },
      },
      // 其他统计数据（默认值）
      totalRoastWords: 0,
      cityCount: 0,
      locationRank: [],
      recentVictims: [],
      source: 'error_fallback',
    };

    // 【调试日志】在返回前输出完整数据，方便调试
    console.log('[Debug] 最终发送数据:', JSON.stringify(responseData, null, 2));
    console.log('[Worker] 发送给前端的数据:', JSON.stringify(responseData, null, 2));
    console.log('[Worker] ⚠️ 错误返回（但包含完整字段）:', {
      hasGlobalAverage: !!responseData.globalAverage,
      hasDimensions: !!responseData.dimensions,
      hasTotalUsers: !!responseData.totalUsers,
      hasData: !!responseData.data,
      source: responseData.source,
    });

    return c.json(responseData, 500);
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
    const res = await fetch(`${env.SUPABASE_URL}/rest/v1/global_stats_v3_view?select=*`, {
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

    // 强制补全 dimensions 字典（用于版本校验）
    const defaultDimensions = {
      L: { label: '逻辑力' },
      P: { label: '耐心值' },
      D: { label: '细腻度' },
      E: { label: '情绪化' },
      F: { label: '频率感' }
    };

    // 写入 KV（包含 dimensions 字段，用于版本校验）
    const now = Math.floor(Date.now() / 1000);
    const cachePayload = {
      ...globalAverage,
      dimensions: defaultDimensions, // 添加 dimensions 到缓存，用于版本校验
    };
    await env.STATS_STORE.put(KV_KEY_GLOBAL_AVERAGE, JSON.stringify(cachePayload));
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
        const res = await fetch(`${env.SUPABASE_URL}/rest/v1/global_stats_v3_view?select=total_count`, {
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