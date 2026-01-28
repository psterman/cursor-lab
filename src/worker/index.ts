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
import { getRankResult, RANK_DATA } from './rank';
// 直接从 rank-content.ts 导入 RANK_RESOURCES（rank.ts 已导入但未导出）
import { RANK_RESOURCES } from '../rank-content';
import { identifyUserByFingerprint, bindFingerprintToUser, updateUserByFingerprint } from './fingerprint-service';

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
const KV_KEY_GLOBAL_STATS_CACHE = 'GLOBAL_STATS_CACHE'; // 完整统计数据缓存（原子性）
const KV_KEY_GLOBAL_STATS_V6 = 'GLOBAL_STATS_V6'; // V6 协议全局统计（用于动态排名）
const KV_CACHE_TTL = 3600; // 缓存有效期：1小时（秒）

/**
 * 【维度标识符映射表】
 * 将 scoring.ts 的维度 Key (L, P, D, E, F) 映射到 rank-content.ts 的一级 Key
 * 
 * 【验证】rank-content.ts 中的一级 Key 有：ai, day, no, please, say, word
 * 映射关系必须完全对应，确保每个维度都能找到对应的文案
 */
const DIMENSION_KEY_MAPPING: Record<string, string> = {
  'L': 'word',  // 逻辑力 → word (平均长度排名) ✓
  'P': 'no',    // 耐心值 → no (甲方上身排名) ✓
  'D': 'say',   // 细腻度 → say (废话输出排名) ✓
  'E': 'ai',    // 探索欲 → ai (调戏 AI 排名) ✓
  'F': 'please' // 反馈感 → please (赛博磕头排名) ✓
};

// 【验证】确保所有映射的 Key 都在 rank-content.ts 中存在
const VALID_RANK_KEYS = ['ai', 'day', 'no', 'please', 'say', 'word'];
Object.entries(DIMENSION_KEY_MAPPING).forEach(([dimKey, rankKey]) => {
  if (!VALID_RANK_KEYS.includes(rankKey)) {
    console.error(`[Worker] ❌ 映射错误：维度 ${dimKey} 映射到 ${rankKey}，但该 Key 不在 rank-content.ts 中`);
  }
});

/**
 * 【维度值映射函数】
 * 将维度得分转换为 rank-content.ts 所需的数值
 * 注意：rank-content.ts 中的范围是基于实际统计值（如对话回合数、字数等），
 * 而不是维度得分（0-100）。因此需要使用 stats 中的实际统计值。
 */
function mapDimensionValueToRankValue(
  dimensionKey: string,
  dimensionValue: number,
  stats: V6Stats
): number {
  switch (dimensionKey) {
    case 'L': // 逻辑力 → word (平均长度排名)
      // word 的范围通常是字符数，使用 avg_payload（平均消息长度）
      return Math.round(stats.avg_payload || 0);
    case 'P': // 耐心值 → no (甲方上身排名)
      // no 的范围是"不"字次数，使用 jiafang_count
      return stats.jiafang_count || 0;
    case 'D': // 细腻度 → say (废话输出排名)
      // say 的范围是总字符数，使用 totalChars
      return stats.totalChars || 0;
    case 'E': // 探索欲 → ai (调戏 AI 排名)
      // ai 的范围是对话回合数，使用 totalMessages
      return stats.totalMessages || 0;
    case 'F': // 反馈感 → please (赛博磕头排名)
      // please 的范围是"请"字次数，使用 ketao_count
      return stats.ketao_count || 0;
    default:
      // 降级：如果无法映射，使用维度得分本身（可能需要调整范围）
      return Math.round(dimensionValue);
  }
}

/**
 * 【维度得分映射到 level】
 * 将维度得分 (0-100) 映射到 answer_book 表的 level (0, 1, 2)
 * - 0-33: level 0 (低)
 * - 34-66: level 1 (中)
 * - 67-100: level 2 (高)
 */
function mapDimensionScoreToLevel(score: number): number {
  if (score <= 33) return 0;
  if (score <= 66) return 1;
  return 2;
}

/**
 * 【从 Supabase 获取维度吐槽文案】
 * 从 answer_book 表查询指定维度、level 和语言的吐槽文案
 * @param env - 环境变量（包含 SUPABASE_URL 和 SUPABASE_KEY）
 * @param dimension - 维度代码 (L, P, D, E, F)
 * @param level - 等级 (0, 1, 2)
 * @param lang - 语言 ('cn' 或 'en')
 * @returns 吐槽文案，如果未找到则返回 null
 */
async function getRoastFromSupabase(
  env: Env,
  dimension: string,
  level: number,
  lang: string
): Promise<string | null> {
  if (!env.SUPABASE_URL || !env.SUPABASE_KEY) {
    console.warn('[Worker] ⚠️ Supabase 配置缺失，无法从数据库获取吐槽文案');
    return null;
  }

  try {
    // 将语言代码转换为数据库格式 ('zh-CN' -> 'cn', 'en' -> 'en')
    const dbLang = lang === 'en' ? 'en' : 'cn';
    
    // 查询 answer_book 表，获取所有匹配的记录以便随机选择
    const url = `${env.SUPABASE_URL}/rest/v1/answer_book?dimension=eq.${dimension}&level=eq.${level}&lang=eq.${dbLang}&select=content`;
    
    console.log(`[Worker] 📖 查询 answer_book: dimension=${dimension}, level=${level}, lang=${dbLang}`);
    
    const response = await fetch(url, {
      headers: {
        'apikey': env.SUPABASE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      console.warn(`[Worker] ⚠️ Supabase answer_book 查询失败: ${response.status} ${response.statusText}`, errorText);
      return null;
    }

    const data = await response.json();
    console.log(`[Worker] 📖 answer_book 查询结果: 找到 ${Array.isArray(data) ? data.length : 0} 条记录`);
    
    if (Array.isArray(data) && data.length > 0) {
      // 随机选择一条文案
      const randomIndex = Math.floor(Math.random() * data.length);
      const content = data[randomIndex].content;
      console.log(`[Worker] ✅ 随机选择第 ${randomIndex + 1} 条: ${content?.substring(0, 30)}...`);
      return content || null;
    }
    
    console.warn(`[Worker] ⚠️ answer_book 中未找到 dimension=${dimension}, level=${level}, lang=${dbLang} 的记录`);
    return null;
  } catch (error) {
    console.error(`[Worker] ❌ 从 Supabase 获取吐槽文案失败:`, error);
    return null;
  }
}

/**
 * 【从 Supabase 获取维度标签】
 * 从 rank.ts 的 RANK_DATA 获取标签，作为降级方案
 */
function getDimensionLabelFromRank(
  dimensionKey: string,
  dimensionValue: number,
  rankLang: 'zh' | 'en'
): string {
  const rankId = DIMENSION_KEY_MAPPING[dimensionKey];
  if (!rankId || !RANK_DATA[rankId]) {
    return '未知';
  }

  // 将维度得分映射到 rank-content.ts 所需的数值（使用默认 stats）
  const defaultStats: V6Stats = {
    totalChars: 0,
    totalMessages: 0,
    ketao_count: 0,
    jiafang_count: 0,
    tease_count: 0,
    nonsense_count: 0,
    slang_count: 0,
    abuse_count: 0,
    abuse_value: 0,
    tech_stack: {},
    work_days: 0,
    code_ratio: 0,
    feedback_density: 0,
    balance_score: 50,
    diversity_score: 0,
    style_index: 0,
    style_label: '',
    avg_payload: 0,
    blackword_hits: {
      chinese_slang: {},
      english_slang: {},
    },
  };
  
  const rankValue = mapDimensionValueToRankValue(dimensionKey, dimensionValue, defaultStats);
  const rankResult = getRankResult(rankId, rankValue, rankLang);
  
  if (rankResult && rankResult.level) {
    return rankLang === 'en' 
      ? (rankResult.level.labelEn || rankResult.level.label || '未知')
      : (rankResult.level.label || '未知');
  }
  
  return '未知';
}

/**
 * 【适配器函数】matchLPDEFContent
 * 将 L, P, D, E, F 维度分数映射到 rank-content.ts 的文案
 * 
 * @param dimensions - 维度得分对象 { L, P, D, E, F }
 * @param lang - 语言代码 ('zh-CN' | 'en')
 * @returns 包含每个维度称号和随机吐槽的数组
 */
function matchLPDEFContent(
  dimensions: { L: number; P: number; D: number; E: number; F: number },
  lang: string = 'zh-CN'
): Array<{
  dimension: string;
  score: number;
  label: string;
  roast: string;
}> {
  const result: Array<{
    dimension: string;
    score: number;
    label: string;
    roast: string;
  }> = [];
  
  // 维度映射：L -> 'word', P -> 'no', D -> 'say', E -> 'ai', F -> 'please'
  const dimensionMapping: Record<string, string> = {
    'L': 'word',
    'P': 'no',
    'D': 'say',
    'E': 'ai',
    'F': 'please'
  };
  
  // 确定语言（'zh' 或 'en'）
  const isZh = lang !== 'en' && !lang.startsWith('en');
  const langKey = isZh ? 'commentsZh' : 'commentsEn';
  const labelKey = isZh ? 'label' : 'labelEn';
  
  // 遍历每个维度
  console.log('[Adapter] 🔍 开始匹配维度，输入:', {
    dimensionsKeys: Object.keys(dimensions),
    dimensionsValues: Object.values(dimensions),
    dimensionMapping,
    availableResources: Object.keys(RANK_RESOURCES),
  });
  
  for (const [dimKey, dimScore] of Object.entries(dimensions)) {
    console.log(`[Adapter] 🔍 处理维度 ${dimKey}, 分数: ${dimScore}`);
    
    const rankId = dimensionMapping[dimKey];
    if (!rankId) {
      console.warn(`[Adapter] ⚠️ 未知维度: ${dimKey}, 跳过`);
      continue;
    }
    
    console.log(`[Adapter] 🔍 维度 ${dimKey} 映射到 rankId: ${rankId}`);
    
    // 获取对应的 RANK_RESOURCES 配置
    const resource = RANK_RESOURCES[rankId];
    if (!resource || !resource.levels || !Array.isArray(resource.levels)) {
      console.warn(`[Adapter] ⚠️ 未找到 rank-content 配置: ${rankId}`, {
        resourceExists: !!resource,
        hasLevels: !!resource?.levels,
        isArray: Array.isArray(resource?.levels),
        levelsLength: resource?.levels?.length || 0,
      });
      // 降级：使用默认值
      result.push({
        dimension: dimKey,
        score: dimScore,
        label: '未知',
        roast: '暂无吐槽文案'
      });
      continue;
    }
    
    console.log(`[Adapter] ✅ 找到资源 ${rankId}, levels 数量: ${resource.levels.length}`);
    
    // 【关键修复】将维度分数（0-100）映射到 rank-content.ts 的数值范围
    // 注意：rank-content.ts 中的范围是基于实际统计值（如对话回合数、字数等），
    // 而不是维度得分（0-100）。因此需要将维度得分转换为对应的 rank 值。
    
    // 将维度分数（0-100）转换为 rank 值
    // 对于不同维度，映射方式不同：
    // - L (逻辑力): 分数越高，代码比例越高，对应 word 的字符数范围
    // - P (耐心值): 分数越低，否定词越多，对应 no 的计数范围（需要反向映射）
    // - D (细腻度): 分数越高，修饰词越多，对应 say 的字符数范围
    // - E (探索欲): 分数越高，技术词越多，对应 ai 的对话回合数范围
    // - F (反馈感): 分数越高，礼貌词越多，对应 please 的计数范围
    
    let rankValue = Math.max(0, Math.min(100, Math.round(dimScore)));
    
    // 特殊处理：某些维度的范围映射
    if (dimKey === 'E') {
      // E 维度：探索欲，rank-content.ts 中 ai 的范围通常是 1-200+，需要放大
      rankValue = Math.round(dimScore * 2); // 将 0-100 映射到 0-200
    } else if (dimKey === 'P') {
      // P 维度：耐心值，分数越低否定词越多，但 rank-content.ts 中 no 的范围是正向的
      // 保持原值，但需要确保能匹配到合适的区间
      rankValue = Math.round(dimScore);
    }
    
    // 【关键修复】在 levels 数组中查找匹配的区间
    // 修正：确保 0 分也能命中第一个档位（即使 min === 1）
    let matchedLevel = resource.levels.find((level: any) => {
      const min = level.min || 0;
      const max = level.max || 999999;
      
      // 【修复】如果 min === 1，允许 0 分也匹配到第一个档位
      const adjustedMin = (min === 1 && rankValue === 0) ? 0 : min;
      
      return rankValue >= adjustedMin && rankValue <= max;
    });
    
    // 【降级处理】如果没有匹配到，使用第一个或最后一个 level
    if (!matchedLevel) {
      if (resource.levels.length > 0) {
        const firstLevel = resource.levels[0];
        const lastLevel = resource.levels[resource.levels.length - 1];
        const firstMin = firstLevel.min || 0;
        const lastMax = lastLevel.max || 999999;
        
        // 如果分数太低（包括 0 分），使用第一个 level
        if (rankValue <= firstMin) {
          matchedLevel = firstLevel;
          console.log(`[Adapter] ⚠️ 维度 ${dimKey} 分数 ${rankValue} 低于最小值 ${firstMin}，使用第一个 level`);
        }
        // 如果分数太高，使用最后一个 level
        else if (rankValue > lastMax) {
          matchedLevel = lastLevel;
          console.log(`[Adapter] ⚠️ 维度 ${dimKey} 分数 ${rankValue} 高于最大值 ${lastMax}，使用最后一个 level`);
        }
        // 否则使用第一个 level（兜底）
        else {
          matchedLevel = firstLevel;
          console.log(`[Adapter] ⚠️ 维度 ${dimKey} 分数 ${rankValue} 无法匹配，使用第一个 level 作为兜底`);
        }
      } else {
        console.warn(`[Adapter] ⚠️ ${rankId} 没有可用的 levels`);
        result.push({
          dimension: dimKey,
          score: dimScore,
          label: '未知',
          roast: '暂无吐槽文案'
        });
        continue;
      }
    }
    
    // 【关键修复】获取标签
    const label = matchedLevel[labelKey] || matchedLevel.label || '未知';
    
    // 【关键修复】从 commentsZh 或 commentsEn 数组中随机抽取一个 content
    // 修正：确保正确提取 content 字符串，而不是整个对象
    const comments = matchedLevel[langKey] || [];
    let roast = '暂无吐槽文案';
    
    if (Array.isArray(comments) && comments.length > 0) {
      // 随机选择一个评论
      const randomIndex = Math.floor(Math.random() * comments.length);
      const selectedComment = comments[randomIndex];
      
      // 【修复】确保正确提取 content 字段
      if (selectedComment) {
        if (typeof selectedComment === 'string') {
          // 如果直接是字符串，直接使用
          roast = selectedComment;
        } else if (selectedComment.content && typeof selectedComment.content === 'string') {
          // 如果是对象，提取 content 字段
          roast = selectedComment.content;
        } else {
          console.warn(`[Adapter] ⚠️ 维度 ${dimKey} 的评论格式异常:`, selectedComment);
        }
      }
      
      // 【验证】确保 roast 是有效的字符串
      if (!roast || roast === '暂无吐槽文案') {
        console.warn(`[Adapter] ⚠️ 维度 ${dimKey} 无法提取有效的 roast，comments 长度: ${comments.length}`);
      }
    } else {
      console.warn(`[Adapter] ⚠️ 维度 ${dimKey} 的 ${langKey} 数组为空或不存在`);
    }
    
    // 添加到结果数组
    result.push({
      dimension: dimKey,
      score: dimScore,
      label: label,
      roast: roast
    });
    
    console.log(`[Adapter] ✅ 维度 ${dimKey} 匹配成功:`, {
      rankId,
      originalScore: dimScore,
      rankValue,
      label,
      roastLength: roast.length,
      roastPreview: roast.length > 50 ? roast.substring(0, 50) + '...' : roast,
      matchedLevelRange: `${matchedLevel.min}-${matchedLevel.max}`,
      commentsCount: (matchedLevel[langKey] || []).length,
    });
  }
  
  console.log('[Adapter] ✅ 适配器函数完成，返回结果:', {
    resultCount: result.length,
    resultDimensions: result.map(r => r.dimension),
    allDimensionsPresent: ['L', 'P', 'D', 'E', 'F'].every(
      dim => result.find(r => r.dimension === dim)
    ),
  });
  
  return result;
}

/**
 * 【V6 协议类型定义】V6Stats 接口
 * 基于 vibeAnalyzerWorker.js 中的 stats 结构定义
 */
interface V6Stats {
  totalChars: number;
  totalMessages: number;
  ketao_count: number; // 赛博磕头计数
  jiafang_count: number; // 甲方上身计数
  tease_count: number; // 调戏AI计数
  nonsense_count: number; // 废话输出计数
  slang_count: number; // 硅谷黑话计数
  abuse_count: number; // 受虐倾向计数
  abuse_value: number; // 受虐值：特定咆哮词/否定词频次
  tech_stack: Record<string, number>; // 技术栈词频统计，格式：{"React": 5, "Rust": 2}
  work_days: number; // 工作天数
  code_ratio: number; // 代码行占比（0-1）
  feedback_density: number; // 消息反馈密度
  balance_score: number; // 维度平衡度（0-100）
  diversity_score: number; // 技术多样性
  style_index: number; // 交互风格指数
  style_label: string; // 交互风格标签（如"雄辩家"、"冷酷极客"）
  avg_payload: number; // 平均载荷（每消息平均字符数）
  blackword_hits: {
    chinese_slang: Record<string, number>; // 中文黑话（功德簿）
    english_slang: Record<string, number>; // 英文黑话（硅谷黑话）
    [key: string]: any; // 兼容旧格式
  };
}

/**
 * 【V6 协议类型定义】前端上报的完整 Payload
 */
interface V6AnalyzePayload {
  chatData?: Array<{ role: string; text?: string; timestamp?: string | number }>;
  stats?: V6Stats; // V6 协议 stats 字段
  dimensions?: { L: number; P: number; D: number; E: number; F: number }; // 12个雷达图数值（实际是5个维度）
  fingerprint?: string; // LPDEF 指纹
  lang?: string; // 语言代码
  userName?: string; // 用户名（可选）
  // 兼容旧版接口的字段
  usageDays?: number;
  days?: number;
  workDays?: number;
  buCount?: number;
  jiafang?: number;
  negationCount?: number;
  qingCount?: number;
  ketao?: number;
  politeCount?: number;
}

/**
 * 【V6 协议类型定义】答案之书文案结构
 */
interface AnswerBook {
  title: string; // 标题
  content: string; // 内容
  vibe_level: string; // Vibe 等级（如 "AI调情师"、"赛博磕头匠"、"硅谷浓度超标"）
}

/**
 * 【V6 协议类型定义】全局统计数据（用于排名计算）
 */
interface GlobalStatsV6 {
  totalUsers: number; // 总用户数
  avgDimensions: { L: number; P: number; D: number; E: number; F: number }; // 各维度平均分
  avgStats: {
    ketao_count: number;
    jiafang_count: number;
    tease_count: number;
    nonsense_count: number;
    slang_count: number;
    abuse_value: number;
    style_index: number;
    avg_payload: number;
    [key: string]: number;
  };
  topBlackwords: Array<{ word: string; count: number }>; // 最常命中的黑话 Top 10
  lastUpdate: number; // 最后更新时间戳
}

/**
 * 生成用于 Supabase 幂等 Upsert 的指纹。
 *
 * 约束：
 * - 同一 userId 必须生成固定 fingerprint（保证幂等更新）
 * - 保留 totalChars 参数以兼容调用方，但不参与指纹计算（避免“总字数变化导致指纹漂移”）
 */
async function generateFingerprint(userId: string, _totalChars?: number): Promise<string> {
  const safeUserId = String(userId || '').trim();
  if (!safeUserId) return 'anonymous';

  const msgUint8 = new TextEncoder().encode(`user:${safeUserId}`);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// 创建 Hono 应用
const app = new Hono<{ Bindings: Env }>();

// CORS 配置（V6 协议：允许所有来源访问）
// 注意：这是一个公开的 API，允许所有域名访问以支持跨域请求
// 如果需要限制访问，可以取消注释下面的 ALLOWED_ORIGINS 配置
const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
  'https://vibecodinger.com',
  'https://*.vibecodinger.com',
  'https://*.github.io', // 允许 GitHub Pages
  'https://*.github.com', // 允许 GitHub
  // 可以根据需要添加更多允许的域名
];

app.use('/*', cors({
  origin: '*', // 允许所有来源（公开 API）
  allowMethods: ['GET', 'POST', 'OPTIONS', 'PUT', 'DELETE'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposeHeaders: ['Content-Length', 'Content-Type'],
  credentials: false, // 不允许携带凭证（因为允许所有来源）
  maxAge: 86400, // Access-Control-Max-Age: 86400
}));

/**
 * 【V6 协议】Payload 大小校验
 * 防止恶意大文件注入，限制请求体大小
 */
const MAX_PAYLOAD_SIZE = 5 * 1024 * 1024; // 5MB

/**
 * 【V6 协议】从 KV 获取全局统计数据（用于动态排名）
 */
async function getGlobalStatsV6(env: Env): Promise<GlobalStatsV6 | null> {
  if (!env.STATS_STORE) {
    return null;
  }

  try {
    const cached = await env.STATS_STORE.get(KV_KEY_GLOBAL_STATS_V6, 'json');
    if (cached && cached.lastUpdate) {
      // 检查缓存是否过期（1小时）
      const now = Math.floor(Date.now() / 1000);
      if (now - cached.lastUpdate < KV_CACHE_TTL) {
        return cached as GlobalStatsV6;
      }
    }
  } catch (error) {
    console.warn('[Worker] ⚠️ 读取 KV 全局统计失败:', error);
  }

  return null;
}

/**
 * 【V6 协议】计算百分比排名（Percentile）
 * 根据全局统计数据计算当前用户在各维度上的排名
 */
function calculatePercentileRank(
  userValue: number,
  globalAvg: number,
  totalUsers: number
): number {
  if (totalUsers <= 1 || !globalAvg || globalAvg === 0) {
    return 50; // 默认中位数
  }

  // 简化算法：假设数据近似正态分布
  // 如果用户值 > 平均值，排名在 50% 以上
  // 如果用户值 < 平均值，排名在 50% 以下
  const ratio = userValue / globalAvg;
  
  if (ratio >= 1.5) {
    // 超过平均值 50% 以上，排名前 10%
    return Math.min(95, 90 + (ratio - 1.5) * 5);
  } else if (ratio >= 1.2) {
    // 超过平均值 20-50%，排名前 20-30%
    return Math.min(90, 70 + (ratio - 1.2) * 66.67);
  } else if (ratio >= 1.0) {
    // 超过平均值 0-20%，排名前 40-50%
    return Math.min(70, 50 + (ratio - 1.0) * 100);
  } else if (ratio >= 0.8) {
    // 低于平均值 0-20%，排名 30-50%
    return Math.max(30, 50 - (1.0 - ratio) * 100);
  } else if (ratio >= 0.5) {
    // 低于平均值 20-50%，排名 10-30%
    return Math.max(10, 30 - (0.8 - ratio) * 66.67);
  } else {
    // 低于平均值 50% 以上，排名后 10%
    return Math.max(0, 10 - (0.5 - ratio) * 20);
  }
}

/**
 * 【V6 协议】文案生成引擎（Roast Engine）
 * 根据用户行为特征生成个性化的"答案之书"文案
 * 
 * 逻辑优先级：
 * 1. tease_count > 5 → "AI 调情师"
 * 2. ketao_count > 10 → "赛博磕头匠"
 * 3. english_slang 占比极高 → "硅谷浓度超标"
 * 4. abuse_value > 10 → "受虐倾向患者"
 * 5. jiafang_count > 15 → "甲方附体"
 * 6. 默认根据 style_index 生成
 */
function generateVibeDiagnosis(
  stats: V6Stats,
  dimensions: { L: number; P: number; D: number; E: number; F: number },
  lang: string = 'zh-CN'
): AnswerBook {
  const isZh = lang.startsWith('zh');
  
  // 计算英文黑话占比
  const totalEnglishSlang = Object.values(stats.blackword_hits?.english_slang || {}).reduce(
    (sum, count) => sum + count, 0
  );
  const totalSlang = stats.slang_count || 1;
  const englishSlangRatio = totalEnglishSlang / totalSlang;

  // 优先级 1: 调戏AI（tease_count > 5）
  if (stats.tease_count > 5) {
    return {
      title: isZh ? 'AI 调情师' : 'AI Flirt Master',
      content: isZh
        ? `你与 AI 的对话中出现了 ${stats.tease_count} 次调戏行为。你似乎把 AI 当成了聊天伙伴，而不是工具。这种"人机调情"的行为模式显示你可能是那种会在深夜和 ChatGPT 聊人生的人。`
        : `You've teased the AI ${stats.tease_count} times. You seem to treat AI as a chat partner rather than a tool. This "human-AI flirting" pattern suggests you're the type who would chat with ChatGPT about life at midnight.`,
      vibe_level: 'AI调情师',
    };
  }

  // 优先级 2: 赛博磕头（ketao_count > 10）
  if (stats.ketao_count > 10) {
    return {
      title: isZh ? '赛博磕头匠' : 'Cyber Ketao Master',
      content: isZh
        ? `你的对话中出现了 ${stats.ketao_count} 次"谢谢"、"辛苦"等礼貌用语。你对 AI 的礼貌程度已经达到了"赛博磕头"的级别。这种过度的礼貌可能源于你对 AI 的敬畏，或者你只是习惯性地对一切事物说"谢谢"。`
        : `You've used polite words like "thanks" and "sorry" ${stats.ketao_count} times. Your politeness to AI has reached the "cyber ketao" level. This excessive politeness might stem from your reverence for AI, or you're just habitually saying "thanks" to everything.`,
      vibe_level: '赛博磕头匠',
    };
  }

  // 优先级 3: 硅谷浓度超标（english_slang 占比 > 0.6）
  if (englishSlangRatio > 0.6 && totalSlang > 5) {
    return {
      title: isZh ? '硅谷浓度超标' : 'Silicon Valley Overdose',
      content: isZh
        ? `你的对话中硅谷黑话占比高达 ${Math.round(englishSlangRatio * 100)}%。你可能是那种会在日常对话中使用"synergy"、"leverage"、"disrupt"等词汇的人。这种"硅谷浓度超标"的行为模式显示你可能在科技公司工作，或者你只是喜欢用这些词汇来显得专业。`
        : `Your conversation contains ${Math.round(englishSlangRatio * 100)}% Silicon Valley jargon. You might be the type who uses words like "synergy", "leverage", and "disrupt" in daily conversations. This "Silicon Valley overdose" pattern suggests you might work in tech, or you just like using these words to sound professional.`,
      vibe_level: '硅谷浓度超标',
    };
  }

  // 优先级 4: 受虐倾向（abuse_value > 10）
  if (stats.abuse_value > 10) {
    return {
      title: isZh ? '受虐倾向患者' : 'Masochistic Tendency',
      content: isZh
        ? `你的对话中出现了 ${stats.abuse_value} 次"重写"、"不对"、"错误"等否定词汇。你似乎对 AI 的错误容忍度极低，但又不断回来使用它。这种"受虐倾向"的行为模式显示你可能是一个完美主义者，或者你只是享受这种"折磨 AI"的过程。`
        : `You've used negative words like "rewrite", "wrong", and "error" ${stats.abuse_value} times. You seem to have extremely low tolerance for AI errors, yet you keep coming back. This "masochistic tendency" pattern suggests you might be a perfectionist, or you just enjoy this "torturing AI" process.`,
      vibe_level: '受虐倾向患者',
    };
  }

  // 优先级 5: 甲方附体（jiafang_count > 15）
  if (stats.jiafang_count > 15) {
    return {
      title: isZh ? '甲方附体' : 'Client Possession',
      content: isZh
        ? `你的对话中出现了 ${stats.jiafang_count} 次"马上"、"必须"、"赶紧"等甲方常用词汇。你的语气已经达到了"甲方附体"的级别。这种命令式的沟通方式显示你可能习惯于发号施令，或者你只是习惯了用这种方式与 AI 交流。`
        : `You've used client-style words like "immediately", "must", and "quickly" ${stats.jiafang_count} times. Your tone has reached the "client possession" level. This commanding communication style suggests you might be used to giving orders, or you're just used to communicating with AI this way.`,
      vibe_level: '甲方附体',
    };
  }

  // 【安全修复】确保 style_index 是有效数字，防止 undefined.toFixed() 错误
  const safeStyleIndex = Number(stats.style_index) || 50;
  const safeAvgPayload = Number(stats.avg_payload) || 0;
  
  // 默认：根据 style_index 生成
  if (safeStyleIndex > 100) {
    return {
      title: isZh ? '雄辩家' : 'Eloquent Speaker',
      content: isZh
        ? `你的平均消息长度为 ${Math.round(safeAvgPayload)} 字符，交互风格指数为 ${safeStyleIndex.toFixed(1)}。你属于"雄辩家"类型，喜欢长篇大论地描述需求。这种详细的沟通方式显示你可能是一个注重细节的人，或者你只是习惯性地把所有想法都写出来。`
        : `Your average message length is ${Math.round(safeAvgPayload)} characters, with a style index of ${safeStyleIndex.toFixed(1)}. You're an "eloquent speaker" who likes to describe requirements in detail. This detailed communication style suggests you might be detail-oriented, or you're just used to writing down all your thoughts.`,
      vibe_level: '雄辩家',
    };
  } else if (safeStyleIndex < 20) {
    return {
      title: isZh ? '冷酷极客' : 'Cold Geek',
      content: isZh
        ? `你的平均消息长度为 ${Math.round(safeAvgPayload)} 字符，交互风格指数为 ${safeStyleIndex.toFixed(1)}。你属于"冷酷极客"类型，喜欢简洁指令。这种极简的沟通方式显示你可能是一个效率至上的人，或者你只是不喜欢说废话。`
        : `Your average message length is ${Math.round(safeAvgPayload)} characters, with a style index of ${safeStyleIndex.toFixed(1)}. You're a "cold geek" who prefers concise commands. This minimalist communication style suggests you might be efficiency-first, or you just don't like small talk.`,
      vibe_level: '冷酷极客',
    };
  }

  // 兜底文案
  return {
    title: isZh ? '标准型开发者' : 'Standard Developer',
    content: isZh
      ? `你的交互风格指数为 ${safeStyleIndex.toFixed(1)}，属于标准型开发者。你在与 AI 的对话中保持了平衡的沟通方式，既不过于详细，也不过于简洁。`
      : `Your style index is ${safeStyleIndex.toFixed(1)}, making you a standard developer. You maintain a balanced communication style with AI, neither too detailed nor too concise.`,
    vibe_level: '标准型',
  };
}

/**
 * 路由：/api/v2/analyze (全量重构版本)
 * 功能：接收聊天数据，计算 5 维度得分，返回完整分析结果（包括文案）
 * 核心特性：
 * 1. 身份匿名化：统一将 user_name 设为 '匿名受害者'
 * 2. 全量维度指标：包含五维分、衍生排名、基础统计、特征编码
 * 3. 异步存储：使用 waitUntil 幂等 Upsert（按 fingerprint 覆盖更新）
 * 4. 地理与环境：支持 IP 定位和语言识别
 */
app.post('/api/v2/analyze', async (c) => {
  try {
    // 【V6 协议】Payload 大小校验
    const contentLength = c.req.header('content-length');
    if (contentLength && parseInt(contentLength) > MAX_PAYLOAD_SIZE) {
      return c.json({
        status: 'error',
        error: '请求体过大，最大允许 5MB',
        errorCode: 'PAYLOAD_TOO_LARGE',
      }, 413);
    }

    const body: V6AnalyzePayload = await c.req.json();
    // 【地理与环境】使用 body.lang 或默认 'zh-CN'
    const lang = body.lang || 'zh-CN';
    const { chatData } = body;
    
    // 【V6 协议】优先使用前端上报的 stats 和 dimensions
    const v6Stats = body.stats;
    const v6Dimensions = body.dimensions;

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

    // 【V6 协议】优先使用前端上报的 dimensions，否则从 chatData 计算
    let dimensions: { L: number; P: number; D: number; E: number; F: number };
    if (v6Dimensions && typeof v6Dimensions.L === 'number') {
      dimensions = v6Dimensions;
      console.log('[Worker] 📊 使用前端上报的 V6 dimensions:', dimensions);
    } else if (userMessages.length > 0) {
      // 使用 scoring.ts 中的算法计算维度得分
      dimensions = calculateDimensions(userMessages);
      console.log('[Worker] 📊 从 chatData 计算维度得分:', dimensions);
    } else {
      // 兜底：使用默认值
      dimensions = { L: 50, P: 50, D: 50, E: 50, F: 50 };
      console.warn('[Worker] ⚠️ 无法计算维度得分，使用默认值');
    }

    // 【V6 协议】构建或使用前端上报的 stats
    let finalStats: V6Stats;
    if (v6Stats && v6Stats.totalChars !== undefined) {
      // 【安全修复】确保前端上报的 stats 包含所有必需字段
      const totalChars = Number(v6Stats.totalChars) || 0;
      const totalMessages = Number(v6Stats.totalMessages) || userMessages.length || 1;
      const calculatedStyleIndex = totalMessages > 0 ? totalChars / totalMessages : 50;
      
      finalStats = {
        ...v6Stats,
        // 【关键修复】确保 style_index 和 avg_payload 有值
        style_index: Number(v6Stats.style_index) || calculatedStyleIndex,
        avg_payload: Number(v6Stats.avg_payload) || calculatedStyleIndex,
        // 确保其他必需字段有默认值
        tease_count: Number(v6Stats.tease_count) || 0,
        nonsense_count: Number(v6Stats.nonsense_count) || 0,
        slang_count: Number(v6Stats.slang_count) || 0,
        abuse_count: Number(v6Stats.abuse_count) || 0,
        abuse_value: Number(v6Stats.abuse_value) || 0,
        ketao_count: Number(v6Stats.ketao_count) || 0,
        jiafang_count: Number(v6Stats.jiafang_count) || 0,
      };
      console.log('[Worker] 📊 使用前端上报的 V6 stats:', {
        totalChars: finalStats.totalChars,
        ketao_count: finalStats.ketao_count,
        jiafang_count: finalStats.jiafang_count,
        tease_count: finalStats.tease_count,
        style_index: finalStats.style_index,
        avg_payload: finalStats.avg_payload,
      });
    } else {
      // 从 chatData 计算基础 stats（简化版本，完整版本应由前端 Worker 计算）
      const totalChars = userMessages.reduce((sum, msg) => sum + (msg.text?.length || 0), 0);
      const totalMessages = userMessages.length;
      finalStats = {
        totalChars,
        totalMessages,
        ketao_count: 0,
        jiafang_count: 0,
        tease_count: 0,
        nonsense_count: 0,
        slang_count: 0,
        abuse_count: 0,
        abuse_value: 0,
        tech_stack: {},
        work_days: 1,
        code_ratio: 0,
        feedback_density: 0,
        balance_score: 50,
        diversity_score: 0,
        style_index: totalMessages > 0 ? totalChars / totalMessages : 0,
        style_label: '标准型',
        avg_payload: totalMessages > 0 ? totalChars / totalMessages : 0,
        blackword_hits: {
          chinese_slang: {},
          english_slang: {},
        },
      };
      console.log('[Worker] 📊 从 chatData 构建基础 stats（简化版）');
    }

    // 【调试日志】输出维度计算结果
    console.log('[Worker] 📊 最终维度计算结果:', {
      L: dimensions.L,
      P: dimensions.P,
      D: dimensions.D,
      E: dimensions.E,
      F: dimensions.F,
      totalMessages: finalStats.totalMessages,
      totalChars: finalStats.totalChars,
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

    // 【计算额外统计信息】用于 work_days, jiafang_count, ketao_count
    // 计算使用天数（从消息时间戳中提取唯一日期数量，或从 body 中获取）
    let workDays = 1;
    if (body.usageDays !== undefined || body.days !== undefined || body.workDays !== undefined) {
      workDays = body.usageDays || body.days || body.workDays || 1;
    } else if (userMessages.length > 0) {
      // 从消息时间戳中提取唯一日期
      const uniqueDates = new Set<string>();
      userMessages.forEach((msg: any) => {
        if (msg.timestamp) {
          try {
            const date = new Date(msg.timestamp).toISOString().split('T')[0];
            uniqueDates.add(date);
          } catch (e) {
            // 忽略无效时间戳
          }
        }
      });
      workDays = Math.max(1, uniqueDates.size || 1);
    }

    // 计算"不"字次数（甲方上身 - jiafang_count）
    let jiafangCount = 0;
    if (body.buCount !== undefined || body.jiafang !== undefined || body.negationCount !== undefined) {
      jiafangCount = body.buCount || body.jiafang || body.negationCount || 0;
    } else {
      // 从消息中统计"不"字
      userMessages.forEach((msg: any) => {
        const text = msg.text || msg.content || '';
        const matches = text.match(/不/g);
        if (matches) {
          jiafangCount += matches.length;
        }
      });
    }

    // 计算"请"字次数（赛博磕头 - ketao_count）
    let ketaoCount = 0;
    if (body.qingCount !== undefined || body.ketao !== undefined || body.politeCount !== undefined) {
      ketaoCount = body.qingCount || body.ketao || body.politeCount || 0;
    } else {
      // 从消息中统计"请"字
      userMessages.forEach((msg: any) => {
        const text = msg.text || msg.content || '';
        const matches = text.match(/请/g);
        if (matches) {
          ketaoCount += matches.length;
        }
      });
    }

    // 构建基础统计对象（用于 payload）
    const basicAnalysis = {
      day: workDays,
      no: jiafangCount,
      please: ketaoCount,
      totalMessages: totalMessages,
      totalChars: totalChars,
      l: dimensions.L,
      p: dimensions.P,
      d: dimensions.D,
      e: dimensions.E,
      f: dimensions.F,
    };

    // 【地理与环境】从请求头获取 IP 国家信息
    const ipLocation = c.req.header('cf-ipcountry') || 'Unknown';
    const normalizedIpLocation = (ipLocation && ipLocation.trim() && ipLocation !== 'XX') 
      ? ipLocation.toUpperCase() 
      : 'Unknown';

    // 【V6 协议】动态排名计算：从 KV 获取 GLOBAL_STATS_V6，计算百分比排名
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
    let globalStatsV6: GlobalStatsV6 | null = null;

    // 优先从 KV 获取全局统计数据（用于动态排名）
    if (env.STATS_STORE) {
      globalStatsV6 = await getGlobalStatsV6(env);
      if (globalStatsV6) {
        totalUsers = globalStatsV6.totalUsers || 1;
        console.log('[Worker] ✅ 从 KV 获取全局统计数据:', {
          totalUsers,
          avgDimensions: globalStatsV6.avgDimensions,
        });
      }
    }

    // 如果 KV 中没有，尝试从 Supabase 获取
    if (!globalStatsV6 && env.SUPABASE_URL && env.SUPABASE_KEY) {
      try {
        const [totalUsersRes, statsRes] = await Promise.all([
          fetch(`${env.SUPABASE_URL}/rest/v1/v_global_stats_v6?select=totalUsers`, {
            headers: {
              'apikey': env.SUPABASE_KEY,
              'Authorization': `Bearer ${env.SUPABASE_KEY}`,
            },
          }),
          fetch(`${env.SUPABASE_URL}/rest/v1/v_global_stats_v6?select=*`, {
            headers: {
              'apikey': env.SUPABASE_KEY,
              'Authorization': `Bearer ${env.SUPABASE_KEY}`,
            },
          }),
        ]);

        if (totalUsersRes.ok) {
          const totalData = await totalUsersRes.json();
          totalUsers = totalData[0]?.totalUsers || 1;
          if (totalUsers <= 0) {
            totalUsers = 1;
          }
        }

        if (statsRes.ok) {
          const statsData = await statsRes.json();
          const stats = statsData[0] || {};
          globalStatsV6 = {
            totalUsers,
            avgDimensions: {
              L: Number(stats.avg_l ?? stats.avg_L ?? 50),
              P: Number(stats.avg_p ?? stats.avg_P ?? 50),
              D: Number(stats.avg_d ?? stats.avg_D ?? 50),
              E: Number(stats.avg_e ?? stats.avg_E ?? 50),
              F: Number(stats.avg_f ?? stats.avg_F ?? 50),
            },
            avgStats: {
              ketao_count: 0,
              jiafang_count: 0,
              tease_count: 0,
              nonsense_count: 0,
              slang_count: 0,
              abuse_value: 0,
              style_index: 0,
              avg_payload: 0,
            },
            topBlackwords: [],
            lastUpdate: Math.floor(Date.now() / 1000),
          };
        }
      } catch (error) {
        console.warn('[Worker] ⚠️ 从 Supabase 获取全局统计失败:', error);
      }
    }

    // 【V6 协议】使用动态排名算法计算百分比排名
    if (globalStatsV6 && totalUsers > 1) {
      const { avgDimensions, avgStats } = globalStatsV6;
      
      ranks = {
        L_rank: calculatePercentileRank(dimensions.L, avgDimensions.L, totalUsers),
        P_rank: calculatePercentileRank(dimensions.P, avgDimensions.P, totalUsers),
        D_rank: calculatePercentileRank(dimensions.D, avgDimensions.D, totalUsers),
        E_rank: calculatePercentileRank(dimensions.E, avgDimensions.E, totalUsers),
        F_rank: calculatePercentileRank(dimensions.F, avgDimensions.F, totalUsers),
        messageRank: calculatePercentileRank(finalStats.totalMessages, avgStats.avg_payload || 1, totalUsers),
        charRank: calculatePercentileRank(finalStats.totalChars, avgStats.avg_payload || 1, totalUsers),
        daysRank: calculatePercentileRank(finalStats.work_days, 1, totalUsers),
        jiafangRank: calculatePercentileRank(finalStats.jiafang_count, avgStats.jiafang_count || 1, totalUsers),
        ketaoRank: calculatePercentileRank(finalStats.ketao_count, avgStats.ketao_count || 1, totalUsers),
        avgRank: Math.floor((
          calculatePercentileRank(dimensions.L, avgDimensions.L, totalUsers) +
          calculatePercentileRank(dimensions.P, avgDimensions.P, totalUsers) +
          calculatePercentileRank(dimensions.D, avgDimensions.D, totalUsers) +
          calculatePercentileRank(dimensions.E, avgDimensions.E, totalUsers) +
          calculatePercentileRank(dimensions.F, avgDimensions.F, totalUsers)
        ) / 5),
      };

      console.log('[Worker] ✅ V6 动态排名已计算:', {
        totalUsers,
        ranks,
        dimensions,
      });
    } else {
      // 降级到原有排名查询逻辑
      if (env.SUPABASE_URL && env.SUPABASE_KEY) {
        try {
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
            getRankCount('total_messages', finalStats.totalMessages),
            getRankCount('total_chars', finalStats.totalChars),
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

          console.log('[Worker] ✅ 降级排名数据已计算:', {
            totalUsers,
            ranks,
            dimensions,
          });
        } catch (error) {
          console.warn('[Worker] ⚠️ 获取排名数据失败，使用默认值:', error);
          totalUsers = 1;
        }
      }
    }

    // 【V6 协议】生成答案之书文案
    const answerBook = generateVibeDiagnosis(finalStats, dimensions, lang);
    console.log('[Worker] 📖 答案之书文案已生成:', answerBook);

    // 【重构】使用适配器函数 matchLPDEFContent 从 rank-content.ts 获取每个维度的称号和吐槽文案
    // 优先使用适配器函数（直接匹配 rank-content.ts）
    let detailedStats: Array<{
      dimension: string;
      score: number;
      label: string;
      roast: string;
    }> = [];
    
    try {
      // 使用新的适配器函数
      console.log('[Worker] 🔍 开始调用适配器函数 matchLPDEFContent:', {
        dimensions,
        lang,
        dimensionsKeys: Object.keys(dimensions),
        dimensionsValues: Object.values(dimensions),
      });
      
      detailedStats = matchLPDEFContent(dimensions, lang);
      
      console.log('[Worker] ✅ 通过适配器函数生成详细统计数据:', {
        count: detailedStats.length,
        dimensions: detailedStats.map(s => ({
          dimension: s.dimension,
          score: s.score,
          hasLabel: !!s.label,
          hasRoast: !!s.roast && s.roast !== '暂无吐槽文案',
          labelPreview: s.label?.substring(0, 20),
          roastPreview: s.roast?.substring(0, 30),
        })),
      });
      
      // 【降级方案】如果适配器函数返回的数据不完整，尝试从 Supabase 获取
      if (detailedStats.length < 5) {
        console.warn('[Worker] ⚠️ 适配器函数返回数据不完整，尝试降级方案:', {
          expected: 5,
          actual: detailedStats.length,
          missingDimensions: ['L', 'P', 'D', 'E', 'F'].filter(
            dim => !detailedStats.find(s => s.dimension === dim)
          ),
        });
        const dbLang = lang === 'en' ? 'en' : 'cn';
        const rankLang = lang === 'en' ? 'en' : 'zh';
        
        // 遍历缺失的维度
        for (const [dimKey, dimValue] of Object.entries(dimensions)) {
          const existing = detailedStats.find(s => s.dimension === dimKey);
          if (!existing) {
            const level = mapDimensionScoreToLevel(dimValue);
            let roast = await getRoastFromSupabase(env, dimKey, level, dbLang);
            const label = getDimensionLabelFromRank(dimKey, dimValue, rankLang);
            
            if (!roast) {
              const rankId = DIMENSION_KEY_MAPPING[dimKey];
              if (rankId && RANK_DATA[rankId]) {
                const rankValue = mapDimensionValueToRankValue(dimKey, dimValue, finalStats);
                const rankResult = getRankResult(rankId, rankValue, rankLang);
                if (rankResult?.comment?.content) {
                  roast = rankResult.comment.content;
                } else if (rankResult?.commentEn?.content && rankLang === 'en') {
                  roast = rankResult.commentEn.content;
                }
              }
            }
            
            detailedStats.push({
              dimension: dimKey,
              score: dimValue,
              label: label,
              roast: roast || '暂无吐槽文案'
            });
          }
        }
      }
    } catch (error) {
      console.error('[Worker] ❌ 适配器函数执行失败，使用降级方案:', error);
      // 降级到原有逻辑
      const dbLang = lang === 'en' ? 'en' : 'cn';
      const rankLang = lang === 'en' ? 'en' : 'zh';
      
      for (const [dimKey, dimValue] of Object.entries(dimensions)) {
        const level = mapDimensionScoreToLevel(dimValue);
        let roast = await getRoastFromSupabase(env, dimKey, level, dbLang);
        const label = getDimensionLabelFromRank(dimKey, dimValue, rankLang);
        
        if (!roast) {
          const rankId = DIMENSION_KEY_MAPPING[dimKey];
          if (rankId && RANK_DATA[rankId]) {
            const rankValue = mapDimensionValueToRankValue(dimKey, dimValue, finalStats);
            const rankResult = getRankResult(rankId, rankValue, rankLang);
            if (rankResult?.comment?.content) {
              roast = rankResult.comment.content;
            } else if (rankResult?.commentEn?.content && rankLang === 'en') {
              roast = rankResult.commentEn.content;
            }
          }
        }
        
        detailedStats.push({
          dimension: dimKey,
          score: dimValue,
          label: label,
          roast: roast || '暂无吐槽文案'
        });
      }
    }
    
    console.log('[Worker] ✅ 详细统计数据已生成（最终）:', {
      count: detailedStats.length,
      dimensions: detailedStats.map(s => ({
        dimension: s.dimension,
        score: s.score,
        label: s.label,
        roastLength: s.roast?.length || 0,
        roastPreview: s.roast?.substring(0, 50) + '...',
      })),
      allDimensionsPresent: ['L', 'P', 'D', 'E', 'F'].every(
        dim => detailedStats.find(s => s.dimension === dim)
      ),
    });

    // 【V6 架构】将所有维度的吐槽文案合并成完整的 roast_text（用于保存到 user_analysis 表）
    const combinedRoastText = detailedStats
      .filter(stat => stat.roast && stat.roast !== '暂无吐槽文案')
      .map(stat => `【${stat.dimension}维度】${stat.roast}`)
      .join('\n\n');
    
    console.log('[Worker] ✅ 合并后的吐槽文案:', combinedRoastText.substring(0, 100) + '...');

    // 【新增】生成 analysis 对象（人格分析详情）
    const analysis = {
      type: personalityType,
      name: personalityName,
      description: roastText,
      traits: [
        dimensions.L >= 70 ? (lang === 'en' ? 'Code-Heavy' : '代码重度使用者') : null,
        dimensions.P >= 70 ? (lang === 'en' ? 'Patient' : '耐心型') : dimensions.P < 40 ? (lang === 'en' ? 'Impatient' : '急躁型') : null,
        dimensions.D >= 70 ? (lang === 'en' ? 'Detail-Oriented' : '细节控') : null,
        dimensions.E >= 10 ? (lang === 'en' ? 'Tech Explorer' : '技术探索者') : null,
        dimensions.F >= 70 ? (lang === 'en' ? 'Polite' : '礼貌型') : null,
      ].filter(Boolean),
      dimensions: {
        L: { value: dimensions.L, level: dimensions.L >= 70 ? 'high' : dimensions.L >= 40 ? 'mid' : 'low' },
        P: { value: dimensions.P, level: dimensions.P >= 70 ? 'high' : dimensions.P >= 40 ? 'mid' : 'low' },
        D: { value: dimensions.D, level: dimensions.D >= 70 ? 'high' : dimensions.D >= 40 ? 'mid' : 'low' },
        E: { value: dimensions.E, level: dimensions.E >= 10 ? 'high' : dimensions.E >= 5 ? 'mid' : 'low' },
        F: { value: dimensions.F, level: dimensions.F >= 70 ? 'high' : dimensions.F >= 40 ? 'mid' : 'low' },
      },
    };

    // 【新增】生成 semanticFingerprint 对象（语义指纹）- 完整版本
    const getLevelLabel = (val: number, dim: string, isZh: boolean) => {
      const threshold = dim === 'E' ? 12 : 40;
      const highThreshold = dim === 'E' ? 30 : 70;
      if (val >= highThreshold) return isZh ? '高' : 'High';
      if (val >= threshold) return isZh ? '中' : 'Med';
      return isZh ? '低' : 'Low';
    };
    
    const isZh = lang === 'zh-CN';
    const codeRatioPercent = Math.round((finalStats.code_ratio || 0) * 100);
    const feedbackDensityPercent = Math.round(dimensions.F);
    
    const semanticFingerprint = {
      lpdef: lpdef,
      vibeIndex: vibeIndex,
      compositeScore: Math.round((dimensions.L + dimensions.P + dimensions.D + dimensions.E + dimensions.F) / 5),
      techDiversity: dimensions.E >= 30 ? (isZh ? '极高' : 'Extreme') : (dimensions.E >= 12 ? (isZh ? '中等' : 'Moderate') : (isZh ? '较低' : 'Low')),
      interactionStyle: dimensions.F >= 70 ? (isZh ? 'Warm' : 'Warm') : dimensions.F >= 40 ? (isZh ? 'Balanced' : 'Balanced') : (isZh ? 'Cold' : 'Cold'),
      codeRatio: `${codeRatioPercent}%`,
      patienceLevel: getLevelLabel(dimensions.P, 'P', isZh) + (isZh ? '耐心' : ' Patience'),
      detailLevel: getLevelLabel(dimensions.D, 'D', isZh) + (isZh ? '细腻' : ' Detail'),
      techExploration: getLevelLabel(dimensions.E, 'E', isZh) + (isZh ? '探索' : ' Explore'),
      feedbackDensity: `${feedbackDensityPercent}%`,
      avgPayload: finalStats.avg_payload || 0,
      // 添加描述文本
      codeRatioDesc: isZh ? `代码占比 ${codeRatioPercent}%，反映你的对话中代码内容的比例` : `Code ratio ${codeRatioPercent}%, reflecting the proportion of code content in your conversations`,
      patienceLevelDesc: isZh ? `耐心水平为${getLevelLabel(dimensions.P, 'P', isZh)}，${dimensions.P >= 70 ? '你很有耐心，愿意等待AI的回复' : dimensions.P < 40 ? '你比较急躁，希望快速得到结果' : '你的耐心水平处于中等'}` : `Patience level is ${getLevelLabel(dimensions.P, 'P', isZh)}, ${dimensions.P >= 70 ? 'you are very patient and willing to wait for AI responses' : dimensions.P < 40 ? 'you are impatient and want quick results' : 'your patience level is moderate'}`,
      detailLevelDesc: isZh ? `细腻程度为${getLevelLabel(dimensions.D, 'D', isZh)}，${dimensions.D >= 70 ? '你注重细节，会详细描述需求' : dimensions.D < 40 ? '你倾向于简洁表达' : '你的表达方式较为平衡'}` : `Detail level is ${getLevelLabel(dimensions.D, 'D', isZh)}, ${dimensions.D >= 70 ? 'you pay attention to details and describe requirements in detail' : dimensions.D < 40 ? 'you tend to express concisely' : 'your expression is relatively balanced'}`,
      techExplorationDesc: isZh ? `技术探索为${getLevelLabel(dimensions.E, 'E', isZh)}，${dimensions.E >= 30 ? '你广泛探索各种技术栈' : dimensions.E >= 12 ? '你探索中等数量的技术' : '你专注于少数技术领域'}` : `Tech exploration is ${getLevelLabel(dimensions.E, 'E', isZh)}, ${dimensions.E >= 30 ? 'you explore a wide range of tech stacks' : dimensions.E >= 12 ? 'you explore a moderate number of technologies' : 'you focus on a few technical areas'}`,
      feedbackDensityDesc: isZh ? `反馈密度为${feedbackDensityPercent}%，反映你与AI的互动频率` : `Feedback density is ${feedbackDensityPercent}%, reflecting your interaction frequency with AI`,
      compositeScoreDesc: isZh ? `综合得分 ${Math.round((dimensions.L + dimensions.P + dimensions.D + dimensions.E + dimensions.F) / 5)} 分，基于五维度的加权平均` : `Composite score ${Math.round((dimensions.L + dimensions.P + dimensions.D + dimensions.E + dimensions.F) / 5)} points, based on weighted average of five dimensions`,
      techDiversityDesc: isZh ? `技术多样性为${dimensions.E >= 30 ? '极高' : dimensions.E >= 12 ? '中等' : '较低'}，反映你使用的技术栈范围` : `Tech diversity is ${dimensions.E >= 30 ? 'extreme' : dimensions.E >= 12 ? 'moderate' : 'low'}, reflecting the range of tech stacks you use`,
      interactionStyleDesc: isZh ? `交互风格为${dimensions.F >= 70 ? 'Warm' : dimensions.F >= 40 ? 'Balanced' : 'Cold'}，${dimensions.F >= 70 ? '你与AI的交互非常友好和礼貌' : dimensions.F >= 40 ? '你与AI的交互保持平衡' : '你与AI的交互较为直接和简洁'}` : `Interaction style is ${dimensions.F >= 70 ? 'Warm' : dimensions.F >= 40 ? 'Balanced' : 'Cold'}, ${dimensions.F >= 70 ? 'your interaction with AI is very friendly and polite' : dimensions.F >= 40 ? 'your interaction with AI is balanced' : 'your interaction with AI is direct and concise'}`,
    };

    // 【V6 协议】构建返回结果（包含 answer_book、analysis、semanticFingerprint）
    const result = {
      status: 'success',
      dimensions: dimensions,
      roastText: roastText,
      personalityName: personalityName,
      vibeIndex: vibeIndex,
      personalityType: personalityType,
      lpdef: lpdef,
      statistics: {
        totalMessages: finalStats.totalMessages,
        avgMessageLength: finalStats.avg_payload,
        totalChars: finalStats.totalChars,
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
      // 【V6 协议】答案之书文案
      answer_book: answerBook,
      // 【新增】人格分析详情
      analysis: analysis,
      // 【新增】语义指纹
      semanticFingerprint: semanticFingerprint,
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
        },
        // 【V6 协议】包含 stats 字段（用于调试）
        stats: finalStats,
      },
      personality: {
        type: personalityType,
        // 【重构】详细统计数据数组，包含每个维度的称号和吐槽文案
        detailedStats: detailedStats,
      }
    };

    // 【异步存储】使用 waitUntil 异步写入 Supabase
    if (env.SUPABASE_URL && env.SUPABASE_KEY) {
      try {
        const executionCtx = c.executionCtx;
        if (executionCtx && typeof executionCtx.waitUntil === 'function') {
          // 【幂等 Upsert】生成稳定 userId + 基于 userId 的固定 fingerprint
          // 只根据前 10 条消息的内容生成指纹，忽略由于后续对话增加导致的字符总数变化
          // 使用静态特征（消息内容）而非统计结果（total_chars, total_messages）
          const stableMessages = userMessages.slice(0, 10);
          const stableContent = stableMessages
            .map((msg: any) => msg.text || msg.content || '')
            .join('');
          
          // 如果没有任何消息内容，使用 lpdef 作为后备
          const fingerprintSource = stableContent || lpdef;
          const fingerprintUint8 = new TextEncoder().encode(fingerprintSource);
          const fingerprintBuffer = await crypto.subtle.digest('SHA-256', fingerprintUint8);
          const stableFingerprint = Array.from(new Uint8Array(fingerprintBuffer))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
          
          // 当前 V2 接口请求体仅包含 chatData/lang，因此将稳定内容指纹作为 userId（幂等身份）
          const userId = stableFingerprint;
          const fingerprint = await generateFingerprint(userId, totalChars);
          
          console.log('[Worker] 🔑 生成指纹（基于前10条消息内容）:', {
            fingerprint,
            stableFingerprint,
            messagesUsed: stableMessages.length,
            contentLength: stableContent.length,
            fallbackUsed: !stableContent,
          });

          // 【V6 协议】构建完整的数据负载（包含 jsonb 字段存储完整 stats）
          // 注意：created_at 和 updated_at 由数据库自动生成，不需要手动设置
          // 核心：fingerprint 作为幂等 Upsert 的业务主键
          // 【V6 协议】使用 v6Stats 或从 finalStats 构建
          const v6StatsForStorage = v6Stats || finalStats;
          
          const payload: any = {
            fingerprint: v6Dimensions ? (body.fingerprint || fingerprint) : fingerprint,
            user_name: body.userName || '匿名受害者',
            personality_type: personalityType,
            
            // 【字段名对齐】使用数据库字段名：l_score, p_score, d_score, e_score, f_score
            l_score: Math.max(0, Math.min(100, Math.round(dimensions.L))),
            p_score: Math.max(0, Math.min(100, Math.round(dimensions.P))),
            d_score: Math.max(0, Math.min(100, Math.round(dimensions.D))),
            e_score: Math.max(0, Math.min(100, Math.round(dimensions.E))),
            f_score: Math.max(0, Math.min(100, Math.round(dimensions.F))),
            
            // 【向后兼容】保留旧字段名（如果数据库需要）
            l: Math.max(0, Math.min(100, Math.round(dimensions.L))),
            p: Math.max(0, Math.min(100, Math.round(dimensions.P))),
            d: Math.max(0, Math.min(100, Math.round(dimensions.D))),
            e: Math.max(0, Math.min(100, Math.round(dimensions.E))),
            f: Math.max(0, Math.min(100, Math.round(dimensions.F))),
            
            // 【V6 协议】核心字段：使用 finalStats 的值
            work_days: v6StatsForStorage.work_days || basicAnalysis.day || 1,
            jiafang_count: v6StatsForStorage.jiafang_count || basicAnalysis.no || 0,
            ketao_count: v6StatsForStorage.ketao_count || basicAnalysis.please || 0,
            
            vibe_index: vibeIndex,
            total_messages: v6StatsForStorage.totalMessages || basicAnalysis.totalMessages,
            total_chars: v6StatsForStorage.totalChars || basicAnalysis.totalChars,
            lpdef: lpdef,
            lang: body.lang || 'zh-CN',
            updated_at: new Date().toISOString(),
            
            // 【V6 架构】保存从 answer_book 获取的合并吐槽文案
            roast_text: combinedRoastText || null,
            
            // 【V6 协议】将完整的 stats 存入 jsonb 字段（确保未来维度增加到 100 个时也不需要改数据库 Schema）
            stats: v6StatsForStorage, // 完整的 V6Stats 对象，包含所有 40 个维度
            
            // 【关键修复】添加 personality 对象，包含 detailedStats 数组（五维语义指纹数据）
            // 数据格式：{ type: string, detailedStats: Array<{ dimension, score, label, roast }> }
            personality: {
              type: personalityType,
              detailedStats: detailedStats, // 包含 L, P, D, E, F 五个维度的详细统计数据
            },
            
            // 【新增】personality_data 字段：包含称号和随机吐槽的五个维度数组（JSONB）
            // 格式：Array<{ dimension, score, label, roast }>
            personality_data: detailedStats, // 直接使用 detailedStats 数组
          };
          
          // 【调试日志】验证 payload 中的数据
          console.log('[Worker] 🔍 Payload 数据验证:', {
            hasDetailedStats: !!detailedStats,
            detailedStatsLength: detailedStats?.length || 0,
            hasPersonality: !!payload.personality,
            personalityDetailedStatsLength: payload.personality?.detailedStats?.length || 0,
            hasPersonalityData: !!payload.personality_data,
            personalityDataLength: payload.personality_data?.length || 0,
            personalityDataPreview: payload.personality_data?.slice(0, 2).map((d: any) => ({
              dimension: d.dimension,
              score: d.score,
              hasLabel: !!d.label,
              hasRoast: !!d.roast,
            })),
          });

          // 检查是否在内网/VPN 环境
          // 尝试从 Cloudflare 请求对象获取国家信息
          try {
            const rawRequest = c.req.raw as any;
            if (rawRequest.cf && rawRequest.cf.country) {
              payload.ip_location = rawRequest.cf.country;
            } else {
              payload.ip_location = normalizedIpLocation;
            }
          } catch (e) {
            payload.ip_location = normalizedIpLocation;
          }

          console.log(`[DB] 准备写入数据:`, {
            fingerprint: payload.fingerprint,
            user_name: payload.user_name,
            lpdef,
            total_messages: payload.total_messages,
            total_chars: payload.total_chars,
            work_days: payload.work_days,
            jiafang_count: payload.jiafang_count,
            ketao_count: payload.ketao_count,
            ip_location: payload.ip_location,
            lang: payload.lang,
          });

          // 【异步存储】使用 waitUntil 幂等 Upsert（按 fingerprint 冲突则更新）
          // 执行写入
          // 【修复重复登记】使用 Upsert 模式，显式指定 onConflict
          // Supabase REST API 的 Upsert 通过 URL 参数 on_conflict 和 Prefer 头实现
          const supabaseUrl = `${env.SUPABASE_URL}/rest/v1/user_analysis?on_conflict=fingerprint`;
          executionCtx.waitUntil(
            Promise.all([
              // 写入 Supabase（增强错误处理）
              (async () => {
                try {
                  const res = await fetch(supabaseUrl, {
                    method: 'POST',
                    headers: {
                      'apikey': env.SUPABASE_KEY!,
                      'Authorization': `Bearer ${env.SUPABASE_KEY}`,
                      'Content-Type': 'application/json',
                      'Prefer': 'resolution=merge-duplicates', // 冲突时合并（更新），配合 on_conflict=fingerprint 使用
                    },
                    body: JSON.stringify(payload),
                  });
                  
                  if (!res.ok) {
                    const errorText = await res.text().catch(() => '无法读取错误信息');
                    console.error('[Supabase] ❌ Upsert 失败:', {
                      status: res.status,
                      statusText: res.statusText,
                      error: errorText,
                      fingerprint: payload.fingerprint,
                      payloadKeys: Object.keys(payload),
                      l_score: payload.l_score,
                      p_score: payload.p_score,
                      d_score: payload.d_score,
                      e_score: payload.e_score,
                      f_score: payload.f_score,
                      hasPersonalityData: !!payload.personality_data,
                      personalityDataLength: payload.personality_data?.length || 0,
                    });
                    throw new Error(`Supabase Upsert 失败: ${res.status} ${res.statusText} - ${errorText}`);
                  } else {
                    console.log('[Supabase] ✅ 数据已成功写入:', {
                      fingerprint: payload.fingerprint,
                      work_days: payload.work_days,
                      jiafang_count: payload.jiafang_count,
                      ketao_count: payload.ketao_count,
                      hasStats: !!payload.stats,
                      hasPersonality: !!payload.personality,
                      detailedStatsCount: payload.personality?.detailedStats?.length || 0,
                      hasPersonalityData: !!payload.personality_data,
                      personalityDataLength: payload.personality_data?.length || 0,
                      l_score: payload.l_score,
                      p_score: payload.p_score,
                      d_score: payload.d_score,
                      e_score: payload.e_score,
                      f_score: payload.f_score,
                    });
                  }
                } catch (err: any) {
                  console.error('[Supabase] ❌ Upsert 异常:', {
                    error: err.message || err,
                    stack: err.stack,
                    fingerprint: payload.fingerprint,
                    payloadPreview: JSON.stringify(payload).substring(0, 500),
                  });
                  // 不抛出错误，避免影响主流程
                }
              })(),
              // 【V6 协议】增量更新 KV 全局统计
              (async () => {
                try {
                  await updateGlobalStatsV6(env, finalStats, dimensions);
                } catch (err: any) {
                  console.warn('[Worker] ⚠️ V6 全局统计更新失败:', {
                    error: err.message || err,
                    stack: err.stack,
                  });
                }
              })(),
            ]).catch(err => {
              // 全局错误捕获
              console.error('[Worker] ❌ waitUntil 任务执行失败:', {
                error: err.message || err,
                stack: err.stack,
              });
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
 * 路由：/api/fingerprint/identify
 * 功能：根据指纹识别用户（On Load）
 * 当页面加载时，前端调用此接口查询用户信息
 */
app.post('/api/fingerprint/identify', async (c) => {
  try {
    const env = c.env;
    const body = await c.req.json();
    const { fingerprint } = body;

    if (!fingerprint) {
      return c.json({
        status: 'error',
        error: 'fingerprint 参数必填',
        errorCode: 'MISSING_FINGERPRINT',
      }, 400);
    }

    if (!env.SUPABASE_URL || !env.SUPABASE_KEY) {
      return c.json({
        status: 'error',
        error: 'Supabase 配置缺失',
        errorCode: 'SUPABASE_NOT_CONFIGURED',
      }, 500);
    }

    const userData = await identifyUserByFingerprint(fingerprint, env);

    if (userData) {
      return c.json({
        status: 'success',
        data: userData,
        message: '用户识别成功',
      });
    } else {
      return c.json({
        status: 'not_found',
        data: null,
        message: '未找到匹配的用户',
      });
    }
  } catch (error: any) {
    console.error('[Worker] /api/fingerprint/identify 错误:', error);
    return c.json({
      status: 'error',
      error: error.message || '未知错误',
      errorCode: 'INTERNAL_ERROR',
    }, 500);
  }
});

/**
 * 路由：/api/fingerprint/bind
 * 功能：绑定 GitHub ID 和指纹（On Save）
 * 当用户输入 GitHub ID 并保存时，前端调用此接口执行 UPSERT 操作
 */
app.post('/api/fingerprint/bind', async (c) => {
  try {
    const env = c.env;
    const body = await c.req.json();
    const { githubUsername, fingerprint } = body;

    if (!githubUsername || !fingerprint) {
      return c.json({
        status: 'error',
        error: 'githubUsername 和 fingerprint 参数必填',
        errorCode: 'MISSING_PARAMETERS',
      }, 400);
    }

    if (!env.SUPABASE_URL || !env.SUPABASE_KEY) {
      return c.json({
        status: 'error',
        error: 'Supabase 配置缺失',
        errorCode: 'SUPABASE_NOT_CONFIGURED',
      }, 500);
    }

    const userData = await bindFingerprintToUser(githubUsername, fingerprint, env);

    if (userData) {
      return c.json({
        status: 'success',
        data: userData,
        message: '身份绑定成功',
      });
    } else {
      return c.json({
        status: 'error',
        error: '身份绑定失败',
        errorCode: 'BIND_FAILED',
      }, 500);
    }
  } catch (error: any) {
    console.error('[Worker] /api/fingerprint/bind 错误:', error);
    return c.json({
      status: 'error',
      error: error.message || '未知错误',
      errorCode: 'INTERNAL_ERROR',
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
      // 强制写入明确数值（保底 50），并与数据库列名（小写）保持一致
      l: Number(dimensions?.L) || 50,        // 小写字段映射
      p: Number(dimensions?.P) || 50,
      d: Number(dimensions?.D) || 50,
      e: Number(dimensions?.E) || 50,
      f: Number(dimensions?.F) || 50,
      dimensions: dimensions,      // 同时保留完整的 JSONB 格式
      vibe_index: vibeIndex,
      personality_type: personality, // 注意：user_analysis 表使用 personality_type，不是 personality
      total_messages: userMessages,  // 注意：user_analysis 表使用 total_messages，不是 user_messages
      total_chars: totalChars,      // 注意：user_analysis 表使用 total_chars，不是 total_user_chars
      ip_location: clientIP !== 'anonymous' ? clientIP : '未知', // 从请求头获取 IP
      // 注意：roast_text 由 /api/v2/analyze 路由生成并保存
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
      fetch(`${env.SUPABASE_URL}/rest/v1/v_global_stats_v6?select=totalUsers`, {
        headers: { 
          'apikey': env.SUPABASE_KEY, 
          'Authorization': `Bearer ${env.SUPABASE_KEY}` 
        },
      }),
      fetch(`${env.SUPABASE_URL}/rest/v1/v_global_stats_v6?select=*`, {
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
      totalUsers = totalData[0]?.totalUsers || 1;
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
    const env = c.env;
    
    // 【禁用旧缓存测试】暂时注释掉 KV 缓存读取逻辑，强制每次请求都实时查询 Supabase
    // 【简化版本】优先使用视图直接获取数据
    if (env.SUPABASE_URL && env.SUPABASE_KEY) {
      try {
        // 💡 检查这里的 URL 是否正确指向了你刚才创建的 v6 视图
        // 1. 获取视图数据（从 v_global_stats_v6 视图）
        const statsRes = await fetch(`${env.SUPABASE_URL}/rest/v1/v_global_stats_v6?select=*`, {
          headers: { 
            'apikey': env.SUPABASE_KEY, 
            'Authorization': `Bearer ${env.SUPABASE_KEY}` 
          }
        });
        
        if (!statsRes.ok) {
          const errorText = await statsRes.text().catch(() => '无法读取错误信息');
          console.error('[Worker] ❌ Supabase 视图返回异常:', {
            status: statsRes.status,
            statusText: statsRes.statusText,
            error: errorText
          });
          throw new Error(`Supabase View Error: HTTP ${statsRes.status} - ${errorText}`);
        }
        
        // ✅ 如果到达这里，说明视图查询成功
        const statsData = await statsRes.json();
        const stats = statsData[0] || {};
        
        // 验证数据是否有效（如果为空，使用兜底逻辑）
        if (!stats || Object.keys(stats).length === 0) {
          console.warn('[Worker] ⚠️ 视图返回空数据，使用默认值');
          // 不抛出错误，而是使用默认值继续处理
        }

        // 2. 获取人格排行 (调用 v_personality_rank 视图)
        let personalityRank: Array<{ type: string; count: number; percentage: number }> = [];
          try {
            const rankRes = await fetch(`${env.SUPABASE_URL}/rest/v1/v_personality_rank?select=*`, {
              headers: { 
                'apikey': env.SUPABASE_KEY, 
                'Authorization': `Bearer ${env.SUPABASE_KEY}` 
              }
            });
            
            if (rankRes.ok) {
              const rankData = await rankRes.json();
              if (Array.isArray(rankData) && rankData.length > 0) {
                personalityRank = rankData.map((item: any) => ({
                  type: item.personality_type || item.type || 'UNKNOWN',
                  count: Number(item.count || item.personality_count || 0),
                  percentage: Number(item.percentage || 0),
                }));
                console.log('[Worker] ✅ 获取人格排行成功:', personalityRank.length, '条');
              }
            } else {
              console.warn('[Worker] ⚠️ 人格排行查询失败，HTTP 状态:', rankRes.status);
            }
          } catch (rankError) {
            console.warn('[Worker] ⚠️ 获取人格排行失败，使用空数组:', rankError);
          }

          // 3. 获取地理位置排行
          let locationRank: Array<{ name: string; value: number }> = [];
          try {
            const locationRes = await fetch(`${env.SUPABASE_URL}/rest/v1/user_analysis?select=ip_location&ip_location=not.is.null`, {
              headers: { 
                'apikey': env.SUPABASE_KEY, 
                'Authorization': `Bearer ${env.SUPABASE_KEY}` 
              }
            });
            
            if (locationRes.ok) {
              const locationData = await locationRes.json();
              if (Array.isArray(locationData) && locationData.length > 0) {
                const locationMap = new Map<string, number>();
                locationData.forEach((item: any) => {
                  if (item.ip_location && item.ip_location !== '未知') {
                    const count = locationMap.get(item.ip_location) || 0;
                    locationMap.set(item.ip_location, count + 1);
                  }
                });
                locationRank = Array.from(locationMap.entries())
                  .map(([location, count]) => ({ name: location, value: Number(count) || 0 }))
                  .sort((a, b) => b.value - a.value)
                  .slice(0, 5);
                console.log('[Worker] ✅ 获取地理位置排行成功:', locationRank.length, '条');
              }
            } else {
              console.warn('[Worker] ⚠️ 地理位置排行查询失败，HTTP 状态:', locationRes.status);
            }
          } catch (locationError) {
            console.warn('[Worker] ⚠️ 获取地理位置排行失败，使用空数组:', locationError);
          }

          // 4. 获取最近受害者
          let recentVictims: Array<{ name: string; type: string; location: string; time: string }> = [];
          try {
            const recentRes = await fetch(`${env.SUPABASE_URL}/rest/v1/user_analysis?select=personality_type,ip_location,created_at,user_name&order=created_at.desc&limit=5`, {
              headers: { 
                'apikey': env.SUPABASE_KEY, 
                'Authorization': `Bearer ${env.SUPABASE_KEY}` 
              }
            });
            
            if (recentRes.ok) {
              const recentData = await recentRes.json();
              if (Array.isArray(recentData) && recentData.length > 0) {
                recentVictims = recentData.map((item: any, index: number) => ({
                  name: item.user_name || `匿名受害者${index + 1}`,
                  type: item.personality_type || 'UNKNOWN',
                  location: item.ip_location || '未知',
                  time: item.created_at || new Date().toISOString(),
                }));
                console.log('[Worker] ✅ 获取最近受害者成功:', recentVictims.length, '条');
              }
            } else {
              console.warn('[Worker] ⚠️ 最近受害者查询失败，HTTP 状态:', recentRes.status);
            }
          } catch (recentError) {
            console.warn('[Worker] ⚠️ 获取最近受害者失败，使用空数组:', recentError);
          }

          // 4.5. 获取王者池数据（用于前端选拔各维度最强王者）
          // 关键：只选取 l_score > 0 或 total_messages > 0 的记录（剔除无意义的自动上报空数据）
          let allUsersData: any[] = [];
          try {
            // 方案1：先获取最近 100 条记录，然后在客户端过滤
            // 因为 Supabase PostgREST 的 or 查询语法较复杂，我们采用客户端过滤
            const userAnalysisRes = await fetch(`${env.SUPABASE_URL}/rest/v1/user_analysis?select=*&order=created_at.desc&limit=100`, {
              headers: { 
                'apikey': env.SUPABASE_KEY, 
                'Authorization': `Bearer ${env.SUPABASE_KEY}` 
              }
            });
            
            if (userAnalysisRes.ok) {
              const rawData = await userAnalysisRes.json();
              // 客户端过滤：只保留 l_score > 0 或 total_messages > 0 的记录
              allUsersData = rawData.filter((user: any) => {
                const lScore = Number(user.l_score ?? user.l ?? 0);
                const totalMessages = Number(user.total_messages ?? 0);
                return lScore > 0 || totalMessages > 0;
              });
              console.log('[Worker] ✅ 获取王者池数据成功:', allUsersData.length, '条（已从', rawData.length, '条中过滤）');
            } else {
              const errorText = await userAnalysisRes.text().catch(() => '无法读取错误信息');
              console.warn('[Worker] ⚠️ 获取王者池数据失败，HTTP 状态:', userAnalysisRes.status, errorText);
            }
          } catch (allUsersError) {
            console.warn('[Worker] ⚠️ 获取王者池数据失败，使用空数组:', allUsersError);
          }

          // 4.6. 【新增】获取各维度的最高记录（Top Performers）
          // 使用 v_top_records 视图获取各维度的最高记录
          // 视图返回：top_ai, top_day, top_no, top_say, top_please, top_word
          let topRecords: any = {};
          try {
            const topRecordsRes = await fetch(
              `${env.SUPABASE_URL}/rest/v1/v_top_records?select=*`,
              {
                headers: { 
                  'apikey': env.SUPABASE_KEY, 
                  'Authorization': `Bearer ${env.SUPABASE_KEY}` 
                }
              }
            );
            
            if (topRecordsRes.ok) {
              const topRecordsData = await topRecordsRes.json();
              if (Array.isArray(topRecordsData) && topRecordsData.length > 0) {
                const topData = topRecordsData[0];
                
                // 映射视图字段到前端维度 ID
                // top_ai -> ai (赛博霸总，以 question_message_count 排序)
                if (topData.top_ai) {
                  topRecords['ai'] = topData.top_ai;
                  console.log('[Worker] ✅ 获取 ai 维度最高记录 (question_message_count):', topData.top_ai.question_message_count);
                }
                
                // top_day -> day (上岗天数)
                if (topData.top_day) {
                  topRecords['day'] = topData.top_day;
                  console.log('[Worker] ✅ 获取 day 维度最高记录 (work_days):', topData.top_day.work_days);
                }
                
                // top_no -> no (甲方上身)
                if (topData.top_no) {
                  topRecords['no'] = topData.top_no;
                  console.log('[Worker] ✅ 获取 no 维度最高记录 (jiafang_count):', topData.top_no.jiafang_count);
                }
                
                // top_say -> say (累计字数，使用 total_user_chars)
                if (topData.top_say) {
                  topRecords['say'] = topData.top_say;
                  console.log('[Worker] ✅ 获取 say 维度最高记录 (total_user_chars):', topData.top_say.total_user_chars);
                }
                
                // top_please -> please (赛博磕头)
                if (topData.top_please) {
                  topRecords['please'] = topData.top_please;
                  console.log('[Worker] ✅ 获取 please 维度最高记录 (ketao_count):', topData.top_please.ketao_count);
                }
                
                // top_word -> word (平均长度，使用 avg_user_message_length)
                if (topData.top_word) {
                  topRecords['word'] = topData.top_word;
                  console.log('[Worker] ✅ 获取 word 维度最高记录 (avg_user_message_length):', topData.top_word.avg_user_message_length);
                }
                
                console.log('[Worker] ✅ 从 v_top_records 视图获取各维度最高记录完成:', Object.keys(topRecords).length, '个维度');
              } else {
                console.warn('[Worker] ⚠️ v_top_records 视图返回空数组');
              }
            } else {
              const errorText = await topRecordsRes.text().catch(() => '无法读取错误信息');
              console.warn('[Worker] ⚠️ 获取 v_top_records 视图失败，HTTP 状态:', topRecordsRes.status, errorText);
            }
          } catch (topRecordsError) {
            console.warn('[Worker] ⚠️ 获取各维度最高记录失败，使用空对象:', topRecordsError);
          }

        // 5. 数据清洗与聚合：字段精准映射（对齐 stats2.html 需求）
          // 5.1. 全局平均值（兜底逻辑：即使视图返回 null 或 0，也要有默认值）
          const globalAverage = {
            L: Number(stats.avg_l ?? stats.avg_L ?? 50),
            P: Number(stats.avg_p ?? stats.avg_P ?? 50),
            D: Number(stats.avg_d ?? stats.avg_D ?? 50),
            E: Number(stats.avg_e ?? stats.avg_E ?? 50),
            F: Number(stats.avg_f ?? stats.avg_F ?? 50),
          };
          
          // 5.2. 核心统计字段（兜底逻辑：使用 ?? 确保 null/undefined 时使用默认值）
          // totalUsers: 独立用户数（fingerprint 去重）- 从视图获取
          const totalUsers = Number(stats.totalUsers ?? stats.total_users ?? 0);
          
          // totalAnalysis: 汇总 total_messages - 从视图获取
          const totalAnalysis = Number(stats.totalAnalysis ?? stats.total_analysis ?? 0);
          
          // totalRoastWords: 汇总 total_chars（当前应约为 277,194）- 从视图获取
          const totalRoastWords = Number(stats.totalRoastWords ?? stats.total_roast_words ?? stats.total_chars ?? stats.total_words ?? 0);
          const totalChars = totalRoastWords; // 兼容字段
          
          // 5.3. 计算平均值（防御性除法）
          const calcAvg = (total: number, base: number): number => {
            if (!base || base <= 0 || !Number.isFinite(base)) return 0;
            return Number((total / base).toFixed(1));
          };
          
          // avgCharsPerUser: totalRoastWords / totalUsers
          const avgCharsPerUser = calcAvg(totalRoastWords, totalUsers);
          
          // avgPerScan: totalRoastWords / totalAnalysis（当前应约为 288.4）
          const avgPerScan = calcAvg(totalRoastWords, totalAnalysis);
          
          // 向后兼容：保留旧字段 avgPerUser（与 avgCharsPerUser 等价）
          const avgPerUser = avgCharsPerUser;
          
          // 5.4. latestRecords: 过滤后的原始数据数组（用于前端 LPDEF 专家榜筛选）
          const latestRecords = allUsersData.length > 0 ? allUsersData : [];
          
          const responseData = {
            status: "success",
            success: true,
            averages: globalAverage,
            globalAverage: globalAverage,
            totalUsers: totalUsers,
            dimensions: {
              L: { label: '逻辑力' },
              P: { label: '耐心值' },
              D: { label: '细腻度' },
              E: { label: '情绪化' },
              F: { label: '频率感' }
            },
            data: {
              globalAverage: globalAverage,
              totalUsers: totalUsers,
              dimensions: {
                L: { label: '逻辑力' },
                P: { label: '耐心值' },
                D: { label: '细腻度' },
                E: { label: '情绪化' },
                F: { label: '频率感' }
              }
            },
            totalRoastWords: totalRoastWords,
            totalChars: totalChars,
            totalAnalysis: totalAnalysis,
            avgPerUser: avgPerUser,
            avgPerScan: avgPerScan,
            // 【显式返回新字段】给前端/缓存刷新使用
            avgCharsPerUser: avgCharsPerUser,
            systemDays: Number(stats.system_days || 1),
            cityCount: Number(stats.city_count || 0),
            avgChars: Number(stats.avg_chars || 0),
            locationRank: locationRank,
            recentVictims: recentVictims,
            personalityRank: personalityRank,
            personalityDistribution: personalityRank,
            latestRecords: latestRecords,
            // 【新增】各维度的最高记录（用于"全球最强模式"）
            topRecords: topRecords,
            source: 'live_database_v7', // ✅ 重构后版本：包含过滤后的王者池数据
          };

          console.log('[Worker] ✅ 从视图直接返回数据:', {
            totalUsers: responseData.totalUsers,
            totalAnalysis: responseData.totalAnalysis,
            totalRoastWords: responseData.totalRoastWords,
            avgPerUser: responseData.avgPerUser,
            avgPerScan: responseData.avgPerScan,
            avgCharsPerUser: responseData.avgCharsPerUser,
            cityCount: responseData.cityCount,
            personalityRankCount: responseData.personalityRank.length,
            locationRankCount: responseData.locationRank.length,
            recentVictimsCount: responseData.recentVictims.length,
            latestRecordsCount: responseData.latestRecords.length,
            source: responseData.source,
          });

          // 【缓存更新】在返回前，将这些新数据以 live_database 为 source 写入 KV，TTL 设置为 60 秒
          if (env.STATS_STORE) {
            try {
              const cacheData = {
                ...responseData,
                source: 'live_database',
                cachedAt: Math.floor(Date.now() / 1000),
              };
              // 使用 put 方法的 options 参数设置 TTL（60 秒）
              // 注意：Cloudflare KV put 方法支持第三个参数设置 TTL，但类型定义可能未更新
              await (env.STATS_STORE.put as any)(KV_KEY_GLOBAL_STATS_CACHE, JSON.stringify(cacheData), {
                expirationTtl: 60, // TTL 设置为 60 秒
              });
              await env.STATS_STORE.put(KV_KEY_LAST_UPDATE, Math.floor(Date.now() / 1000).toString());
              console.log('[Worker] ✅ 已写入 KV 缓存（source: live_database, TTL: 60秒）');
            } catch (kvError) {
              console.warn('[Worker] ⚠️ 写入 KV 缓存失败（不影响返回）:', kvError);
            }
          }

        return c.json(responseData);
      } catch (viewError: any) {
        // 异常处理：如果 Supabase 查询结果为空，返回默认的统计数值
        console.error('[Worker] ❌ 视图查询失败，返回默认值:', viewError);
        
        // 返回默认值，防止前端卡片崩掉
        const defaultResponse = {
          status: "success",
          success: true,
          averages: { L: 50, P: 50, D: 50, E: 50, F: 50 },
          globalAverage: { L: 50, P: 50, D: 50, E: 50, F: 50 },
          totalUsers: 0,
          totalAnalysis: 0,
          totalRoastWords: 0,
          totalChars: 0,
          avgPerUser: 0,
          avgPerScan: 0,
          avgCharsPerUser: 0,
          systemDays: 1,
          cityCount: 0,
          avgChars: 0,
          locationRank: [],
          recentVictims: [],
          personalityRank: [],
          personalityDistribution: [],
          latestRecords: [],
          dimensions: {
            L: { label: '逻辑力' },
            P: { label: '耐心值' },
            D: { label: '细腻度' },
            E: { label: '情绪化' },
            F: { label: '频率感' }
          },
          data: {
            globalAverage: { L: 50, P: 50, D: 50, E: 50, F: 50 },
            totalUsers: 0,
            dimensions: {
              L: { label: '逻辑力' },
              P: { label: '耐心值' },
              D: { label: '细腻度' },
              E: { label: '情绪化' },
              F: { label: '频率感' }
            }
          },
          source: 'default_fallback'
        };
        
        return c.json(defaultResponse);
      }
    }

    // 【原有逻辑】如果视图查询失败或未配置，使用原有逻辑
    // 【禁用旧缓存测试】暂时注释掉 KV 缓存读取逻辑，强制每次请求都实时查询 Supabase
    // 降级：如果视图查询失败，直接调用 fetchFromSupabase
    const defaultDimensions = {
      L: { label: '逻辑力' },
      P: { label: '耐心值' },
      D: { label: '细腻度' },
      E: { label: '情绪化' },
      F: { label: '频率感' }
    };
    const defaultAverage = { L: 50, P: 50, D: 50, E: 50, F: 50 };
    
    console.log('[Worker] ⚠️ 视图查询失败或未配置，降级到 fetchFromSupabase');
    console.log('--- 正在穿透缓存获取最新数据 ---');
    return await fetchFromSupabase(env, defaultAverage, defaultDimensions, c, true);
    
    /* 【已禁用】旧 KV 缓存读取逻辑
    // 【强制置顶判断】将 force_refresh 判断放在函数第一行
    const forceRefresh = c.req.query('force_refresh') === 'true';

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
    // 【KV 缓存原子性】优先从 GLOBAL_STATS_CACHE 读取完整统计数据
    try {
      // 优先尝试读取原子性缓存
      const globalStatsCache = await env.STATS_STORE.get(KV_KEY_GLOBAL_STATS_CACHE, 'json');
      const cachedData = await env.STATS_STORE.get(KV_KEY_GLOBAL_AVERAGE, 'json');
      const lastUpdate = await env.STATS_STORE.get(KV_KEY_LAST_UPDATE);

      // 【KV 缓存原子性】优先使用原子性缓存 GLOBAL_STATS_CACHE
      if (globalStatsCache && lastUpdate) {
        const lastUpdateTime = parseInt(lastUpdate, 10);
        const now = Math.floor(Date.now() / 1000);
        const age = now - lastUpdateTime;

        // 如果缓存未过期（1小时内），直接返回原子性缓存数据
        if (age < KV_CACHE_TTL) {
          console.log(`[Worker] ✅ 从 KV 原子性缓存返回数据（${age}秒前更新）`);
          
          // 【数据类型强制转换】确保从缓存读取的数据都是数字类型
          const cachedGlobalAverage = globalStatsCache.globalAverage || defaultAverage;
          const finalTotalUsers = Number(globalStatsCache.totalUsers) || 1;
          const finalTotalAnalysis = Number(globalStatsCache.totalAnalysis) || 0;
          const finalTotalChars = Number(globalStatsCache.totalChars) || 0;
          const finalTotalRoastWords = Number(globalStatsCache.totalRoastWords) || 0;
          const finalCityCount = Number(globalStatsCache.cityCount) || 0;
          const finalSystemDays = Number(globalStatsCache.systemDays) || 1;
          const finalAvgChars = Number(globalStatsCache.avgChars) || 0;
          const finalAvgPerScan = Number(globalStatsCache.avgPerScan) || 0;
          const finalAvgCharsPerUser = Number(globalStatsCache.avgCharsPerUser) || 0;
          const finalPersonalityDistribution = globalStatsCache.personalityDistribution || [];
          const finalLatestRecords = globalStatsCache.latestRecords || [];
          
          // 即使使用缓存，也需要获取其他统计数据（最近受害者、地理位置等）
          // 这些数据变化频繁，不适合缓存
          if (env.SUPABASE_URL && env.SUPABASE_KEY) {
            try {
              // 并行查询统计数据
              const [recentVictimsRes, allLocationsRes] = await Promise.all([
                // 最近受害者（最新的 5 条记录）
                fetch(`${env.SUPABASE_URL}/rest/v1/user_analysis?select=personality_type,ip_location,created_at,user_name&order=created_at.desc&limit=5`, {
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
              ]);

              // 处理最近受害者
              let recentVictims: Array<{ name: string; type: string; location: string; time: string }> = [];
              if (recentVictimsRes.ok) {
                try {
                  const victimsData = await recentVictimsRes.json();
                  recentVictims = victimsData.map((item: any, index: number) => {
                    const type = item.personality_type || 'UNKNOWN';
                    const location = item.ip_location || '未知';
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
                  // 映射为前端要求的格式：{ name: location, value: count }
                  locationRank = Array.from(locationMap.entries())
                    .map(([location, count]) => ({ name: location, value: Number(count) || 0 }))
                    .sort((a, b) => b.value - a.value)
                    .slice(0, 5);
                } catch (error) {
                  console.warn('[Worker] ⚠️ 解析地理位置数据失败:', error);
                }
              }

              // 【核心重构】返回原子性缓存数据（所有数值已强制转换为数字）
              const responseData = {
                status: 'success',
                success: true,
                averages: cachedGlobalAverage,
                globalAverage: cachedGlobalAverage,
                totalUsers: finalTotalUsers,
                totalAnalysis: finalTotalAnalysis,
                totalChars: finalTotalChars,
                avgPerScan: finalAvgPerScan,
                avgCharsPerUser: finalAvgCharsPerUser,
                // 向后兼容
                avgPerUser: finalAvgCharsPerUser,
                systemDays: finalSystemDays,
                avgChars: finalAvgChars,
                dimensions: globalStatsCache.dimensions || defaultDimensions,
                data: {
                  globalAverage: cachedGlobalAverage,
                  totalUsers: finalTotalUsers,
                  totalAnalysis: finalTotalAnalysis,
                  totalChars: finalTotalChars,
                  avgPerScan: finalAvgPerScan,
                  avgCharsPerUser: finalAvgCharsPerUser,
                  avgPerUser: finalAvgCharsPerUser,
                  systemDays: finalSystemDays,
                  avgChars: finalAvgChars,
                  dimensions: globalStatsCache.dimensions || defaultDimensions,
                },
                totalRoastWords: finalTotalRoastWords,
                cityCount: finalCityCount,
                locationRank: locationRank,
                recentVictims: recentVictims,
                personalityDistribution: finalPersonalityDistribution,
                latestRecords: finalLatestRecords,
                source: 'kv_atomic_cache',
                cachedAt: lastUpdateTime,
                age: age,
              };

              console.log('[Worker] ✅ 从 KV 原子性缓存返回完整数据:', {
                totalUsers: responseData.totalUsers,
                totalAnalysis: responseData.totalAnalysis,
                totalChars: responseData.totalChars,
                allTypesAreNumber: typeof responseData.totalUsers === 'number' && 
                                  typeof responseData.totalAnalysis === 'number' && 
                                  typeof responseData.totalChars === 'number',
              });

              return c.json(responseData);
            } catch (error) {
              console.warn('[Worker] ⚠️ 获取统计数据失败，使用缓存默认值:', error);
            }
          }
          
          // 如果没有 Supabase 配置，直接返回原子性缓存数据
          const responseData = {
            status: 'success',
            success: true,
            averages: cachedGlobalAverage,
            globalAverage: cachedGlobalAverage,
      totalUsers: finalTotalUsers,
      totalAnalysis: finalTotalAnalysis,
      totalChars: finalTotalChars,
      avgPerScan: finalAvgPerScan,
      avgCharsPerUser: finalAvgCharsPerUser,
      avgPerUser: finalAvgCharsPerUser,
      systemDays: finalSystemDays,
      avgChars: finalAvgChars,
      dimensions: globalStatsCache.dimensions || defaultDimensions,
      data: {
        globalAverage: cachedGlobalAverage,
        totalUsers: finalTotalUsers,
        totalAnalysis: finalTotalAnalysis,
        totalChars: finalTotalChars,
        avgPerScan: finalAvgPerScan,
        avgCharsPerUser: finalAvgCharsPerUser,
        avgPerUser: finalAvgCharsPerUser,
        systemDays: finalSystemDays,
        avgChars: finalAvgChars,
        dimensions: globalStatsCache.dimensions || defaultDimensions,
      },
      totalRoastWords: finalTotalRoastWords,
      cityCount: finalCityCount,
      locationRank: [],
      recentVictims: [],
      personalityDistribution: finalPersonalityDistribution, // 人格分布（前三个）
      latestRecords: finalLatestRecords, // 最新记录（最近 5 条）
      source: 'kv_atomic_cache',
      cachedAt: lastUpdateTime,
      age: age,
    };

          return c.json(responseData);
        } else {
          console.log(`[Worker] ⚠️ KV 原子性缓存已过期（${age}秒），重新查询 Supabase`);
          console.log('--- 正在穿透缓存获取最新数据 ---');
          return await fetchFromSupabase(env, defaultAverage, defaultDimensions, c, true);
        }
      }
      
      // 【向后兼容】如果没有原子性缓存，尝试使用旧版缓存
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
          console.log(`[Worker] ✅ 从 KV 返回缓存数据（${age}秒前更新，使用旧版缓存）`);
          
          // 即使使用缓存，也需要获取其他统计数据（最近受害者、地理位置等）
          // 这些数据变化频繁，不适合缓存
          if (env.SUPABASE_URL && env.SUPABASE_KEY) {
            try {
              // 并行查询统计数据
              const [totalUsersRes, recentVictimsRes, allLocationsRes, dashboardSummaryRes, totalCharsRes, personalityRes] = await Promise.all([
                // 总用户数（从 v_global_stats_v6 视图获取）
                fetch(`${env.SUPABASE_URL}/rest/v1/v_global_stats_v6?select=totalUsers`, {
                  headers: {
                    'apikey': env.SUPABASE_KEY,
                    'Authorization': `Bearer ${env.SUPABASE_KEY}`,
                  },
                }),
                // 最近受害者（最新的 5 条记录）
                fetch(`${env.SUPABASE_URL}/rest/v1/user_analysis?select=personality_type,ip_location,created_at,user_name&order=created_at.desc&limit=5`, {
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
                // 获取所有 total_chars（用于计算总和、总数和平均值）
                fetch(`${env.SUPABASE_URL}/rest/v1/user_analysis?select=total_chars`, {
                  headers: {
                    'apikey': env.SUPABASE_KEY,
                    'Authorization': `Bearer ${env.SUPABASE_KEY}`,
                    'Prefer': 'count=exact',
                  },
                }),
                // 获取所有 personality_type（用于统计人格分布）
                fetch(`${env.SUPABASE_URL}/rest/v1/user_analysis?select=personality_type`, {
                  headers: {
                    'apikey': env.SUPABASE_KEY,
                    'Authorization': `Bearer ${env.SUPABASE_KEY}`,
                  },
                }),
              ]);

              // 处理总用户数（从 v_global_stats_v6 视图获取）
              let totalUsers = 1;
              let totalAnalysis = 0;
              let totalCharsSum = 0;
              let avgChars = 0;
              let personalityDistribution: Array<{ type: string; count: number }> = [];
              
              if (totalUsersRes.ok) {
                const totalData = await totalUsersRes.json();
                totalUsers = totalData[0]?.totalUsers || 1;
                if (totalUsers <= 0) {
                  totalUsers = 1;
                }
              }
              
              // 处理 total_chars 总和查询（用于计算 totalAnalysis、totalCharsSum 和 avgChars）
              if (totalCharsRes && totalCharsRes.ok) {
                try {
                  const contentRange = totalCharsRes.headers.get('content-range');
                  if (contentRange) {
                    const parts = contentRange.split('/');
                    if (parts.length === 2) {
                      totalAnalysis = Number(parts[1]) || 0;
                      if (isNaN(totalAnalysis)) {
                        totalAnalysis = 0;
                      }
                    }
                  }
                  
                  const charsData = await totalCharsRes.json();
                  if (Array.isArray(charsData)) {
                    // 如果 content-range 没有，使用数组长度作为总记录数
                    if (totalAnalysis === 0) {
                      totalAnalysis = Number(charsData.length) || 0;
                    }
                    
                    // 计算 total_chars 的总和
                    totalCharsSum = charsData.reduce((sum: number, item: any) => {
                      const chars = Number(item.total_chars) || 0;
                      if (isNaN(chars)) {
                        return sum;
                      }
                      return sum + chars;
                    }, 0);
                    
                    totalCharsSum = Number(totalCharsSum) || 0;
                    
                    // 计算平均吐槽字数
                    if (totalAnalysis > 0 && totalCharsSum > 0) {
                      avgChars = Number((totalCharsSum / totalAnalysis).toFixed(2)) || 0;
                    } else {
                      avgChars = 0;
                    }
                  }
                } catch (error) {
                  console.warn('[Worker] ⚠️ 处理 total_chars 数据失败:', error);
                }
              }
              
              // 处理人格分布
              if (personalityRes && personalityRes.ok) {
                try {
                  const personalityData = await personalityRes.json();
                  if (Array.isArray(personalityData)) {
                    // 统计每个人格类型的出现次数
                    const personalityMap = new Map<string, number>();
                    personalityData.forEach((item: any) => {
                      const type = item.personality_type || 'UNKNOWN';
                      const count = personalityMap.get(type) || 0;
                      personalityMap.set(type, count + 1);
                    });
                    
                    // 转换为数组并按出现次数排序，取前三个
                    personalityDistribution = Array.from(personalityMap.entries())
                      .map(([type, count]) => ({
                        type: type,
                        count: Number(count) || 0,
                      }))
                      .sort((a, b) => b.count - a.count)
                      .slice(0, 3);
                    
                    console.log('[Worker] ✅ 人格分布统计完成:', personalityDistribution);
                  }
                } catch (error) {
                  console.warn('[Worker] ⚠️ 处理人格分布失败:', error);
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
              let cachedTotalAnalysis = 0;
              let cachedTotalChars = 0;
              
              if (cachedData.dimensions) {
                // 新版本缓存：包含 dimensions，需要分离
                cachedGlobalAverage = {
                  L: cachedData.L || 50,
                  P: cachedData.P || 50,
                  D: cachedData.D || 50,
                  E: cachedData.E || 50,
                  F: cachedData.F || 50,
                };
                cachedTotalAnalysis = cachedData.totalAnalysis || 0;
                cachedTotalChars = cachedData.totalChars || 0;
              } else {
                // 旧版本缓存：不包含 dimensions，直接使用（理论上不会到这里，因为前面已经检查过）
                cachedGlobalAverage = cachedData;
              }
              
              const finalTotalUsers = totalUsers || 1;
              
              // 【硬编码注入】在返回之前，手动将 dimensions 字典注入到 JSON 中，确保万无一失
              // 返回结构包含：averages (L, P, D, E, F) 和 totalUsers
              const responseData = {
                status: 'success',
                success: true,
                // 1. 维度分（averages 字段，包含 L, P, D, E, F）
                averages: cachedGlobalAverage,
                // 1.1. 兼容性字段（保留 globalAverage 以保持向后兼容）
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
                totalChars: cachedTotalChars || totalCharsSum || totalRoastWords, // 优先使用缓存，否则使用查询结果，最后使用 totalRoastWords
                totalAnalysis: cachedTotalAnalysis || totalAnalysis || finalTotalUsers, // 优先使用缓存，否则使用查询结果，最后使用 totalUsers
                systemDays: 1, // 旧版缓存可能没有 systemDays，使用默认值
                avgChars: avgChars, // 从数据库查询获取
                cityCount: cityCount,
                locationRank: locationRank,
                recentVictims: recentVictims,
                personalityDistribution: personalityDistribution, // 从数据库查询获取
                latestRecords: recentVictims.map((v: any) => ({
                  personality_type: v.type,
                  ip_location: v.location,
                  created_at: v.time,
                  name: v.name,
                  type: v.type,
                  location: v.location,
                  time: v.time,
                })), // 从 recentVictims 转换
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
              // 返回结构包含：averages (L, P, D, E, F) 和 totalUsers
              const responseData = {
                status: 'success',
                success: true,
                // 1. 维度分（averages 字段，包含 L, P, D, E, F）
                averages: cachedGlobalAverage,
                // 1.1. 兼容性字段（保留 globalAverage 以保持向后兼容）
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
                totalChars: cachedTotalChars || 0,
                totalAnalysis: cachedTotalAnalysis || 1,
                systemDays: 1,
                avgChars: 0,
                cityCount: 0,
                locationRank: [],
                recentVictims: [],
                personalityDistribution: [],
                latestRecords: [],
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
            // 返回结构包含：averages (L, P, D, E, F) 和 totalUsers
            const responseData = {
              status: 'success',
              success: true,
              // 1. 维度分（averages 字段，包含 L, P, D, E, F）
              averages: cachedGlobalAverage,
              // 1.1. 兼容性字段（保留 globalAverage 以保持向后兼容）
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
              totalChars: 0,
              totalAnalysis: 1,
              systemDays: 1,
              avgChars: 0,
              cityCount: 0,
              locationRank: [],
              recentVictims: [],
              personalityDistribution: [],
              latestRecords: [],
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

    // 【已禁用】旧 KV 缓存逻辑结束
    */
  } catch (error: any) {
    console.error('[Worker] /api/global-average 错误:', error);
    const defaultAverage = { L: 50, P: 50, D: 50, E: 50, F: 50 };
    
    // 【硬编码注入】在返回之前，手动将 dimensions 字典注入到 JSON 中，确保万无一失
    // 返回结构包含：averages (L, P, D, E, F) 和 totalUsers
    const responseData: any = {
      status: 'error',
      success: false,
      error: error.message || '未知错误',
      // 即使出错也返回默认值，确保前端不会崩溃
      averages: defaultAverage,
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
      totalChars: 0,
      totalAnalysis: 0,
      // 【显式补齐字段】与 v_global_stats_v6 返回结构对齐
      avgPerScan: 0,
      avgCharsPerUser: 0,
      // 向后兼容
      avgPerUser: 0,
      systemDays: 1,
      avgChars: 0,
      cityCount: 0,
      locationRank: [],
      recentVictims: [],
      personalityDistribution: [],
      latestRecords: [],
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
    
    // 1. 获取总用户数（从 v_global_stats_v6）
    let totalUsers = 0;
    if (env.SUPABASE_URL && env.SUPABASE_KEY) {
      try {
        const res = await fetch(`${env.SUPABASE_URL}/rest/v1/v_global_stats_v6?select=totalUsers`, {
          headers: {
            'apikey': env.SUPABASE_KEY,
            'Authorization': `Bearer ${env.SUPABASE_KEY}`,
          },
        });
        if (res.ok) {
          const data = await res.json();
          totalUsers = data[0]?.totalUsers || 0;
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
    // 返回结构包含：averages (L, P, D, E, F) 和 totalUsers
    const responseData = {
      status: 'success',
      success: true,
      // 1. 维度分（averages 字段，包含 L, P, D, E, F）
      averages: defaultAverage,
      // 1.1. 兼容性字段（保留 globalAverage 以保持向后兼容）
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
      totalChars: 0,
      totalAnalysis: 0,
      // 【显式补齐字段】与 v_global_stats_v6 返回结构对齐
      avgPerScan: 0,
      avgCharsPerUser: 0,
      // 向后兼容
      avgPerUser: 0,
      systemDays: 1,
      avgChars: 0,
      cityCount: 0,
      locationRank: [],
      recentVictims: [],
      personalityDistribution: [],
      latestRecords: [],
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
    // 【从 v_global_stats_v6 视图获取数据】
    // 视图 A (v_global_stats_v6)：获取 averages (L, P, D, E, F) + 统计字段
    // 视图 B (extended_stats_view)：获取 location_rank 和 recent_victims 数据
    // 聚合查询：获取总记录数和 total_chars 总和
    const [globalStatsRes, extendedStatsRes, aggregationRes] = await Promise.all([
      // 视图 A：从 v_global_stats_v6 获取平均分和总用户数
      fetch(`${env.SUPABASE_URL}/rest/v1/v_global_stats_v6?select=*`, {
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
      // 聚合查询：从 user_analysis 表获取总记录数、total_chars 总和、最早创建时间、人格分布、平均长度和最新记录
      // 分成多个查询并行执行
      Promise.all([
        // 1) 获取最早时间（用于计算 systemDays）
        fetch(`${env.SUPABASE_URL}/rest/v1/user_analysis?select=created_at&order=created_at.asc&limit=1`, {
          headers: {
            'apikey': env.SUPABASE_KEY,
            'Authorization': `Bearer ${env.SUPABASE_KEY}`,
          },
        }),
        // 2) 获取所有 total_chars（用于计算总和、总数和平均值）
        fetch(`${env.SUPABASE_URL}/rest/v1/user_analysis?select=total_chars`, {
          headers: {
            'apikey': env.SUPABASE_KEY,
            'Authorization': `Bearer ${env.SUPABASE_KEY}`,
            'Prefer': 'count=exact',
          },
        }),
        // 3) 获取所有 personality_type（用于统计人格分布）
        fetch(`${env.SUPABASE_URL}/rest/v1/user_analysis?select=personality_type`, {
          headers: {
            'apikey': env.SUPABASE_KEY,
            'Authorization': `Bearer ${env.SUPABASE_KEY}`,
          },
        }),
        // 4) 获取最新 5 条记录（personality_type、ip_location、created_at 和 user_name）
        fetch(`${env.SUPABASE_URL}/rest/v1/user_analysis?select=personality_type,ip_location,created_at,user_name&order=created_at.desc&limit=5`, {
          headers: {
            'apikey': env.SUPABASE_KEY,
            'Authorization': `Bearer ${env.SUPABASE_KEY}`,
          },
        }),
      ]),
    ]);

    // 【处理视图 A (v_global_stats_v6)】获取 averages (L, P, D, E, F) 和 total_users
    let globalAverage: { L: number; P: number; D: number; E: number; F: number } = defaultAverage;
    let totalUsers: number = 1;
    let totalRoastWords: number = 0;
    let cityCount: number = 0;
    let totalAnalysis: number = 0; // 总记录数（分析次数）
    let totalCharsSum: number = 0; // total_chars 的总和（吐槽字数）
    let systemDays: number = 1; // 系统运行天数（从最早记录到现在）
    let avgChars: number = 0; // 平均吐槽字数（AVG(total_chars)）
    let avgPerScan: number = 0; // 【新增】单次平均篇幅（优先使用视图字段）
    let avgCharsPerUser: number = 0; // 【新增】人均平均篇幅（优先使用视图字段）
    let personalityDistribution: Array<{ type: string; count: number }> = []; // 人格分布（前三个）
    let latestRecords: Array<{ personality_type: string; ip_location: string; created_at: string; name: string; type: string; location: string; time: string }> = []; // 最新 5 条记录

    if (!globalStatsRes.ok) {
      console.error('[View Error] v_global_stats_v6:', `HTTP ${globalStatsRes.status} - ${globalStatsRes.statusText}`);
      // 如果视图 A 失败，降级到直接查询 user_analysis 表
      usedFallbackQuery = true;
      console.warn('[Worker] ⚠️ v_global_stats_v6 查询失败，降级到直接查询 user_analysis 表');
      
      // 注意：user_analysis 表标准字段是 total_chars（不是 total_user_chars）
      const userAnalysisRes = await fetch(`${env.SUPABASE_URL}/rest/v1/user_analysis?select=l,p,d,e,f,total_chars`, {
        headers: {
          'apikey': env.SUPABASE_KEY,
          'Authorization': `Bearer ${env.SUPABASE_KEY}`,
        },
      });

      if (userAnalysisRes.ok) {
        const allData = await userAnalysisRes.json();
        if (Array.isArray(allData) && allData.length > 0) {
          // 计算平均值
          const sum = allData.reduce((acc, item) => ({
            L: acc.L + (parseFloat(item.l) || 0),
            P: acc.P + (parseFloat(item.p) || 0),
            D: acc.D + (parseFloat(item.d) || 0),
            E: acc.E + (parseFloat(item.e) || 0),
            F: acc.F + (parseFloat(item.f) || 0),
          }), { L: 0, P: 0, D: 0, E: 0, F: 0 });

          const count = allData.length;
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
          totalAnalysis = count; // 降级查询时，总记录数等于用户数
          
          // 在 index.ts 的降级函数中增加（按 total_chars 汇总）
          totalRoastWords = allData.reduce((sum, item) => sum + (Number(item.total_chars) || 0), 0);
        } else {
          // 【保底逻辑】降级查询也返回空，使用保底数据（当前用户）
          console.log('[Worker] ⚠️ 降级查询返回空数据，使用保底数据（当前用户）');
          globalAverage = {
            L: 65,
            P: 45,
            D: 50,
            E: 55,
            F: 40
          };
          totalUsers = 1;
          totalAnalysis = 1;
        }
      } else {
        // 【保底逻辑】降级查询失败，使用保底数据（当前用户）
        console.log('[Worker] ⚠️ 降级查询失败，使用保底数据（当前用户）');
        globalAverage = {
          L: 65,
          P: 45,
          D: 50,
          E: 55,
          F: 40
        };
        totalUsers = 1;
        totalAnalysis = 1;
      }
    } else {
      try {
        const statsData = await globalStatsRes.json();
        let row = statsData[0] || {};
        
        // 【保底逻辑】如果数据库还没写入（第一个用户），手动返回保底对象
        // v_global_stats_v6 可能输出 totalUsers（小驼峰），兼容旧 total_users
        const viewTotalUsers = Number(row?.totalUsers ?? row?.total_users ?? 0) || 0;
        if (!row || viewTotalUsers <= 0) {
          console.log('[Worker] ⚠️ 数据库返回为空或 totalUsers 为 0，使用保底数据（当前用户）');
          row = {
            totalUsers: 1, // 强制显示 1，因为当前用户就在这
            total_users: 1, // 兼容旧字段
            avg_l: 65,
            avg_p: 45,
            avg_d: 50,
            avg_e: 55,
            avg_f: 40
          };
        }
        
        // 从 v_global_stats_v6 视图获取平均分数据（averages 字段）
        // 视图可能返回 avg_l, avg_p, avg_d, avg_e, avg_f 或 L, P, D, E, F
        globalAverage = {
          L: parseFloat(row.avg_l || row.avg_L || row.L || 50),
          P: parseFloat(row.avg_p || row.avg_P || row.P || 50),
          D: parseFloat(row.avg_d || row.avg_D || row.D || 50),
          E: parseFloat(row.avg_e || row.avg_E || row.E || 50),
          F: parseFloat(row.avg_f || row.avg_F || row.F || 50),
        };
        
        // 获取总用户数（从 total_users 字段）- 强制转换为数字
        // 【字段映射修正】兼容视图输出小驼峰（totalUsers）与旧下划线（total_users）
        totalUsers = Number(row.totalUsers ?? row.total_users ?? 0) || 0;
        if (isNaN(totalUsers) || totalUsers <= 0) {
          totalUsers = 1;
        }
        totalUsers = Number(totalUsers); // 确保是数字类型
        
        // 获取累计吐槽字数（如果视图包含）- 强制转换为数字
        // 【字段映射修正】兼容视图输出小驼峰（totalRoastWords）与旧下划线（total_roast_words）
        totalRoastWords = Number(row.totalRoastWords ?? row.total_roast_words ?? row.total_words ?? 0) || 0;
        if (isNaN(totalRoastWords)) {
          totalRoastWords = 0;
        }
        totalRoastWords = Number(totalRoastWords); // 确保是数字类型
        
        // 获取覆盖城市数（如果视图包含）- 强制转换为数字
        cityCount = Number(row.city_count || 0) || 0;
        if (isNaN(cityCount)) {
          cityCount = 0;
        }
        cityCount = Number(cityCount); // 确保是数字类型

        // 【明确字段提取】avgPerScan / avgCharsPerUser（优先使用 Supabase 视图字段，不做本地计算兜底）
        // 按要求：const avgPerScan = stats.avgPerScan || 0;
        avgPerScan = Number(row.avgPerScan ?? row.avg_per_scan ?? 0) || 0;
        avgCharsPerUser = Number(row.avgCharsPerUser ?? row.avg_chars_per_user ?? row.avgPerUser ?? row.avg_per_user ?? 0) || 0;
        
        console.log('[Worker] ✅ 从 v_global_stats_v6 获取数据:', {
          totalUsers,
          totalRoastWords,
          cityCount,
          globalAverage,
          avgPerScan,
          avgCharsPerUser,
        });
        
        // 【处理聚合查询】获取总记录数、total_chars 总和、systemDays、人格分布、平均长度和最新记录
        // 【数据类型强制转换】确保所有数值都是数字类型
        try {
          const [earliestRes, charsRes, personalityRes, latestRes] = await aggregationRes;
          
          // 处理最早记录查询（用于计算 systemDays）
          if (earliestRes && earliestRes.ok) {
            const earliestData = await earliestRes.json();
            if (Array.isArray(earliestData) && earliestData.length > 0) {
              const earliestRecord = earliestData[0];
              if (earliestRecord && earliestRecord.created_at) {
                try {
                  const earliestDate = new Date(earliestRecord.created_at);
                  const now = new Date();
                  const diffMs = now.getTime() - earliestDate.getTime();
                  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
                  systemDays = Number(diffDays) || 1;
                  if (systemDays <= 0) {
                    systemDays = 1; // 至少是 1 天
                  }
                  console.log('[Worker] ✅ 计算 systemDays:', {
                    earliestDate: earliestDate.toISOString(),
                    now: now.toISOString(),
                    diffDays: systemDays,
                  });
                } catch (error) {
                  console.warn('[Worker] ⚠️ 计算 systemDays 失败:', error);
                  systemDays = 1;
                }
              }
            }
          }
          
          // 处理 total_chars 总和查询
          if (charsRes && charsRes.ok) {
            const contentRange = charsRes.headers.get('content-range');
            if (contentRange) {
              const parts = contentRange.split('/');
              if (parts.length === 2) {
                // 强制转换为数字
                totalAnalysis = Number(parts[1]) || 0;
                if (isNaN(totalAnalysis)) {
                  totalAnalysis = 0;
                }
              }
            }
            
            const charsData = await charsRes.json();
            if (Array.isArray(charsData)) {
              // 如果 content-range 没有，使用数组长度作为总记录数
              if (totalAnalysis === 0) {
                totalAnalysis = Number(charsData.length) || 0;
              }
              
              // 计算 total_chars 的总和，强制转换为数字
              totalCharsSum = charsData.reduce((sum: number, item: any) => {
                // 使用 Number() 强制转换，处理字符串类型的数字
                const chars = Number(item.total_chars) || 0;
                if (isNaN(chars)) {
                  return sum;
                }
                return sum + chars;
              }, 0);
              
              // 确保 totalCharsSum 是数字类型
              totalCharsSum = Number(totalCharsSum) || 0;
              
              // 【计算平均吐槽字数】AVG(total_chars)
              if (totalAnalysis > 0 && totalCharsSum > 0) {
                avgChars = Number((totalCharsSum / totalAnalysis).toFixed(2)) || 0;
              } else {
                avgChars = 0;
              }
            }
          }
          
          // 【处理人格分布】GROUP BY personality_type，获取出现次数最多的前三个
          if (personalityRes && personalityRes.ok) {
            try {
              const personalityData = await personalityRes.json();
              if (Array.isArray(personalityData)) {
                // 统计每个人格类型的出现次数
                const personalityMap = new Map<string, number>();
                personalityData.forEach((item: any) => {
                  const type = item.personality_type || 'UNKNOWN';
                  const count = personalityMap.get(type) || 0;
                  personalityMap.set(type, count + 1);
                });
                
                // 转换为数组并按出现次数排序，取前三个
                personalityDistribution = Array.from(personalityMap.entries())
                  .map(([type, count]) => ({
                    type: type,
                    count: Number(count) || 0,
                  }))
                  .sort((a, b) => b.count - a.count)
                  .slice(0, 3);
                
                console.log('[Worker] ✅ 人格分布统计完成:', personalityDistribution);
              }
            } catch (error) {
              console.warn('[Worker] ⚠️ 处理人格分布失败:', error);
            }
          }
          
          // 【处理最新记录】获取最近 5 条诊断记录
          if (latestRes && latestRes.ok) {
            try {
              const latestData = await latestRes.json();
              if (Array.isArray(latestData)) {
                latestRecords = latestData.map((item: any, index: number) => ({
                  personality_type: item.personality_type || 'UNKNOWN',
                  ip_location: item.ip_location || '未知',
                  created_at: item.created_at || new Date().toISOString(),
                  name: item.user_name || `匿名受害者${index + 1}`,
                  type: item.personality_type || 'UNKNOWN',
                  location: item.ip_location || '未知',
                  time: item.created_at || new Date().toISOString(),
                }));
                
                console.log('[Worker] ✅ 最新记录获取完成:', latestRecords.length);
              }
            } catch (error) {
              console.warn('[Worker] ⚠️ 处理最新记录失败:', error);
            }
          }
          
          // 最终类型检查：确保所有值都是数字
          totalAnalysis = Number(totalAnalysis) || 0;
          totalCharsSum = Number(totalCharsSum) || 0;
          systemDays = Number(systemDays) || 1;
          avgChars = Number(avgChars) || 0;

          // 【统计口径校准】统一按定义计算均值（覆盖视图/旧字段差异）
          // Scan Words：totalRoastWords / totalAnalysis
          // Avg Words：totalRoastWords / totalUsers
          const calcAvg = (total: number, base: number): number => {
            if (!base || base <= 0 || !Number.isFinite(base)) return 0;
            return Number((total / base).toFixed(1));
          };
          avgPerScan = calcAvg(Number(totalRoastWords) || 0, totalAnalysis);
          avgCharsPerUser = calcAvg(Number(totalRoastWords) || 0, Number(totalUsers) || 0);
          
          console.log('[Worker] ✅ 聚合查询完成（已强制转换为数字）:', {
            totalAnalysis,
            totalAnalysisType: typeof totalAnalysis,
            totalCharsSum,
            totalCharsSumType: typeof totalCharsSum,
            systemDays,
            systemDaysType: typeof systemDays,
            avgChars,
            avgCharsType: typeof avgChars,
            personalityDistributionCount: personalityDistribution.length,
            latestRecordsCount: latestRecords.length,
          });
        } catch (error: any) {
          console.warn('[Worker] ⚠️ 聚合查询解析失败:', error);
          // 如果聚合查询失败，使用 totalUsers 作为 totalAnalysis 的降级值
          totalAnalysis = Number(totalUsers) || 0;
          totalCharsSum = 0;
          systemDays = 1; // 默认 1 天
          avgChars = 0;
          personalityDistribution = [];
          latestRecords = [];

          // 【统计口径校准】聚合失败时也按定义计算均值
          const calcAvg = (total: number, base: number): number => {
            if (!base || base <= 0 || !Number.isFinite(base)) return 0;
            return Number((total / base).toFixed(1));
          };
          avgPerScan = calcAvg(Number(totalRoastWords) || 0, totalAnalysis);
          avgCharsPerUser = calcAvg(Number(totalRoastWords) || 0, Number(totalUsers) || 0);
        }
      } catch (error: any) {
        console.error('[View Error] v_global_stats_v6:', error.message || '解析失败');
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
    // 【KV 缓存原子性】将所有统计指标打包成一个 JSON 对象存入 KV，保证数据的"时间点"一致
    if (updateKV && env.STATS_STORE) {
      try {
        const now = Math.floor(Date.now() / 1000);
        
        // 【数据类型强制转换】确保所有数值都是数字类型，避免前端动画函数报错
        const globalStatsCache = {
          // 维度平均分
          globalAverage: {
            L: Number(globalAverage.L) || 50,
            P: Number(globalAverage.P) || 50,
            D: Number(globalAverage.D) || 50,
            E: Number(globalAverage.E) || 50,
            F: Number(globalAverage.F) || 50,
          },
          // 维度标签定义
          dimensions: defaultDimensions,
          // 统计数据（全部强制转换为数字）
          totalUsers: Number(totalUsers) || 1,
          totalAnalysis: Number(totalAnalysis) || 0,
          totalChars: Number(totalCharsSum) || 0,
          totalRoastWords: Number(totalRoastWords) || 0,
          cityCount: Number(cityCount) || 0,
          systemDays: Number(systemDays) || 1,
          avgChars: Number(avgChars) || 0, // 平均吐槽字数
          // 【新增字段同步到 KV】强制覆盖旧缓存（包含新字段）
          avgPerScan: Number(avgPerScan) || 0,
          avgCharsPerUser: Number(avgCharsPerUser) || 0,
          // 人格分布（前三个）
          personalityDistribution: personalityDistribution,
          // 最新记录（最近 5 条）
          latestRecords: latestRecords,
          // 时间戳
          cachedAt: now,
        };
        
        // 原子性写入：将所有统计数据打包成一个 JSON 对象存入 KV
        await env.STATS_STORE.put(KV_KEY_GLOBAL_STATS_CACHE, JSON.stringify(globalStatsCache));
        
        // 兼容旧版本：同时写入 global_average（保持向后兼容）
        const cachePayload = {
          ...globalAverage,
          dimensions: defaultDimensions,
          totalAnalysis: Number(totalAnalysis) || 0,
          totalChars: Number(totalCharsSum) || 0,
        };
        await env.STATS_STORE.put(KV_KEY_GLOBAL_AVERAGE, JSON.stringify(cachePayload));
        await env.STATS_STORE.put(KV_KEY_LAST_UPDATE, now.toString());
        
        console.log('[Worker] ✅ 已更新 KV 缓存（原子性写入，包含所有统计数据）:', {
          totalUsers: globalStatsCache.totalUsers,
          totalAnalysis: globalStatsCache.totalAnalysis,
          totalChars: globalStatsCache.totalChars,
          avgChars: globalStatsCache.avgChars,
          avgPerScan: globalStatsCache.avgPerScan,
          avgCharsPerUser: globalStatsCache.avgCharsPerUser,
          systemDays: globalStatsCache.systemDays,
          personalityDistributionCount: globalStatsCache.personalityDistribution?.length || 0,
          latestRecordsCount: globalStatsCache.latestRecords?.length || 0,
          allTypesAreNumber: typeof globalStatsCache.totalUsers === 'number' && 
                            typeof globalStatsCache.totalAnalysis === 'number' && 
                            typeof globalStatsCache.totalChars === 'number' &&
                            typeof globalStatsCache.avgChars === 'number',
        });
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
    // 最终返回给前端的 JSON 必须包含：averages (L, P, D, E, F), totalUsers, totalRoastWords, cityCount, locationRank, recentVictims
    const responseData = {
      status: 'success',
      success: true,
      // 1. 维度分（averages 字段，包含 L, P, D, E, F）
      averages: globalAverage,
      // 1.1. 兼容性字段（保留 globalAverage 以保持向后兼容）
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
      totalChars: Number(totalCharsSum) || 0, // total_chars 的总和（吐槽字数）- 强制转换为数字
      totalAnalysis: Number(totalAnalysis) || 0, // 总记录数（分析次数）- 强制转换为数字
      // 【显式返回新字段】与 v_global_stats_v6 对齐
      avgPerScan: Number(avgPerScan) || 0,
      avgCharsPerUser: Number(avgCharsPerUser) || 0,
      // 向后兼容：旧字段名
      avgPerUser: Number(avgCharsPerUser) || 0,
      systemDays: Number(systemDays) || 1, // 系统运行天数 - 强制转换为数字
      cityCount: Number(cityCount) || 0, // 覆盖城市数 - 强制转换为数字
      avgChars: Number(avgChars) || 0, // 平均吐槽字数（AVG(total_chars)）- 强制转换为数字
      locationRank: locationRank, // 格式：{ name: string, value: number }
      recentVictims: recentVictims, // 格式：{ name: string, type: string, location: string, time: string }
      personalityDistribution: personalityDistribution, // 人格分布（前三个）- 格式：{ type: string, count: number }[]
      latestRecords: latestRecords, // 最新记录（最近 5 条）- 格式：{ personality_type: string, ip_location: string, created_at: string, name: string, type: string, location: string, time: string }[]
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
      // 即使出错也返回默认值，确保前端不会崩溃
      averages: defaultAverage,
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
      totalChars: 0, // total_chars 的总和（吐槽字数）
      totalAnalysis: 0, // 总记录数（分析次数）
      // 【显式补齐字段】与 v_global_stats_v6 返回结构对齐
      avgPerScan: 0,
      avgCharsPerUser: 0,
      // 向后兼容
      avgPerUser: 0,
      systemDays: 1,
      avgChars: 0, // 平均吐槽字数
      cityCount: 0,
      locationRank: [],
      recentVictims: [],
      personalityDistribution: [], // 人格分布（前三个）
      latestRecords: [], // 最新记录（最近 5 条）
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

    // 从 Supabase 查询全局平均值（从 v_global_stats_v6 视图）
    const res = await fetch(`${env.SUPABASE_URL}/rest/v1/v_global_stats_v6?select=*`, {
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
    let row = data[0] || {};

    // 【保底逻辑】如果数据库还没写入（第一个用户），手动返回保底对象
    // v_global_stats_v6 可能输出 totalUsers（小驼峰），兼容旧 total_users
    const viewTotalUsers = Number(row?.totalUsers ?? row?.total_users ?? 0) || 0;
    if (!row || viewTotalUsers <= 0) {
      console.log('[Worker] ⚠️ performAggregation: 数据库返回为空或 totalUsers 为 0，使用保底数据（当前用户）');
      row = {
        totalUsers: 1, // 强制显示 1，因为当前用户就在这
        total_users: 1, // 兼容旧字段
        avg_l: 65,
        avg_p: 45,
        avg_d: 50,
        avg_e: 55,
        avg_f: 40
      };
    }

    // 从 v_global_stats_v6 视图获取平均分数据（可能返回 avg_l, avg_p 等或 L, P, D, E, F）
    const globalAverage = {
      L: parseFloat(row.avg_l || row.avg_L || row.L || 50),
      P: parseFloat(row.avg_p || row.avg_P || row.P || 50),
      D: parseFloat(row.avg_d || row.avg_D || row.D || 50),
      E: parseFloat(row.avg_e || row.avg_E || row.E || 50),
      F: parseFloat(row.avg_f || row.avg_F || row.F || 50),
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
 * 【V6 协议】增量更新 KV 中的全局统计数据
 * 在每次写入时调用，更新 GLOBAL_STATS_V6
 */
async function updateGlobalStatsV6(
  env: Env,
  stats: V6Stats,
  dimensions: { L: number; P: number; D: number; E: number; F: number }
): Promise<void> {
  if (!env.STATS_STORE) {
    return;
  }

  try {
    // 获取现有统计数据
    const existing = await getGlobalStatsV6(env);
    const now = Math.floor(Date.now() / 1000);

    if (existing) {
      // 增量更新：计算新的平均值（加权平均）
      const totalUsers = existing.totalUsers + 1;
      const weight = 1 / totalUsers; // 新用户的权重

      const newGlobalStats: GlobalStatsV6 = {
        totalUsers,
        avgDimensions: {
          L: existing.avgDimensions.L * (1 - weight) + dimensions.L * weight,
          P: existing.avgDimensions.P * (1 - weight) + dimensions.P * weight,
          D: existing.avgDimensions.D * (1 - weight) + dimensions.D * weight,
          E: existing.avgDimensions.E * (1 - weight) + dimensions.E * weight,
          F: existing.avgDimensions.F * (1 - weight) + dimensions.F * weight,
        },
        avgStats: {
          ketao_count: existing.avgStats.ketao_count * (1 - weight) + stats.ketao_count * weight,
          jiafang_count: existing.avgStats.jiafang_count * (1 - weight) + stats.jiafang_count * weight,
          tease_count: existing.avgStats.tease_count * (1 - weight) + stats.tease_count * weight,
          nonsense_count: existing.avgStats.nonsense_count * (1 - weight) + stats.nonsense_count * weight,
          slang_count: existing.avgStats.slang_count * (1 - weight) + stats.slang_count * weight,
          abuse_value: existing.avgStats.abuse_value * (1 - weight) + stats.abuse_value * weight,
          style_index: existing.avgStats.style_index * (1 - weight) + stats.style_index * weight,
          avg_payload: existing.avgStats.avg_payload * (1 - weight) + stats.avg_payload * weight,
        },
        topBlackwords: existing.topBlackwords, // 黑话统计需要定期全量计算
        lastUpdate: now,
      };

      await env.STATS_STORE.put(KV_KEY_GLOBAL_STATS_V6, JSON.stringify(newGlobalStats));
      console.log('[Worker] ✅ V6 全局统计已增量更新:', {
        totalUsers: newGlobalStats.totalUsers,
        avgDimensions: newGlobalStats.avgDimensions,
      });
    } else {
      // 首次初始化
      const initialStats: GlobalStatsV6 = {
        totalUsers: 1,
        avgDimensions: dimensions,
        avgStats: {
          ketao_count: stats.ketao_count,
          jiafang_count: stats.jiafang_count,
          tease_count: stats.tease_count,
          nonsense_count: stats.nonsense_count,
          slang_count: stats.slang_count,
          abuse_value: stats.abuse_value,
          style_index: stats.style_index,
          avg_payload: stats.avg_payload,
        },
        topBlackwords: [],
        lastUpdate: now,
      };

      await env.STATS_STORE.put(KV_KEY_GLOBAL_STATS_V6, JSON.stringify(initialStats));
      console.log('[Worker] ✅ V6 全局统计已初始化');
    }
  } catch (error) {
    console.warn('[Worker] ⚠️ 更新 V6 全局统计失败:', error);
  }
}

/**
 * 【V6 协议】定期全量聚合任务（从 Supabase 重新计算）
 * 用于定期刷新全局统计数据，特别是 topBlackwords
 */
async function performV6Aggregation(env: Env): Promise<{ success: boolean; error?: string }> {
  try {
    if (!env.SUPABASE_URL || !env.SUPABASE_KEY) {
      return { success: false, error: 'Supabase 环境变量未配置' };
    }

    if (!env.STATS_STORE) {
      return { success: false, error: 'KV 未配置' };
    }

    // 从 Supabase 查询所有用户的 stats（jsonb 字段）
    const res = await fetch(
      `${env.SUPABASE_URL}/rest/v1/user_analysis?select=stats,dimensions&stats=not.is.null`,
      {
        headers: {
          'apikey': env.SUPABASE_KEY,
          'Authorization': `Bearer ${env.SUPABASE_KEY}`,
        },
      }
    );

    if (!res.ok) {
      const errorText = await res.text().catch(() => '无法读取错误信息');
      throw new Error(`Supabase 查询失败: ${res.status}, ${errorText}`);
    }

    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) {
      return { success: false, error: '没有数据可聚合' };
    }

    // 聚合计算
    let totalUsers = 0;
    const dimensionSums = { L: 0, P: 0, D: 0, E: 0, F: 0 };
    const statsSums = {
      ketao_count: 0,
      jiafang_count: 0,
      tease_count: 0,
      nonsense_count: 0,
      slang_count: 0,
      abuse_value: 0,
      style_index: 0,
      avg_payload: 0,
    };
    const blackwordCounts = new Map<string, number>();

    data.forEach((row: any) => {
      const stats = row.stats;
      const dims = row.dimensions || {};

      if (stats && typeof stats === 'object') {
        totalUsers++;
        dimensionSums.L += dims.L || 0;
        dimensionSums.P += dims.P || 0;
        dimensionSums.D += dims.D || 0;
        dimensionSums.E += dims.E || 0;
        dimensionSums.F += dims.F || 0;

        statsSums.ketao_count += stats.ketao_count || 0;
        statsSums.jiafang_count += stats.jiafang_count || 0;
        statsSums.tease_count += stats.tease_count || 0;
        statsSums.nonsense_count += stats.nonsense_count || 0;
        statsSums.slang_count += stats.slang_count || 0;
        statsSums.abuse_value += stats.abuse_value || 0;
        statsSums.style_index += stats.style_index || 0;
        statsSums.avg_payload += stats.avg_payload || 0;

        // 统计黑话
        if (stats.blackword_hits) {
          const chineseSlang = stats.blackword_hits.chinese_slang || {};
          const englishSlang = stats.blackword_hits.english_slang || {};
          Object.entries(chineseSlang).forEach(([word, count]) => {
            blackwordCounts.set(word, (blackwordCounts.get(word) || 0) + (count as number));
          });
          Object.entries(englishSlang).forEach(([word, count]) => {
            blackwordCounts.set(word, (blackwordCounts.get(word) || 0) + (count as number));
          });
        }
      }
    });

    // 计算平均值
    const globalStats: GlobalStatsV6 = {
      totalUsers,
      avgDimensions: {
        L: totalUsers > 0 ? dimensionSums.L / totalUsers : 50,
        P: totalUsers > 0 ? dimensionSums.P / totalUsers : 50,
        D: totalUsers > 0 ? dimensionSums.D / totalUsers : 50,
        E: totalUsers > 0 ? dimensionSums.E / totalUsers : 50,
        F: totalUsers > 0 ? dimensionSums.F / totalUsers : 50,
      },
      avgStats: {
        ketao_count: totalUsers > 0 ? statsSums.ketao_count / totalUsers : 0,
        jiafang_count: totalUsers > 0 ? statsSums.jiafang_count / totalUsers : 0,
        tease_count: totalUsers > 0 ? statsSums.tease_count / totalUsers : 0,
        nonsense_count: totalUsers > 0 ? statsSums.nonsense_count / totalUsers : 0,
        slang_count: totalUsers > 0 ? statsSums.slang_count / totalUsers : 0,
        abuse_value: totalUsers > 0 ? statsSums.abuse_value / totalUsers : 0,
        style_index: totalUsers > 0 ? statsSums.style_index / totalUsers : 0,
        avg_payload: totalUsers > 0 ? statsSums.avg_payload / totalUsers : 0,
      },
      topBlackwords: Array.from(blackwordCounts.entries())
        .map(([word, count]) => ({ word, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10), // Top 10
      lastUpdate: Math.floor(Date.now() / 1000),
    };

    await env.STATS_STORE.put(KV_KEY_GLOBAL_STATS_V6, JSON.stringify(globalStats));
    console.log('[Worker] ✅ V6 全量聚合完成:', {
      totalUsers: globalStats.totalUsers,
      topBlackwords: globalStats.topBlackwords.length,
    });

    return { success: true };
  } catch (error: any) {
    console.error('[Worker] ❌ V6 全量聚合失败:', error);
    return { success: false, error: error.message || '未知错误' };
  }
}

/**
 * 【第二阶段新增】定期汇总任务（Cron Trigger）
 * 每小时执行一次，从 Supabase 汇总平均分并存入 KV
 * 【V6 协议】同时执行 V6 全量聚合任务
 * 注意：需要在 wrangler.toml 中配置 cron_triggers
 */
export async function scheduled(event: ScheduledEvent, env: Env, ctx: any) {
  console.log('[Worker] 开始定期汇总任务（Cron Trigger）...', {
    type: event.type,
    scheduledTime: new Date(event.scheduledTime * 1000).toISOString(),
    cron: event.cron,
  });
  
  // 执行原有聚合任务
  const result = await performAggregation(env);
  
  // 【V6 协议】执行 V6 全量聚合任务
  const v6Result = await performV6Aggregation(env);
  
  if (result.success && v6Result.success) {
    console.log('[Worker] ✅ 定期汇总任务完成（包含 V6 聚合）');
  } else {
    console.error('[Worker] ❌ 定期汇总任务失败:', {
      aggregation: result.error,
      v6Aggregation: v6Result.error,
    });
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
        const res = await fetch(`${env.SUPABASE_URL}/rest/v1/v_global_stats_v6?select=totalUsers`, {
          headers: { 
            'apikey': env.SUPABASE_KEY, 
            'Authorization': `Bearer ${env.SUPABASE_KEY}` 
          }
        });
        const data = await res.json();
        return c.json({
          status: 'success',
          totalUsers: data[0]?.totalUsers || 0,
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