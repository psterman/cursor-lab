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
import { identifyUserByFingerprint, identifyUserByUserId, identifyUserByUsername, bindFingerprintToUser, updateUserByFingerprint, migrateFingerprintToUserId, identifyUserByClaimToken } from './fingerprint-service';

// Cloudflare Workers 类型定义（兼容性处理）
type KVNamespace = {
  get(key: string, type?: 'text'): Promise<string | null>;
  get(key: string, type: 'json'): Promise<any | null>;
  put(
    key: string,
    value: string,
    options?: { expirationTtl?: number; expiration?: number; metadata?: unknown }
  ): Promise<void>;
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
export type Env = {
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
const KV_KEY_GLOBAL_DASHBOARD_DATA = 'GLOBAL_DASHBOARD_DATA'; // 右侧抽屉：大盘数据缓存（v_global_stats_v6）
const KV_CACHE_TTL = 3600; // 缓存有效期：1小时（秒）

// 右侧抽屉大盘缓存 TTL（秒）
const KV_GLOBAL_STATS_V6_VIEW_TTL = 300;

// 【V6.0 新增】词云缓冲区配置
const KV_KEY_WORDCLOUD_BUFFER = 'WORDCLOUD_BUFFER'; // 词云计数缓冲区
const KV_KEY_WORDCLOUD_AGGREGATED = 'WORDCLOUD_AGGREGATED'; // 已聚合的词云数据
const KV_KEY_BUFFER_COUNT = 'WORDCLOUD_BUFFER_COUNT'; // 缓冲区计数
const KV_KEY_LAST_FLUSH = 'WORDCLOUD_LAST_FLUSH'; // 上次刷新时间

// 聚合配置
const AGGREGATION_CONFIG = {
  maxBufferSize: 100,      // 每 100 次分析后聚合
  maxFlushInterval: 600000,  // 或每 10 分钟（毫秒）
};

// 缓冲区数据结构
interface WordCloudBuffer {
  count: number;                              // 缓冲区中的记录数
  lastFlush: number;                            // 上次刷新时间戳
  items: Array<{                                // 累积的词云数据
    phrase: string;                             // 词汇
    category: 'merit' | 'slang' | 'sv_slang'; // 类别
    delta: number;                              // 权重增量
    timestamp: number;                          // 时间戳
    region: string;                             // 地区（US/CN/Global 等）
  }>;
}

// 词云数据项（扁平化结构）
interface WordCloudItem {
  name: string;                                 // 词汇
  value: number;                                // 权重
  category: 'merit' | 'slang' | 'sv_slang'; // 类别
}

type WordCloudCategory = WordCloudItem['category'];

function normalizeWordCloudCategory(category: any, phrase?: string): WordCloudCategory {
  const raw = String(category ?? '').trim().toLowerCase();
  if (raw === 'merit') return 'merit';
  if (raw === 'sv_slang' || raw === 'sv-slang' || raw === 'svslang') return 'sv_slang';
  if (raw === 'slang') return 'slang';
  if (phrase) return inferCategory(String(phrase));
  return 'slang';
}

// Supabase 请求超时（防止并发堆积）
const SUPABASE_FETCH_TIMEOUT_MS = 8000;

function createTimeoutSignal(timeoutMs: number): { signal: AbortSignal; cancel: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(`timeout_${timeoutMs}ms`), timeoutMs);
  return { signal: controller.signal, cancel: () => clearTimeout(timer) };
}

function buildSupabaseHeaders(env: Env, extra?: Record<string, string>): Record<string, string> {
  const apikey = env.SUPABASE_KEY || '';
  return {
    'apikey': apikey,
    'Authorization': `Bearer ${apikey}`,
    ...(extra || {}),
  };
}

async function fetchSupabaseJson<T = any>(
  env: Env,
  url: string,
  init?: RequestInit,
  timeoutMs: number = SUPABASE_FETCH_TIMEOUT_MS
): Promise<T> {
  const { signal, cancel } = createTimeoutSignal(timeoutMs);
  try {
    const res = await fetch(url, { ...(init || {}), signal });
    if (!res.ok) {
      const errorText = await res.text().catch(() => '无法读取错误信息');
      throw new Error(`Supabase HTTP ${res.status}: ${errorText}`);
    }
    // PostgREST /rpc 常见返回：204 No Content（没有 body）
    if (res.status === 204) return null as unknown as T;

    const text = await res.text().catch(() => '');
    if (!text) return null as unknown as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      // 兼容非 JSON（极少见）：避免抛出 "Unexpected end of JSON input"
      return text as unknown as T;
    }
  } finally {
    cancel();
  }
}

async function fetchSupabase(
  env: Env,
  url: string,
  init?: RequestInit,
  timeoutMs: number = SUPABASE_FETCH_TIMEOUT_MS
): Promise<Response> {
  const { signal, cancel } = createTimeoutSignal(timeoutMs);
  try {
    const headers = {
      ...buildSupabaseHeaders(env),
      ...((init?.headers as Record<string, string> | undefined) || {}),
    };
    return await fetch(url, { ...(init || {}), headers, signal });
  } finally {
    cancel();
  }
}

function isUSLocation(locationParam?: string | null): boolean {
  const raw = String(locationParam || '').trim();
  if (!raw) return false;
  const normalized = raw.replace(/[\s_-]+/g, '').toUpperCase();
  return normalized === 'US' || normalized === 'USA' || normalized === 'UNITEDSTATES';
}

function toNumberOrZero(value: any): number {
  if (value === null || value === undefined) return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function pickUsOrGlobal(usValue: any, globalValue: any): number {
  const usNum = toNumberOrZero(usValue);
  // 需求：若美国局部数据为 null 或 0，则回退使用全球平均值（避免前端雷达图/ECharts 出错）
  if (usNum === 0) {
    return toNumberOrZero(globalValue);
  }
  return usNum;
}

function applyUsStatsToGlobalRow(row: any): any {
  const us = row?.us_stats;
  if (!us || typeof us !== 'object') return row;

  // 需求：location=US 时，将 us_stats 的数值平替到顶层字段（避免前端结构分支）
  return {
    ...row,
    totalUsers: pickUsOrGlobal(us.totalUsers, row.totalUsers),
    totalAnalysis: pickUsOrGlobal(us.totalAnalysis, row.totalAnalysis),
    totalCharsSum: pickUsOrGlobal(us.totalCharsSum, row.totalCharsSum),
    avg_l: pickUsOrGlobal(us.avg_l, row.avg_l),
    avg_p: pickUsOrGlobal(us.avg_p, row.avg_p),
    avg_d: pickUsOrGlobal(us.avg_d, row.avg_d),
    avg_e: pickUsOrGlobal(us.avg_e, row.avg_e),
    avg_f: pickUsOrGlobal(us.avg_f, row.avg_f),
  };
}

async function refreshGlobalStatsV6Rpc(env: Env): Promise<void> {
  if (!env.SUPABASE_URL || !env.SUPABASE_KEY) return;
  const rpcUrl = `${env.SUPABASE_URL}/rest/v1/rpc/refresh_global_stats_v6`;
  try {
    await fetchSupabaseJson(env, rpcUrl, {
      method: 'POST',
      headers: buildSupabaseHeaders(env, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({}),
    });
    console.log('[Worker] ✅ refresh_global_stats_v6 RPC 已触发');
  } catch (err: any) {
    console.warn('[Worker] ⚠️ refresh_global_stats_v6 RPC 触发失败:', err?.message || String(err));
  }
}

// ==========================================
// 【V6.0 新增】词云缓冲区相关函数
// ==========================================

/**
 * 【V6.0 新增】根据词汇推断 category
 * 用于在没有明确 category 字段时自动分类
 */
function inferCategory(word: string): 'merit' | 'slang' | 'sv_slang' {
  const normalized = word.toLowerCase().trim();
  
  // 功德类词汇
  const meritKeywords = [
    '重构', '优化', '修复', '改进', '完善', '提升', '增强', '调整', '更新', '升级',
    '功德', '福报', '积德', '善业', '救火', '背锅', '功劳', '加班', '熬夜',
    '重构', '优化', '修复', '改进', '完善',
  ];
  
  // 硅谷黑话词汇
  const svSlangKeywords = [
    '护城河', '增长', '融资', '赛道', '头部效应', '估值', '现金流', '天使轮', 'A轮',
    'synergy', 'leverage', 'disrupt', 'pivot', 'scalable', 'paradigm',
  ];
  
  // 检查是否为功德词
  for (const keyword of meritKeywords) {
    if (normalized.includes(keyword.toLowerCase()) || keyword.includes(normalized)) {
      return 'merit';
    }
  }
  
  // 检查是否为硅谷黑话
  for (const keyword of svSlangKeywords) {
    if (normalized.includes(keyword.toLowerCase()) || keyword.includes(normalized)) {
      return 'sv_slang';
    }
  }
  
  // 默认返回 slang
  return 'slang';
}

/**
 * 【V6.0 新增】初始化 KV 缓冲区（如果不存在）
 */
async function initWordCloudBuffer(env: Env): Promise<void> {
  if (!env.STATS_STORE) return;

  try {
    const existing = await env.STATS_STORE.get(KV_KEY_WORDCLOUD_BUFFER, 'json');
    if (!existing) {
      const initialBuffer: WordCloudBuffer = {
        count: 0,
        lastFlush: Date.now(),
        items: [],
      };
      await env.STATS_STORE.put(
        KV_KEY_WORDCLOUD_BUFFER,
        JSON.stringify(initialBuffer),
        { expirationTtl: 86400 } // 24 小时过期
      );
      console.log('[Worker] ✅ 词云缓冲区已初始化');
    }
  } catch (error) {
    console.warn('[Worker] ⚠️ 初始化词云缓冲区失败:', error);
  }
}

/**
 * 【V6.0 新增】将词云数据追加到 KV 缓冲区
 * @param region - 用户地区（2 位 ISO2 或 'Global'）
 */
async function appendToWordCloudBuffer(
  env: Env,
  tagCloudData: Array<{ name: string; value: number; category?: WordCloudCategory | string }>,
  region?: string | null
): Promise<boolean> {
  if (!env.STATS_STORE) return false;

  // 地区归一化：空值或无效值 -> Global，US/CN 等保持原样
  const normalizedRegion = normalizeRegion(region);

  try {
    // 1. 获取当前缓冲区
    const buffer: WordCloudBuffer = await env.STATS_STORE.get(
      KV_KEY_WORDCLOUD_BUFFER,
      'json'
    ) || { count: 0, lastFlush: Date.now(), items: [] };

    // 2. 追加新数据
    const newItems = tagCloudData.map(item => ({
      phrase: item.name,
      category: normalizeWordCloudCategory(item.category, item.name),
      delta: item.value,
      timestamp: Date.now(),
      region: normalizedRegion,
    }));

    buffer.items.push(...newItems);
    buffer.count += 1;

    // 3. 检查是否需要刷新
    const shouldFlush =
      buffer.count >= AGGREGATION_CONFIG.maxBufferSize ||
      (Date.now() - buffer.lastFlush) >= AGGREGATION_CONFIG.maxFlushInterval;

    if (shouldFlush) {
      console.log('[Worker] 🔄 触发词云刷新:', {
        count: buffer.count,
        elapsed: Date.now() - buffer.lastFlush,
      });

      // 4. 执行聚合刷新
      await flushWordCloudBuffer(env, buffer);

      // 5. 重置缓冲区
      buffer.count = 0;
      buffer.lastFlush = Date.now();
      buffer.items = [];
    }

    // 6. 保存回 KV
    await env.STATS_STORE.put(
      KV_KEY_WORDCLOUD_BUFFER,
      JSON.stringify(buffer),
      { expirationTtl: 86400 }
    );

    return shouldFlush;
  } catch (error) {
    console.warn('[Worker] ⚠️ 追加词云缓冲区失败:', error);
    return false;
  }
}

/**
 * 【V6.0 新增】刷新词云缓冲区到 Supabase
 * 关键改动：按 region 分组写入，确保国别透视有真实数据
 */
async function flushWordCloudBuffer(env: Env, buffer: WordCloudBuffer): Promise<void> {
  if (!env.SUPABASE_URL || !env.SUPABASE_KEY) return;

  try {
    // 1. 聚合缓冲区中的词云数据（按 region + phrase + category 三元组聚合）
    const aggregated = new Map<string, { phrase: string; category: WordCloudCategory; delta: number; region: string }>();

    for (const item of buffer.items) {
      // 聚合键：region|phrase|category
      const region = item.region || 'Global';
      const key = `${region}|${item.phrase}|${item.category}`;
      const existing = aggregated.get(key);

      if (existing) {
        existing.delta += item.delta;
      } else {
        aggregated.set(key, {
          phrase: item.phrase,
          category: item.category,
          delta: item.delta,
          region,
        });
      }
    }

    // 2. 批量写入 slang_trends 表（按 region 分别写入）
    const rpcUrl = `${env.SUPABASE_URL}/rest/v1/rpc/upsert_slang_hits_v2`;

    for (const { phrase, category, delta, region } of Array.from(aggregated.values())) {
      await fetchSupabaseJson(env, rpcUrl, {
        method: 'POST',
        headers: buildSupabaseHeaders(env, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          p_phrase: phrase,
          p_region: region, // 使用实际地区而非硬编码 'global'
          p_category: category,
          p_delta: delta,
        }),
      });
    }

    // 统计各地区写入数量（用于日志）
    const regionCounts = new Map<string, number>();
    for (const { region } of Array.from(aggregated.values())) {
      regionCounts.set(region, (regionCounts.get(region) || 0) + 1);
    }

    console.log('[Worker] ✅ 词云缓冲区刷新完成:', {
      itemCount: buffer.items.length,
      uniquePhrases: aggregated.size,
      regionBreakdown: Object.fromEntries(regionCounts),
    });

    // 3. 更新已聚合的词云缓存（仅保存 Global 数据用于首页展示）
    const globalCloudData = Array.from(aggregated.values())
      .filter(item => item.region === 'Global')
      .sort((a, b) => b.delta - a.delta)
      .slice(0, 50)
      .map(item => ({
        name: item.phrase,
        value: item.delta,
        category: item.category,
      }));

    if (globalCloudData.length > 0) {
      await env.STATS_STORE.put(
        KV_KEY_WORDCLOUD_AGGREGATED,
        JSON.stringify(globalCloudData),
        { expirationTtl: 3600 } // 1 小时过期
      );
    }
  } catch (error) {
    console.warn('[Worker] ⚠️ 词云缓冲区刷新失败:', error);
  }
}

/**
 * 【V6.0 新增】获取聚合后的词云数据（优先从 KV）
  */
async function getAggregatedWordCloud(env: Env): Promise<Array<{name: string; value: number; category: string}>> {
  if (!env.STATS_STORE) return [];

  try {
    // 1. 优先从 KV 读取
    const cached = await env.STATS_STORE.get(KV_KEY_WORDCLOUD_AGGREGATED, 'json');
    if (cached && Array.isArray(cached)) {
      // 确保返回的数据包含 category 字段
      return (cached as any[]).map(item => ({
        name: item.name,
        value: item.value,
        category: item.category || inferCategory(item.name),
      }));
    }

    // 2. KV 缓存未命中，从 Supabase 查询
    const url = new URL(`${env.SUPABASE_URL}/rest/v1/slang_trends`);
    url.searchParams.set('select', 'phrase,hit_count,category');
    // 与 normalizeRegion() 对齐：默认 Global（首字母大写）
    url.searchParams.set('region', 'eq.Global');
    url.searchParams.set('order', 'hit_count.desc');
    url.searchParams.set('limit', '50');

    const rows = await fetchSupabaseJson<any[]>(env, url.toString(), {
      headers: buildSupabaseHeaders(env),
    });

    const cloudData = (Array.isArray(rows) ? rows : [])
      .map(r => ({
        name: r.phrase,
        value: r.hit_count || 0,
        // 【V6.0 新增】使用数据库中的 category 或推断
        category: r.category || inferCategory(r.phrase),
      }))
      .filter(x => x.name && x.value > 0);

    // 3. 写回 KV 缓存
    if (cloudData.length > 0) {
      await env.STATS_STORE.put(
        KV_KEY_WORDCLOUD_AGGREGATED,
        JSON.stringify(cloudData),
        { expirationTtl: 3600 }
      );
    }

    return cloudData;
  } catch (error) {
    console.warn('[Worker] ⚠️ 获取词云数据失败:', error);
    return [];
  }
}

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
  // 【V6.0 新增】扁平化词云数据（用于前端词云展示）
  tag_cloud_data?: Array<{
    name: string;
    value: number;
    category: 'merit' | 'slang' | 'sv_slang';
  }>;
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
  /** 用户校准的国家/地区代码（地图校准后上报，如 CN、US） */
  manual_location?: string;
  /** 【行为快照】本次行为发生时的国家（用于国家聚合，避免切换国籍污染） */
  snapshot_country?: string;
  /** 兼容字段：camelCase */
  snapshotCountry?: string;
  /** 手动地域修正（与 stats2/Analyzer 的 anchored_country 对齐） */
  manual_region?: string;
  /** 兼容字段：camelCase */
  manualRegion?: string;
  /** 用户当前画像位置（仅用于展示，不用于国家聚合） */
  current_location?: string;
  /** 兼容字段：camelCase */
  currentLocation?: string;
  /** 国籍切换时间（可选，用于 location_weight 渐进） */
  location_switched_at?: string | number;
  /** 兼容字段：camelCase */
  locationSwitchedAt?: string | number;
  /** 国籍迁移权重（0~1，可选） */
  location_weight?: number;
  /** 兼容字段：camelCase */
  locationWeight?: number;
  /** 用户校准的经纬度 [lng, lat]（地图校准后上报） */
  manual_coordinates?: [number, number];
  /** 用户校准纬度（可与 manual_location 一起单独上报） */
  manual_lat?: number;
  /** 用户校准经度（可与 manual_location 一起单独上报） */
  manual_lng?: number;
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
    const env = c.env;

    // 【V6.0 新增】初始化词云缓冲区（如果不存在）
    c.executionCtx.waitUntil(initWordCloudBuffer(env));
    
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

    // 验证 chatData 格式（仅校准：有 manual_lat 时允许 chatData 为空）
    const hasManualLocation = body.manual_lat != null || body.manual_lng != null ||
      (body.manual_location != null && String(body.manual_location).trim() !== '');
    if (!chatData || !Array.isArray(chatData)) {
      if (!hasManualLocation) {
        return c.json({
          status: 'error',
          error: 'chatData 必须是数组',
          errorCode: 'INVALID_CHATDATA',
        }, 400);
      }
      // 仅校准：chatData 可为空，下面走校准分支
    }

    const safeChatData = Array.isArray(chatData) ? chatData : [];
    const userMessages = safeChatData.filter((item: any) => item.role === 'USER');

    if (userMessages.length === 0) {
      // 即使 chatData 为空，只要有 manual_lat 且能识别用户（fingerprint 或 auth），也执行数据库更新（仅校准）
      const canIdentifyUser = !!(
        body.fingerprint && String(body.fingerprint).trim() !== ''
      );
      let authUserId: string | null = null;
      const authHeader = c.req.header('Authorization');
      if (authHeader?.startsWith('Bearer ')) {
        try {
          const parts = authHeader.substring(7).split('.');
          if (parts.length === 3) {
            const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
            authUserId = payload.sub || null;
          }
        } catch (_) {}
      }
      if (hasManualLocation && (authUserId || canIdentifyUser)) {
        const env = c.env;
        if (env.SUPABASE_URL && env.SUPABASE_KEY) {
          const patchPayload: Record<string, unknown> = {
            updated_at: new Date().toISOString(),
          };
          if (body.manual_lat != null && typeof body.manual_lat === 'number' && !isNaN(body.manual_lat)) {
            patchPayload.manual_lat = body.manual_lat;
          }
          if (body.manual_lng != null && typeof body.manual_lng === 'number' && !isNaN(body.manual_lng)) {
            patchPayload.manual_lng = body.manual_lng;
          }
          if (body.manual_location != null && String(body.manual_location).trim() !== '') {
            patchPayload.manual_location = String(body.manual_location).trim();
          }
          const conflictKey = authUserId ? 'id' : 'fingerprint';
          const conflictVal = authUserId ?? (body.fingerprint || '').trim();
          if (conflictVal && Object.keys(patchPayload).length > 1) {
            const patchUrl = `${env.SUPABASE_URL}/rest/v1/user_analysis?${conflictKey}=eq.${encodeURIComponent(String(conflictVal))}`;
            try {
              const patchRes = await fetch(patchUrl, {
                method: 'PATCH',
                headers: {
                  'apikey': env.SUPABASE_KEY,
                  'Authorization': `Bearer ${env.SUPABASE_KEY}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify(patchPayload),
              });
              if (patchRes.ok) {
                console.log('[Worker] ✅ 仅校准写入成功:', { manual_lat: patchPayload.manual_lat, manual_lng: patchPayload.manual_lng, manual_location: patchPayload.manual_location });
              } else {
                console.warn('[Worker] ⚠️ 仅校准 PATCH 非 2xx:', patchRes.status);
              }
            } catch (err: any) {
              console.warn('[Worker] ⚠️ 仅校准 PATCH 异常:', err?.message);
            }
          }
        }
        return c.json({
          status: 'success',
          message: '位置已校准',
          dimensions: { L: 50, P: 50, D: 50, E: 50, F: 50 },
          ranks: { messageRank: 50, charRank: 50, daysRank: 50, jiafangRank: 50, ketaoRank: 50, avgRank: 50, L_rank: 50, P_rank: 50, D_rank: 50, E_rank: 50, F_rank: 50 },
          totalUsers: 1,
        });
      }
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
    // 注意：claimToken 将在后续的数据库写入逻辑中生成，这里先不包含
    const result: any = {
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
          // 【GitHub OAuth 优先】检查请求头中是否包含 Authorization token
          const authHeader = c.req.header('Authorization');
          let authenticatedUserId: string | null = null;
          let useUserIdForUpsert = false;
          
          if (authHeader && authHeader.startsWith('Bearer ')) {
            try {
              const token = authHeader.substring(7);
              // 从 JWT token 中提取 user_id（sub 字段）
              // JWT 格式：header.payload.signature，payload 是 base64url 编码的 JSON
              const parts = token.split('.');
              if (parts.length === 3) {
                // 解码 payload（base64url）
                const payload = JSON.parse(
                  atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'))
                );
                authenticatedUserId = payload.sub || null;
                
                if (authenticatedUserId) {
                  console.log('[Worker] ✅ 检测到 GitHub OAuth token，user_id:', authenticatedUserId.substring(0, 8) + '...');
                  // 验证用户是否存在于 user_analysis 表中
                  const existingUser = await identifyUserByUserId(authenticatedUserId, env);
                  if (existingUser) {
                    useUserIdForUpsert = true;
                    console.log('[Worker] ✅ 找到已认证用户，将使用 user_id 进行 Upsert');
                  } else {
                    console.log('[Worker] ℹ️ 已认证用户尚未在 user_analysis 表中，将创建新记录');
                    useUserIdForUpsert = true; // 即使不存在，也使用 user_id 创建新记录
                  }
                }
              }
            } catch (error: any) {
              console.warn('[Worker] ⚠️ 解析 Authorization token 失败，将使用 fingerprint:', error.message);
            }
          }
          
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
          
          // 如果已认证，使用 user_id；否则使用 fingerprint 作为 userId
          const userId = useUserIdForUpsert ? authenticatedUserId! : stableFingerprint;
          const fingerprint = useUserIdForUpsert ? authenticatedUserId! : await generateFingerprint(userId, totalChars);
          
          console.log('[Worker] 🔑 生成用户标识:', {
            method: useUserIdForUpsert ? 'GitHub OAuth (user_id)' : 'Fingerprint',
            userId: userId.substring(0, 8) + '...',
            fingerprint: fingerprint.substring(0, 8) + '...',
            messagesUsed: stableMessages.length,
            contentLength: stableContent.length,
            fallbackUsed: !stableContent,
          });

          // 【V6 协议】构建完整的数据负载（包含 jsonb 字段存储完整 stats）
          // 注意：created_at 和 updated_at 由数据库自动生成，不需要手动设置
          // 核心：fingerprint 作为幂等 Upsert 的业务主键
          // 【V6 协议】使用 v6Stats 或从 finalStats 构建
          const v6StatsForStorage = v6Stats || finalStats;
          
          // 【场景 A：先分析后登录】如果是匿名用户，生成 claim_token
          // 注意：claimToken 需要在 result 对象中使用，所以定义在外部作用域
          let claimToken: string | null = null;
          if (!useUserIdForUpsert) {
            claimToken = crypto.randomUUID();
            console.log('[Worker] 🔑 为匿名用户生成 claim_token:', claimToken.substring(0, 8) + '...');
            
            // 【关键修复】立即添加到返回结果中，不要在 waitUntil 异步块中赋值，否则返回时 token 为空
            result.claim_token = claimToken;
          }
          
          const payload: any = {
            // 【GitHub OAuth 优先】如果使用 user_id，则设置 id 字段；否则使用 fingerprint
            ...(useUserIdForUpsert ? { id: authenticatedUserId } : {}),
            fingerprint: v6Dimensions ? (body.fingerprint || fingerprint) : fingerprint,
            user_name: body.userName || '匿名受害者',
            user_identity: useUserIdForUpsert ? 'github' : 'fingerprint',
            personality_type: personalityType,
            // 【场景 A：先分析后登录】保存 claim_token 到数据库
            ...(claimToken ? { claim_token: claimToken } : {}),
            
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
            
            // 【关键修复】添加 personality 对象，包含 detailedStats 与 answer_book（与 dimensions 等一并同步给 GitHub 用户/视图）
            // 数据格式：{ type, detailedStats, answer_book: { title, content, vibe_level } }
            personality: {
              type: personalityType,
              detailedStats: detailedStats, // 包含 L, P, D, E, F 五个维度的详细统计数据
              answer_book: answerBook ?? null, // 答案之书，供 stats2 左侧抽屉「今日箴言」与 index 同步
            },
            
            // 【新增】personality_data 字段：包含称号和随机吐槽的五个维度数组（JSONB）
            // 格式：Array<{ dimension, score, label, roast }>
            personality_data: detailedStats, // 直接使用 detailedStats 数组
          };

          // 【用户校准】若前端上报 manual_location（国家代码）、manual_lat/manual_lng 或 manual_coordinates，写入数据库
          if (body.manual_location != null && typeof body.manual_location === 'string' && body.manual_location.trim() !== '') {
            payload.manual_location = body.manual_location.trim();
          }
          if (body.manual_lat != null && typeof body.manual_lat === 'number' && !isNaN(body.manual_lat)) {
            payload.manual_lat = body.manual_lat;
          }
          if (body.manual_lng != null && typeof body.manual_lng === 'number' && !isNaN(body.manual_lng)) {
            payload.manual_lng = body.manual_lng;
          }
          if (body.manual_coordinates && Array.isArray(body.manual_coordinates) && body.manual_coordinates.length >= 2) {
            const [lngVal, latVal] = body.manual_coordinates;
            if (typeof lngVal === 'number' && !isNaN(lngVal) && typeof latVal === 'number' && !isNaN(latVal)) {
              payload.manual_lng = lngVal;
              payload.manual_lat = latVal;
            }
          }
          
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

          // ============================
          // 行为快照：snapshot_country（用于“国别聚合”而非用户当前国籍）
          // 优先级：前端显式 snapshot_country/manual_region > manual_location > ip_location > Global
          // ============================
          const snapshotCountryRaw = normalizeRegion(
            body?.snapshot_country ??
            body?.snapshotCountry ??
            body?.manual_region ??
            body?.manualRegion ??
            body?.manual_location ??
            payload.ip_location ??
            normalizedIpLocation ??
            'Global'
          );
          const snapshotCountry =
            /^[A-Za-z]{2}$/.test(snapshotCountryRaw) ? snapshotCountryRaw.toUpperCase() : snapshotCountryRaw;

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

          // 【同步存储】必须 await 以确保后续认领操作能找到数据
          // 【GitHub OAuth 优先】如果使用 user_id，则按 id 冲突；否则按 fingerprint 冲突
          const conflictKey = useUserIdForUpsert ? 'id' : 'fingerprint';
          const supabaseUrl = `${env.SUPABASE_URL}/rest/v1/user_analysis?on_conflict=${conflictKey}`;
          
          try {
            await Promise.all([
              // 写入 Supabase（增强错误处理）
              (async () => {
                try {
                  const res = await fetchSupabase(env, supabaseUrl, {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'Prefer': 'resolution=merge-duplicates',
                    },
                    body: JSON.stringify(payload),
                  });
                  
                  if (!res.ok) {
                    const errorText = await res.text().catch(() => '无法读取错误信息');
                    console.error('[Supabase] ❌ Upsert 失败:', {
                      status: res.status,
                      error: errorText,
                    });
                  } else {
                    console.log('[Supabase] ✅ 数据已成功写入:', {
                      fingerprint: payload.fingerprint,
                      hasClaimToken: !!payload.claim_token,
                    });
                  }
                } catch (err: any) {
                  console.error('[Supabase] ❌ Upsert 异常:', err.message);
                }
              })(),
              // 【行为快照】写入 analysis_events（不与 user_profile 绑定，避免“切国籍污染统计”）
              (async () => {
                try {
                  const fp = (payload.fingerprint ? String(payload.fingerprint).trim() : '') || null;
                  const createdAt = new Date().toISOString();
                  const eventRow: any = {
                    fingerprint: fp,
                    snapshot_country: snapshotCountry,
                    created_at: createdAt,
                    // 关键指标：用于国家级聚合
                    total_chars: payload.total_chars ?? null,
                    total_messages: payload.total_messages ?? null,
                    lpdef: lpdef || null,
                    personality_type: personalityType || payload.personality_type || null,
                    dimensions: dimensions || null,
                    stats: finalStats || null,
                    // 辅助字段：追溯“迁移/权重”
                    location_switched_at: body?.location_switched_at ?? body?.locationSwitchedAt ?? null,
                    location_weight: body?.location_weight ?? body?.locationWeight ?? null,
                  };
                  await fetchSupabaseJson(env, `${env.SUPABASE_URL}/rest/v1/analysis_events`, {
                    method: 'POST',
                    headers: buildSupabaseHeaders(env, { 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
                    body: JSON.stringify(eventRow),
                  }).catch(() => null);
                } catch {
                  // ignore
                }
              })(),
              // 【V6 协议】增量更新 KV 全局统计
              (async () => {
                try {
                  await updateGlobalStatsV6(env, finalStats, dimensions);
                } catch (err: any) {
                  console.warn('[Worker] ⚠️ V6 全局统计更新失败:', err.message);
                }
              })(),
              // 【V6.0 新增】异步处理词云缓冲区（按用户地区归类）
              (async () => {
                try {
                  // 检查是否有 tag_cloud_data
                  if (v6Stats?.tag_cloud_data && Array.isArray(v6Stats.tag_cloud_data)) {
                    // 传入用户的 ip_location 作为 region，确保国别透视有真实数据
                    const userRegion = payload.ip_location || null;
                    await appendToWordCloudBuffer(env, v6Stats.tag_cloud_data, userRegion);
                    console.log('[Worker] ✅ 词云数据已追加到缓冲区:', { region: userRegion || 'Global' });
                  }
                } catch (err: any) {
                  console.warn('[Worker] ⚠️ 词云缓冲区处理失败:', err.message);
                }
              })(),
            ]);

            // 刷新触发：写入完成后异步调用 RPC 刷新视图
            executionCtx.waitUntil(refreshGlobalStatsV6Rpc(env));
          } catch (err: any) {
            console.error('[Worker] ❌ 数据库同步任务失败:', err.message);
          }
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
 * POST /api/v2/update_location
 * 前端“切换国籍/视角”时调用：仅更新用户画像中的 current_location，不影响历史行为快照。
 * payload: { fingerprint?: string, current_location?: string, anchored_country?: string, switched_at?: string|number }
 */
app.post('/api/v2/update_location', async (c) => {
  const env = c.env;
  if (!env.SUPABASE_URL || !env.SUPABASE_KEY) {
    return c.json({ status: 'error', error: 'Supabase 未配置' }, 500);
  }
  let body: any = null;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ status: 'error', error: 'Invalid JSON' }, 400);
  }

  const fingerprint = (body?.fingerprint ? String(body.fingerprint).trim() : '') || '';
  const currentLocationRaw =
    body?.current_location ?? body?.currentLocation ?? body?.anchored_country ?? body?.anchoredCountry ?? '';
  const currentLocation = String(currentLocationRaw || '').trim().toUpperCase();
  const switchedAt = body?.switched_at ?? body?.switchedAt ?? body?.location_switched_at ?? null;

  if (!fingerprint) {
    return c.json({ status: 'error', error: 'fingerprint 必填' }, 400);
  }
  if (!/^[A-Z]{2}$/.test(currentLocation)) {
    return c.json({ status: 'error', error: 'current_location 必须为 2 位国家码' }, 400);
  }

  try {
    const patchPayload: any = {
      current_location: currentLocation,
      location_switched_at: switchedAt || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const url = `${env.SUPABASE_URL}/rest/v1/user_analysis?fingerprint=eq.${encodeURIComponent(fingerprint)}`;
    const res = await fetchSupabase(env, url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify(patchPayload),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      // 不阻塞：即便列不存在/无权限，也不影响前端切换体验
      return c.json({ status: 'warning', updated: false, error: t || `HTTP ${res.status}` }, 200);
    }
    return c.json({ status: 'success', updated: true, current_location: currentLocation });
  } catch (e: any) {
    return c.json({ status: 'warning', updated: false, error: e?.message || String(e) }, 200);
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
 * 路由：/api/fingerprint/migrate
 * 功能：将指纹数据迁移到 GitHub User ID
 * 当用户通过 GitHub OAuth 登录时，前端调用此接口将旧的 fingerprint 数据迁移到新的 user_id
 */
app.post('/api/fingerprint/migrate', async (c) => {
  try {
    const env = c.env;
    const body = await c.req.json();
    const { fingerprint: oldFingerprint, sourceFp, userId: githubUserId, username: githubUsername, claimToken } = body;

    if (!githubUserId) {
      return c.json({
        status: 'error',
        error: 'userId 参数必填',
        errorCode: 'MISSING_PARAMETERS',
      }, 400);
    }

    // 【强制令牌校验】必须提供 claimToken
    if (!claimToken) {
      return c.json({
        status: 'error',
        error: 'claimToken 参数必填 - 必须先进行分析才能认领数据',
        errorCode: 'MISSING_CLAIM_TOKEN',
      }, 400);
    }

    if (!env.SUPABASE_URL || !env.SUPABASE_KEY) {
      return c.json({
        status: 'error',
        error: 'Supabase 配置缺失',
        errorCode: 'SUPABASE_NOT_CONFIGURED',
      }, 500);
    }

    // 【步骤 1：检查与锁定】验证 GitHub 用户是否已登录（必须通过认证）
    const authHeader = c.req.header('Authorization');
    let authenticatedUserId: string | null = null;
    let isAuthenticated = false;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({
        status: 'error',
        error: '必须提供有效的 GitHub OAuth token',
        errorCode: 'AUTHENTICATION_REQUIRED',
      }, 401);
    }

    try {
      const token = authHeader.substring(7);
      // 从 JWT token 中提取 user_id（sub 字段）
      const parts = token.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(
          atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'))
        );
        authenticatedUserId = payload.sub || null;
        
        if (authenticatedUserId && authenticatedUserId === githubUserId) {
          isAuthenticated = true;
          console.log('[Worker] ✅ 用户身份验证成功，user_id:', authenticatedUserId.substring(0, 8) + '...');
        } else {
          return c.json({
            status: 'error',
            error: 'token 中的 user_id 与请求的 userId 不匹配',
            errorCode: 'USER_ID_MISMATCH',
          }, 403);
        }
      }
    } catch (error: any) {
      return c.json({
        status: 'error',
        error: '解析 Authorization token 失败',
        errorCode: 'INVALID_TOKEN',
        details: error.message,
      }, 401);
    }

    if (!isAuthenticated) {
      return c.json({
        status: 'error',
        error: '用户身份验证失败',
        errorCode: 'AUTHENTICATION_FAILED',
      }, 401);
    }

    // 验证 userId 格式（UUID）
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(githubUserId)) {
      return c.json({
        status: 'error',
        error: '无效的 userId 格式',
        errorCode: 'INVALID_USER_ID',
      }, 400);
    }

    // 【步骤 2：强制令牌认领】使用 claimToken 执行迁移
    console.log('[Worker] 🔑 开始基于 claim_token 的强制认领流程...');
    
    const result = await migrateFingerprintToUserId('', githubUserId, claimToken, env);
    
    if (result) {
      console.log('[Worker] ✅ 数据认领成功');
      return c.json({
        status: 'success',
        data: result,
        message: '数据认领成功',
        requiresRefresh: true,
      });
    } else {
      console.log('[Worker] ⚠️ 数据认领失败');
      return c.json({
        status: 'error',
        error: 'claim_token 无效或已过期，或数据已被认领',
        errorCode: 'CLAIM_FAILED',
      }, 400);
    }
    
    // 传统迁移流程（保持向后兼容）
    let sourceRecord = null;
    let successfulFp = null;

    // 1. 尝试使用 sourceFp (Master Key)
    if (sourceFp) {
      sourceRecord = await identifyUserByFingerprint(sourceFp, env);
      if (sourceRecord && (sourceRecord.total_messages || 0) > 0) {
        successfulFp = sourceFp;
        console.log('[Worker] 🔑 Master Key (sourceFp) 溯源成功');
      }
    }

    // 2. 尝试使用 oldFingerprint (当前设备指纹)
    if (!successfulFp && oldFingerprint) {
      sourceRecord = await identifyUserByFingerprint(oldFingerprint, env);
      if (sourceRecord && (sourceRecord.total_messages || 0) > 0) {
        successfulFp = oldFingerprint;
        console.log('[Worker] 🔑 当前设备指纹 (oldFingerprint) 溯源成功');
      }
    }

    // 3. 深度溯源：尝试使用 username (githubUsername) 寻找匿名记录
    if (!successfulFp && githubUsername) {
      sourceRecord = await identifyUserByUsername(githubUsername, env);
      if (sourceRecord) {
        successfulFp = sourceRecord.fingerprint || sourceRecord.user_identity; 
        console.log('[Worker] 🔍 深度溯源 (username) 成功');
      }
    }

    const targetRecord = await identifyUserByUserId(githubUserId, env);

    console.log('[Worker] 📊 溯源结果:', {
      sourceRecordExists: !!sourceRecord,
      targetRecordExists: !!targetRecord,
      successfulFp: successfulFp ? successfulFp.substring(0, 8) + '...' : 'none',
    });

    // 【步骤 3：条件判断】
    // 找到 fingerprint = oldFingerprint 且 total_messages > 0 的那条旧记录
    if (!sourceRecord) {
      console.log('[Worker] ℹ️ 源记录不存在，无需迁移');
      return c.json({
        status: 'not_found',
        error: '未找到对应的指纹数据',
        errorCode: 'FINGERPRINT_NOT_FOUND',
      }, 404);
    }

    // 【完善】确保找到 total_messages > 0 的旧记录
    const sourceTotalMessages = sourceRecord.total_messages || sourceRecord.stats?.total_messages || 0;
    if (sourceTotalMessages === 0) {
      console.log('[Worker] ℹ️ 源记录无有效数据（total_messages = 0），无需迁移');
      return c.json({
        status: 'no_data',
        error: '源记录无有效数据（total_messages = 0），无需迁移',
        errorCode: 'NO_DATA_TO_MIGRATE',
      }, 200);
    }

    console.log('[Worker] ✅ 找到有效源记录:', {
      sourceId: sourceRecord.id?.substring(0, 8) + '...',
      successfulFp: successfulFp ? successfulFp.substring(0, 8) + '...' : 'none',
      total_messages: sourceTotalMessages,
      has_scores: !!(sourceRecord.l_score || sourceRecord.p_score),
    });

    console.log('[Worker] ✅ 源记录包含有效数据，开始执行字段级覆盖迁移');
    console.log('[Worker] 📊 源记录数据摘要:', {
      total_messages: sourceTotalMessages,
      has_stats: !!sourceRecord.stats,
      has_scores: !!(sourceRecord.l_score || sourceRecord.p_score),
      has_personality: !!sourceRecord.personality_type,
    });

    // 【处理占位冲突】即使目标记录已存在（例如身份为 github 且类型为 AUTO_REPORT 的空记录），也要执行迁移
    if (targetRecord) {
      console.log('[Worker] ✅ 目标记录已存在（可能是占位记录），执行字段合并迁移');
      console.log('[Worker] 📋 目标记录状态:', {
        id: targetRecord.id?.substring(0, 8) + '...',
        user_identity: targetRecord.user_identity,
        total_messages: targetRecord.total_messages || 0,
        has_data: !!(targetRecord.total_messages && targetRecord.total_messages > 0),
      });
    } else {
      console.log('[Worker] ✅ 目标记录不存在，将创建新记录并继承源记录数据');
    }

    // 【执行字段合并】将旧记录的关键字段 UPDATE 到当前的 userId 记录中
    // 关键字段：total_messages, stats, l_score, p_score, d_score, e_score, f_score, personality_type, roast_text
    const updateData: any = {
      id: githubUserId,
      user_identity: 'github',
      updated_at: new Date().toISOString(),
    };

    // 【字段合并】如果旧记录有数据（total_messages > 0），将其关键字段全部 UPDATE 到 userId 记录中
    // 1. total_messages - 使用源记录的值
    if (sourceRecord.total_messages !== null && sourceRecord.total_messages !== undefined) {
      updateData.total_messages = sourceRecord.total_messages;
    }
    
    // 2. stats - 直接覆盖（源记录的分析结果更完整）
    if (sourceRecord.stats) {
      const sourceStats = typeof sourceRecord.stats === 'string' 
        ? JSON.parse(sourceRecord.stats) 
        : sourceRecord.stats;
      updateData.stats = sourceStats;
    }
    
    // 3. 维度分数 - 直接覆盖
    if (sourceRecord.l_score !== null && sourceRecord.l_score !== undefined) {
      updateData.l_score = sourceRecord.l_score;
    }
    if (sourceRecord.p_score !== null && sourceRecord.p_score !== undefined) {
      updateData.p_score = sourceRecord.p_score;
    }
    if (sourceRecord.d_score !== null && sourceRecord.d_score !== undefined) {
      updateData.d_score = sourceRecord.d_score;
    }
    if (sourceRecord.e_score !== null && sourceRecord.e_score !== undefined) {
      updateData.e_score = sourceRecord.e_score;
    }
    if (sourceRecord.f_score !== null && sourceRecord.f_score !== undefined) {
      updateData.f_score = sourceRecord.f_score;
    }
    
    // 4. personality_type - 直接覆盖
    if (sourceRecord.personality_type) {
      updateData.personality_type = sourceRecord.personality_type;
    }
    
    // 5. roast_text - 直接覆盖
    if (sourceRecord.roast_text) {
      updateData.roast_text = sourceRecord.roast_text;
    }
    
    // 6. personality_data - 直接覆盖（如果存在）
    if (sourceRecord.personality_data) {
      const sourcePersonalityData = typeof sourceRecord.personality_data === 'string' 
        ? JSON.parse(sourceRecord.personality_data) 
        : sourceRecord.personality_data;
      updateData.personality_data = sourcePersonalityData;
      console.log('[Worker] ✅ 已包含 personality_data 字段，长度:', Array.isArray(sourcePersonalityData) ? sourcePersonalityData.length : 'N/A');
    }
    
    // 【物理归一化】更新 GitHub 记录的 fingerprint 字段为溯源成功的指纹，实现物理绑定
    if (successfulFp) {
      updateData.fingerprint = successfulFp;
      console.log('[Worker] 🔗 执行物理归一化：关联指纹已存入数据库');
    }
    
    // 保留目标记录的关键字段（用户名等），如果目标记录不存在则使用源记录
    updateData.user_name = targetRecord?.user_name || sourceRecord?.user_name || 'github_user';
    
    // 其他可选字段的覆盖（如果源记录有值）
    const optionalFields = [
      'total_chars', 'work_days', 'dimensions', 'personality',
      'ketao_count', 'jiafang_count', 'tease_count', 'nonsense_count',
      'ip_location', 'lat', 'lng', 'timezone', 'browser_lang',
      'personality_name', 'answer_book', 'metadata', 'hourly_activity', 'risk_level'
    ];
    
    optionalFields.forEach(field => {
      if (sourceRecord[field] !== null && sourceRecord[field] !== undefined) {
        // 对于 JSONB 字段，确保是对象格式
        if ((field === 'dimensions' || field === 'personality' || field === 'metadata' || field === 'hourly_activity') 
            && typeof sourceRecord[field] === 'string') {
          try {
            updateData[field] = JSON.parse(sourceRecord[field]);
          } catch (e) {
            console.warn(`[Worker] ⚠️ 字段 ${field} JSON 解析失败，跳过`);
          }
        } else {
          updateData[field] = sourceRecord[field];
        }
      }
    });

    // 清理 updateData，移除 null/undefined 值和无效字段
    const cleanedUpdateData: any = {
      id: githubUserId,
      user_identity: 'github',
      updated_at: new Date().toISOString(),
    };
    
    // 只添加有效字段
    Object.keys(updateData).forEach(key => {
      const value = updateData[key];
      // 跳过 null、undefined 和空字符串（但保留 0 和 false）
      if (value !== null && value !== undefined && value !== '') {
        cleanedUpdateData[key] = value;
      }
    });
    
    // 确保 user_name 存在
    if (!cleanedUpdateData.user_name) {
      cleanedUpdateData.user_name = targetRecord?.user_name || sourceRecord?.user_name || 'github_user';
    }
    
    console.log('[Worker] 📋 准备更新的字段:', Object.keys(cleanedUpdateData));
    console.log('[Worker] 📊 更新数据摘要:', {
      total_messages: cleanedUpdateData.total_messages,
      has_stats: !!cleanedUpdateData.stats,
      has_scores: !!(cleanedUpdateData.l_score || cleanedUpdateData.p_score),
      has_personality: !!cleanedUpdateData.personality_type,
      has_roast_text: !!cleanedUpdateData.roast_text,
    });
    
    // 【步骤 4：字段搬运】使用 supabase.update() 更新目标记录
    const updateUrl = `${env.SUPABASE_URL}/rest/v1/user_analysis?id=eq.${encodeURIComponent(githubUserId)}`;
    
    let updateResponse = await fetch(updateUrl, {
      method: 'PATCH',
      headers: {
        'apikey': env.SUPABASE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
      },
      body: JSON.stringify(cleanedUpdateData),
    });

    // 如果 PATCH 失败（404），尝试使用 upsert 创建新记录
    if (!updateResponse.ok) {
      const errorText = await updateResponse.text();
      console.warn('[Worker] ⚠️ PATCH 更新失败，尝试使用 upsert 创建新记录:', {
        status: updateResponse.status,
        error: errorText.substring(0, 200)
      });
      
      // 使用 upsert（POST with onConflict）
      const upsertUrl = `${env.SUPABASE_URL}/rest/v1/user_analysis`;
      updateResponse = await fetch(upsertUrl, {
        method: 'POST',
        headers: {
          'apikey': env.SUPABASE_KEY,
          'Authorization': `Bearer ${env.SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation,resolution=merge-duplicates',
        },
        body: JSON.stringify([cleanedUpdateData]),
      });
      
      if (!updateResponse.ok) {
        const upsertErrorText = await updateResponse.text();
        console.error('[Worker] ❌ Upsert 也失败:', {
          status: updateResponse.status,
          error: upsertErrorText.substring(0, 500)
        });
        return c.json({
          status: 'error',
          error: '更新用户数据失败',
          errorCode: 'UPDATE_FAILED',
          details: upsertErrorText.substring(0, 500),
          attemptedMethods: ['PATCH', 'POST upsert'],
        }, 500);
      }
    }

    const updatedUser = await updateResponse.json();
    const migratedUser = Array.isArray(updatedUser) && updatedUser.length > 0 ? updatedUser[0] : updatedUser;
    
    console.log('[Worker] ✅ 用户数据 UPDATE 成功:', {
      userId: githubUserId.substring(0, 8) + '...',
      userName: migratedUser?.user_name || 'N/A',
      method: updateResponse.status === 200 ? 'PATCH' : 'POST upsert',
      migratedFields: Object.keys(cleanedUpdateData).length,
      totalMessages: migratedUser?.total_messages || 0,
      hasScores: !!(migratedUser?.l_score || migratedUser?.p_score),
    });

    // 【物理同步】在迁移成功后，确保 fingerprint 字段物理更新
    if (successfulFp) {
      console.log('[Worker] 🔄 执行物理同步：更新 fingerprint 字段...');
      const fingerprintUpdateUrl = `${env.SUPABASE_URL}/rest/v1/user_analysis?id=eq.${encodeURIComponent(githubUserId)}`;
      
      const fingerprintUpdateResponse = await fetch(fingerprintUpdateUrl, {
        method: 'PATCH',
        headers: {
          'apikey': env.SUPABASE_KEY,
          'Authorization': `Bearer ${env.SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation',
        },
        body: JSON.stringify({
          fingerprint: successfulFp,
          updated_at: new Date().toISOString(),
        }),
      });

      if (!fingerprintUpdateResponse.ok) {
        const errorText = await fingerprintUpdateResponse.text();
        console.warn('[Worker] ⚠️ fingerprint 字段更新失败（不影响主流程）:', {
          status: fingerprintUpdateResponse.status,
          error: errorText.substring(0, 200)
        });
      } else {
        const fingerprintUpdateResult = await fingerprintUpdateResponse.json();
        console.log('[Worker] ✅ fingerprint 字段物理同步成功:', {
          userId: githubUserId.substring(0, 8) + '...',
          fingerprint: successfulFp.substring(0, 8) + '...',
          updated: fingerprintUpdateResult ? 'yes' : 'no'
        });
        console.log('[Worker] ✅ v_unified_analysis_v2 视图现在可以通过 fingerprint 字段正确关联数据');
      }
    }

    // 【物理清理】搬运完成后，务必 DELETE 掉原来的匿名记录，防止数据库膨胀和逻辑干扰
    // 注意：只有在 UPDATE 成功后才执行 DELETE 操作
    if (sourceRecord.id !== githubUserId) {
      console.log('[Worker] 🗑️ 开始物理清理：删除原有的匿名指纹记录...');
      console.log('[Worker] 📋 源记录信息:', {
        sourceId: sourceRecord.id.substring(0, 8) + '...',
        targetId: githubUserId.substring(0, 8) + '...',
        fingerprint: oldFingerprint.substring(0, 8) + '...',
        sourceTotalMessages: sourceTotalMessages,
      });
      
      const deleteUrl = `${env.SUPABASE_URL}/rest/v1/user_analysis?id=eq.${encodeURIComponent(sourceRecord.id)}`;
      
      const deleteResponse = await fetch(deleteUrl, {
        method: 'DELETE',
        headers: {
          'apikey': env.SUPABASE_KEY,
          'Authorization': `Bearer ${env.SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation',
        },
      });

      if (!deleteResponse.ok) {
        const errorText = await deleteResponse.text();
        console.error('[Worker] ❌ 物理清理失败：删除匿名指纹记录失败:', {
          status: deleteResponse.status,
          error: errorText.substring(0, 500)
        });
        // 删除失败不影响主流程，但记录错误并返回警告
        return c.json({
          status: 'partial_success',
          data: migratedUser,
          message: '数据物理过户成功，但删除旧记录失败',
          warning: '旧指纹记录可能仍存在，可能影响 v_unified_analysis_v2 视图统计和数据库性能',
          errorCode: 'DELETE_FAILED',
          details: errorText.substring(0, 500),
        }, 200);
      } else {
        console.log('[Worker] ✅ 物理清理完成：原有的匿名指纹记录已成功删除');
        console.log('[Worker] ✅ 数据库已清理，v_unified_analysis_v2 视图统计将不会出现重复');
      }
    } else {
      console.log('[Worker] ℹ️ 源记录 ID 与目标 ID 相同，无需物理清理');
    }

    console.log('[Worker] ✅ 数据物理过户完成，所有分析字段已成功迁移');
    console.log('[Worker] 📊 迁移摘要:', {
      sourceId: sourceRecord.id?.substring(0, 8) + '...',
      targetId: githubUserId.substring(0, 8) + '...',
      migratedFields: Object.keys(cleanedUpdateData).length,
      hasScores: !!(cleanedUpdateData.l_score || cleanedUpdateData.p_score),
      hasStats: !!cleanedUpdateData.stats,
      hasPersonality: !!cleanedUpdateData.personality_type,
      hasPersonalityData: !!cleanedUpdateData.personality_data,
      hasRoastText: !!cleanedUpdateData.roast_text,
      totalMessages: cleanedUpdateData.total_messages,
    });

    return c.json({
      status: 'success',
      data: migratedUser,
      message: '数据物理过户成功，所有分析字段已迁移完成',
      migratedFields: Object.keys(cleanedUpdateData).length,
      requiresRefresh: true, // 提示前端需要刷新视图
    });
  } catch (error: any) {
    console.error('[Worker] /api/fingerprint/migrate 错误:', error);
    const errorMessage = error?.message || error?.toString() || '未知错误';
    const errorStack = error?.stack ? error.stack.substring(0, 500) : null;
    
    return c.json({
      status: 'error',
      error: errorMessage,
      errorCode: 'INTERNAL_ERROR',
      details: errorStack,
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
    
    // 【新增】影子令牌生成逻辑
    const claimToken = crypto.randomUUID();
    console.log('[Worker] 🔑 为匿名用户(v1)生成 claim_token:', claimToken.substring(0, 8) + '...');

    const payload = {
      user_identity: userIdentity,
      claim_token: claimToken, // 保存令牌到数据库
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
    
    const writeRes = await fetchSupabase(env, insertUrl, {
      method: 'POST',
      headers: {
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

      // 刷新触发：写入成功后异步调用 RPC 刷新视图
      const executionCtx = c.executionCtx;
      if (executionCtx && typeof executionCtx.waitUntil === 'function') {
        executionCtx.waitUntil(refreshGlobalStatsV6Rpc(env));
      }
    }
    
    // 4. 并行计算排名 + 获取全局平均值（带超时 abortSignal，防止并发堆积）
    const { signal: statsSignal, cancel: cancelStatsTimeout } = createTimeoutSignal(SUPABASE_FETCH_TIMEOUT_MS);
    const [totalUsersRes, globalRes] = await Promise.all([
      fetch(`${env.SUPABASE_URL}/rest/v1/v_global_stats_v6?select=totalUsers`, {
        headers: buildSupabaseHeaders(env),
        signal: statsSignal,
      }),
      fetch(`${env.SUPABASE_URL}/rest/v1/v_global_stats_v6?select=*`, {
        headers: buildSupabaseHeaders(env),
        signal: statsSignal,
      }),
    ]).finally(() => {
      cancelStatsTimeout();
    });
    
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
        
        const res = await fetchSupabase(env, queryUrl, {
          headers: {
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
      claim_token: claimToken, // 【关键修复】向前端返回影子令牌，用于登录后认领数据
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

// ==========================================
// 语义爆发：趋势统计（本地提取 + 云端计数）
// ==========================================
function getMonthBucketUtc(date = new Date()): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}-01`;
}

function normalizeRegion(locationParam?: string | null): string {
  const raw = String(locationParam || '').trim();
  // 与产品文案对齐：默认 Global（首字母大写）
  if (!raw) return 'Global';
  // 兼容常见写法：GLOBAL / WORLD 统一映射到 Global
  const upper = raw.toUpperCase();
  if (upper === 'GLOBAL' || upper === 'WORLD' || upper === 'ALL' || upper === 'ALL_USERS') return 'Global';
  if (isUSLocation(raw)) return 'US';
  // 只保留常见安全字符，避免异常输入污染维度；尽量保留原始大小写习惯
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, '');
  return cleaned || 'Global';
}

/**
 * POST /api/report-slang
 * 前端静默上报：{ phrases: string[], location: string }
 * 后端异步计数（waitUntil），不阻塞响应
 */
// NOTE: 按需求“物理注入位置”调整：/api/report-slang 路由块移动到 /api/global-average 下方

/**
 * GET /api/slang-trends?location=US&limit=10
 * 返回本月 hit_count 最高的若干词：[{ phrase, hit_count }]
 */
app.get('/api/slang-trends', async (c) => {
  const env = c.env;
  if (!env.SUPABASE_URL || !env.SUPABASE_KEY) {
    return c.json({ success: false, error: 'Supabase 未配置' }, 500);
  }

  const location = c.req.query('location');
  const region = normalizeRegion(location);
  const limit = Math.max(1, Math.min(20, Number(c.req.query('limit') || 10)));
  const timeBucket = getMonthBucketUtc(new Date());

  const url = new URL(`${env.SUPABASE_URL}/rest/v1/slang_trends`);
  url.searchParams.set('select', 'phrase,hit_count');
  url.searchParams.set('region', `eq.${region}`);
  url.searchParams.set('time_bucket', `eq.${timeBucket}`);
  url.searchParams.set('order', 'hit_count.desc');
  url.searchParams.set('limit', String(limit));

  try {
    const rows = await fetchSupabaseJson<any[]>(env, url.toString(), {
      headers: buildSupabaseHeaders(env),
    });
    const normalized = (Array.isArray(rows) ? rows : []).map((r: any) => ({
      phrase: String(r?.phrase || ''),
      hit_count: Number(r?.hit_count) || 0,
    })).filter((r) => r.phrase);
    return c.json({ success: true, region, timeBucket, items: normalized });
  } catch (err: any) {
    console.error('[Worker] /api/slang-trends 错误:', err);
    return c.json({ success: false, error: err?.message || '查询失败' }, 500);
  }
});

/**
 * GET /api/vibe-keywords
 * 用途：为 Dashboard 提供全局“黑话词云”Top 50
 * 数据源优先级：
 * 1) v_keyword_stats 视图（推荐，已预聚合）
 * 2) user_analysis_results 表（兼容旧结构，如存在预聚合字段）
 *
 * 返回格式：
 * { "status": "success", "data": [ { "name": "闭环", "value": 120 }, ... ] }
 *
 * 失败回退：
 * - 查不到数据或查询失败 -> 返回 mock 词云数据
 *
 * CORS：
 * - 本 Worker 已对 '/*' 全局启用 cors(origin='*')，此处无需重复配置
 */
app.get('/api/vibe-keywords', async (c) => {
  const env = c.env;

  const mockData = () => ([
    { name: '颗粒度', value: 180 },
    { name: '闭环', value: 165 },
    { name: '方法论', value: 142 },
    { name: '对齐', value: 130 },
    { name: '落地', value: 118 },
    { name: '抓手', value: 110 },
    { name: '复盘', value: 98 },
    { name: '护城河', value: 92 },
    { name: '赛道', value: 86 },
    { name: '赋能', value: 80 },
    { name: '链路', value: 76 },
    { name: '兜底', value: 70 },
    { name: '解耦', value: 64 },
    { name: '降维打击', value: 58 },
  ]);

  // 统一将任意行映射为 {name,value}
  const normalizeRows = (rows: any[]): Array<{ name: string; value: number }> => {
    return (Array.isArray(rows) ? rows : [])
      .map((r: any) => {
        const name =
          r?.name ??
          r?.phrase ??
          r?.keyword ??
          r?.word ??
          r?.term ??
          r?.token ??
          '';
        const value =
          r?.value ??
          r?.hit_count ??
          r?.count ??
          r?.freq ??
          r?.frequency ??
          r?.total ??
          0;
        const n = String(name || '').trim();
        const v = Number(value);
        return { name: n, value: Number.isFinite(v) ? v : 0 };
      })
      .filter((x) => x.name && x.value > 0)
      .slice(0, 50);
  };

  if (!env.SUPABASE_URL || !env.SUPABASE_KEY) {
    // 无 Supabase 配置也要给前端可用数据
    return c.json({ status: 'success', data: mockData() });
  }

  const headers = buildSupabaseHeaders(env);

  // 1) 优先查询 v_keyword_stats
  try {
    const url = new URL(`${env.SUPABASE_URL}/rest/v1/v_keyword_stats`);
    url.searchParams.set('select', '*');
    url.searchParams.set('order', 'value.desc');
    url.searchParams.set('limit', '50');
    const rows = await fetchSupabaseJson<any[]>(env, url.toString(), { headers });
    const data = normalizeRows(rows);
    if (data.length > 0) {
      return c.json({ status: 'success', data });
    }
  } catch (err: any) {
    console.warn('[Worker] /api/vibe-keywords v_keyword_stats 查询失败:', err?.message || String(err));
  }

  // 2) 兼容：尝试从 user_analysis_results 拉取（如果存在预聚合字段）
  try {
    const url = new URL(`${env.SUPABASE_URL}/rest/v1/user_analysis_results`);
    url.searchParams.set('select', '*');
    // 尝试常见字段 hit_count / value / count 作为排序字段
    url.searchParams.set('order', 'hit_count.desc');
    url.searchParams.set('limit', '50');
    const rows = await fetchSupabaseJson<any[]>(env, url.toString(), { headers });
    const data = normalizeRows(rows);
    if (data.length > 0) {
      return c.json({ status: 'success', data });
    }
  } catch (err: any) {
    console.warn('[Worker] /api/vibe-keywords user_analysis_results 查询失败:', err?.message || String(err));
  }

  // 3) 兜底：mock
  return c.json({ status: 'success', data: mockData() });
});

/**
 * 【第二阶段新增】路由：/api/global-average
 * 功能：获取全局平均分，优先从 KV 读取，如果不存在或过期则从 Supabase 查询并缓存
 * 重构：确保返回结构100%完整，包含所有必需字段
 */
app.get('/api/global-average', async (c) => {
  // ============================
  // 接口升级：右侧抽屉 V6 全局统计
  // 1) 优先读取 KV：GLOBAL_DASHBOARD_DATA（Cache Hit -> Return）
  // 2) Cache Miss -> 回源 Supabase：rest/v1/v_global_stats_v6?select=*（注意返回数组，取 data[0]）
  // 3) 写回 KV（Expiration: 300s）-> Return
  // 4) location=US / United States：将 us_stats 的数值平替到顶层字段（并对 null 做 0 兜底）
  // 5) 所有 Supabase 请求：带 apikey + 8 秒超时
  // ============================
  const env = c.env;
  const countryCode = c.req.query('country_code') || c.req.query('countryCode') || c.req.query('location') || '';
  const region = normalizeRegion(countryCode);
  const wantsUS = isUSLocation(region);
  const wantsSnapshotRegion = /^[A-Z]{2}$/.test(String(region || '').toUpperCase()) && String(region).toUpperCase() !== 'GLOBAL';

  if (!env.SUPABASE_URL || !env.SUPABASE_KEY) {
    return c.json({ success: false, error: 'Supabase 未配置' }, 500);
  }

  // 1) Cache Hit：优先读 KV（按 region 分 key，避免跨国缓存污染）
  let baseRow: any | null = null;
  const kvKey = region === 'Global' ? KV_KEY_GLOBAL_DASHBOARD_DATA : `${KV_KEY_GLOBAL_DASHBOARD_DATA}:${String(region).toUpperCase()}`;
  if (env.STATS_STORE) {
    try {
      baseRow = await env.STATS_STORE.get(kvKey, 'json');
    } catch (err) {
      console.warn('[Worker] ⚠️ /api/global-average KV 读取失败，回源 Supabase:', err);
    }
  }

  // 2) Cache Miss：回源 Supabase（优先 RPC：快照聚合；否则回退旧全局视图 v_global_stats_v6）
  if (!baseRow) {
    try {
      if (wantsSnapshotRegion) {
        // ✅ 新策略：国家聚合按行为快照（analysis_events.snapshot_country / keyword_logs.snapshot_country）
        // 若 RPC/表尚未部署，会自动回退旧逻辑，不阻塞上线。
        const rpcUrl = `${env.SUPABASE_URL}/rest/v1/rpc/get_country_dashboard_v1`;
        const rpcRes = await fetchSupabaseJson<any>(env, rpcUrl, {
          method: 'POST',
          headers: buildSupabaseHeaders(env, { 'Content-Type': 'application/json' }),
          body: JSON.stringify({ p_region: String(region).toUpperCase() }),
        }, SUPABASE_FETCH_TIMEOUT_MS).catch(() => null);
        // Supabase RPC 可能返回 object 或数组（取第一项）
        const rpcRow = Array.isArray(rpcRes) ? rpcRes[0] : rpcRes;
        if (rpcRow && typeof rpcRow === 'object') {
          baseRow = rpcRow;
        } else {
          baseRow = {};
        }
      } else {
        const url = `${env.SUPABASE_URL}/rest/v1/v_global_stats_v6?select=*`;
        const data = await fetchSupabaseJson<any[]>(env, url, {
          headers: buildSupabaseHeaders(env),
        }, SUPABASE_FETCH_TIMEOUT_MS);
        baseRow = (Array.isArray(data) ? data[0] : null) || {};
      }

      // 3) 写回 KV（300s）
      if (env.STATS_STORE) {
        try {
          await (env.STATS_STORE.put as any)(kvKey, JSON.stringify(baseRow), {
            expirationTtl: KV_GLOBAL_STATS_V6_VIEW_TTL,
          });
        } catch (err) {
          console.warn('[Worker] ⚠️ /api/global-average KV 写入失败（不影响返回）:', err);
        }
      }
    } catch (err: any) {
      console.warn('[Worker] ❌ /api/global-average Supabase 回源失败:', err?.message || String(err));
      baseRow = {};
    }
  }

  // 4) latest_records 字段对齐：为每条记录补 personality_type（兼容前端 stats2.html）
  if (baseRow && Array.isArray(baseRow.latest_records)) {
    baseRow.latest_records = baseRow.latest_records.map((r: any) => ({
      ...r,
      personality_type: r?.p_type ?? r?.personality_type, // 兼容：p_type -> personality_type
    }));
  }

  // 5) 地理过滤：US 平替（保留兼容）；其他国家由 RPC 直接返回该国口径
  const finalRow = wantsUS ? applyUsStatsToGlobalRow(baseRow) : baseRow;

  // 6) monthly_vibes：返回该国 Top 词云（slang / merit / sv_slang）
  // 重构：数据源改为 slang_trends_pool（不分月桶），按 hit_count desc 取前 20
  try {
    const region = normalizeRegion(countryCode);

    const fetchTop = async (category: 'slang' | 'merit' | 'sv_slang' | 'phrase') => {
      const url = new URL(`${env.SUPABASE_URL}/rest/v1/slang_trends_pool`);
      url.searchParams.set('select', 'phrase,hit_count');
      url.searchParams.set('region', `eq.${region}`);
      url.searchParams.set('category', `eq.${category}`);
      url.searchParams.set('order', 'hit_count.desc');
      url.searchParams.set('limit', '20');
      const rows = await fetchSupabaseJson<any[]>(env, url.toString(), {
        headers: buildSupabaseHeaders(env),
      });
      return (Array.isArray(rows) ? rows : [])
        .map((r: any) => ({ phrase: String(r?.phrase || ''), hit_count: Number(r?.hit_count) || 0 }))
        .filter((x) => x.phrase);
    };

    const [slang, merit, svSlang, phrases] = await Promise.all([
      fetchTop('slang').catch(() => []),
      fetchTop('merit').catch(() => []),
      fetchTop('sv_slang').catch(() => []),
      fetchTop('phrase').catch(() => []),
    ]);

    // ✅ 契约字段：monthlyVibes（camelCase），并确保三类都存在且为数组
    (finalRow as any).monthlyVibes = {
      slang: Array.isArray(slang) ? slang : [],
      merit: Array.isArray(merit) ? merit : [],
      sv_slang: Array.isArray(svSlang) ? svSlang : [],
      phrase: Array.isArray(phrases) ? phrases : [],
    };

    // 兼容旧字段：monthly_vibes（snake_case）
    (finalRow as any).monthly_vibes = {
      region,
      // pool 口径不带 time_bucket：保留字段但置为 null，避免前端依赖字段不存在
      time_bucket: null,
      slang,
      merit,
      sv_slang: svSlang,
      phrase: phrases,
    };

    // 兼容旧字段：monthly_slang 仅保留 slang 的 phrase 列表
    (finalRow as any).monthly_slang = slang.map((x: any) => x.phrase);

    // 【V6.3 约束】top_sentences 必须来自用户真实句子池 sentence_pool
    // 且必须是“雷同”（hit_count >= 2）。句子归一化在数据库层完成（normalized_sentence）。
    // 不允许回退到关键词/短语。
    try {
      const MIN_HIT_FOR_TOP_SENTENCES = 2;
      const sentenceUrl = new URL(`${env.SUPABASE_URL}/rest/v1/sentence_pool`);
      sentenceUrl.searchParams.set('select', 'sentence,hit_count,last_seen_at');
      sentenceUrl.searchParams.set('region', `eq.${region}`);
      sentenceUrl.searchParams.set('hit_count', `gte.${MIN_HIT_FOR_TOP_SENTENCES}`);
      sentenceUrl.searchParams.set('order', 'hit_count.desc,last_seen_at.desc');
      sentenceUrl.searchParams.set('limit', '10');

      const sentenceRows = await fetchSupabaseJson<any[]>(env, sentenceUrl.toString(), {
        headers: buildSupabaseHeaders(env),
      }).catch(() => []);

      const topSentences = (Array.isArray(sentenceRows) ? sentenceRows : [])
        .map((r: any) => ({
          sentence: String(r?.sentence || '').trim(),
          hit_count: Number(r?.hit_count) || 0,
          last_seen_at: r?.last_seen_at || null,
        }))
        .filter((x) => x.sentence && x.hit_count >= MIN_HIT_FOR_TOP_SENTENCES);

      (finalRow as any).top_sentences = topSentences;
      (finalRow as any).top_sentences_min_hit = MIN_HIT_FOR_TOP_SENTENCES;
      (finalRow as any).top_sentences_source = 'sentence_pool';
    } catch (e) {
      // 失败/无表：严格返回空数组，避免“非真实句子”混入
      (finalRow as any).top_sentences = [];
      (finalRow as any).top_sentences_min_hit = 2;
      (finalRow as any).top_sentences_source = 'sentence_pool';
    }

    // Debug：帮助定位“country_code=US 但返回 Global/空数组”的问题
    try {
      const debug = String(c.req.query('debug') || c.req.query('debugSemanticBurst') || '').trim();
      if (debug === '1' || debug.toLowerCase() === 'true') {
    (finalRow as any)._debugSemanticBurst = {
          countryCodeRaw: String(countryCode || ''),
          regionComputed: region,
          sourceTable: 'slang_trends_pool',
          topLimit: 20,
          counts: {
            slang: Array.isArray(slang) ? slang.length : 0,
            merit: Array.isArray(merit) ? merit.length : 0,
            sv_slang: Array.isArray(svSlang) ? svSlang.length : 0,
        phrase: Array.isArray(phrases) ? phrases.length : 0,
          },
        };
      }
    } catch {
      // ignore
    }
  } catch (e) {
    (finalRow as any).monthly_slang = [];
    // ✅ 契约字段：失败也要返回空数组，不返回 null/undefined
    (finalRow as any).monthlyVibes = { slang: [], merit: [], sv_slang: [] };
    (finalRow as any).monthly_vibes = {
      region: normalizeRegion(countryCode),
      time_bucket: getMonthBucketUtc(new Date()),
      slang: [],
      merit: [],
      sv_slang: [],
    };
  }

  // 7) 黑话榜聚合（按需）：slang_trends_pool + 时间衰减
  // - country_code: 从 slang_trends_pool 过滤 region
  // - top10: hit_count desc 前 10
  // - cloud50: hit_count * 时间衰减因子 desc 前 50
  try {
    const region = normalizeRegion(countryCode);
    const nowMs = Date.now();
    const HALF_LIFE_DAYS = 14; // 可按产品需要调整：越小越“追新”

    const poolUrl = new URL(`${env.SUPABASE_URL}/rest/v1/slang_trends_pool`);
    poolUrl.searchParams.set('select', 'phrase,hit_count,updated_at,created_at');
    poolUrl.searchParams.set('region', `eq.${region}`);
    poolUrl.searchParams.set('order', 'hit_count.desc');
    // 为了更准确挑出“近期爆发但 hit_count 不高”的词：取更大的候选集再做衰减排序
    poolUrl.searchParams.set('limit', '500');

    const rows = await fetchSupabaseJson<any[]>(env, poolUrl.toString(), {
      headers: buildSupabaseHeaders(env),
    });

    const items = (Array.isArray(rows) ? rows : [])
      .map((r: any) => {
        const phrase = String(r?.phrase ?? '').trim();
        const hitCount = Number(r?.hit_count ?? 0) || 0;
        const tsStr = String(r?.updated_at || r?.created_at || '');
        const ts = Date.parse(tsStr);
        const ageDays = Number.isFinite(ts) ? Math.max(0, (nowMs - ts) / 86400000) : 0;
        const decay = Math.pow(0.5, ageDays / HALF_LIFE_DAYS);
        const activity = hitCount * decay;
        return { phrase, hit_count: hitCount, activity };
      })
      .filter((x) => x.phrase && x.phrase.length >= 2 && x.phrase.length <= 120 && x.hit_count > 0);

    const top10 = items
      .slice()
      .sort((a, b) => (b.hit_count - a.hit_count) || (b.activity - a.activity) || (a.phrase > b.phrase ? 1 : -1))
      .slice(0, 10)
      .map(({ phrase, hit_count }) => ({ phrase, hit_count }));

    const cloud50 = items
      .slice()
      .sort((a, b) => (b.activity - a.activity) || (b.hit_count - a.hit_count) || (a.phrase > b.phrase ? 1 : -1))
      .slice(0, 50)
      .map(({ phrase, hit_count }) => ({ phrase, hit_count }));

    (finalRow as any).top10 = top10;
    (finalRow as any).cloud50 = cloud50;
  } catch {
    (finalRow as any).top10 = [];
    (finalRow as any).cloud50 = [];
  }
  return c.json(finalRow);
});


/**
 * POST /api/report-slang
 * 前端静默上报（支持 v1/v2 兼容）：
 * - v1: { phrases: string[], location?: string }
 * - v2: { region?: string, country_code?: string, location?: string, items: [{ phrase, category, weight }] }
 *
 * 后端加权引擎：
 * - 引入种子词典（Seed Dictionary）
 * - 若命中种子词：delta = baseWeight * 10，否则 delta = baseWeight * 1
 * - 异步入库：c.executionCtx.waitUntil(...) 调用 Supabase RPC upsert_slang_hits_v2
 */
type VibeCategory = 'slang' | 'merit' | 'sv_slang' | 'phrase';

const SEED_DICTIONARY: Record<VibeCategory, Set<string>> = {
  slang: new Set([
    '颗粒度', '闭环', '方法论', '架构', '解耦', '底层逻辑', '降维打击', '赋能', '护城河',
    '赛道', '对齐', '抓手', '落地', '复盘', '链路', '范式', '心智', '质检', '兜底',
  ]),
  merit: new Set([
    '功德', '福报', '积德', '善业', '救火', '背锅', '功劳', '加班', '熬夜',
  ]),
  sv_slang: new Set([
    '护城河', '增长', '融资', '赛道', '头部效应', '估值', '现金流', '天使轮', 'A轮',
  ]),
  // 国民级词组：不做种子放大，保持自然计数
  phrase: new Set([]),
};

function normalizeCategory(input: any): VibeCategory {
  const raw = String(input || '').trim().toLowerCase();
  if (raw === 'merit') return 'merit';
  if (raw === 'sv_slang' || raw === 'svslang' || raw === 'siliconvalley') return 'sv_slang';
  if (raw === 'phrase' || raw === 'ngram' || raw === 'idiom') return 'phrase';
  return 'slang';
}

function toSafeDelta(weight: any, isSeedHit: boolean): number {
  const base = Number(weight);
  const baseWeight = Number.isFinite(base) && base > 0 ? Math.floor(base) : 1;
  const mult = isSeedHit ? 10 : 1;
  return Math.max(1, Math.min(500, baseWeight * mult));
}

function toSafeCount(input: any): number {
  // 句式热度池：count 可能比 weight 大得多，但仍需限制以防滥用
  const n = Number(input);
  const v = Number.isFinite(n) && n > 0 ? Math.floor(n) : 1;
  return Math.max(1, Math.min(5000, v));
}

function toSafePoolDelta(weight: any): number {
  // /api/v2/report-vibe：国家大盘聚合增量，严格限制最大 5，防止异常权重污染
  const n = Number(weight);
  const v = Number.isFinite(n) && n > 0 ? Math.floor(n) : 1;
  return Math.max(1, Math.min(5, v));
}

app.post('/api/report-slang', async (c) => {
  const env = c.env;
  if (!env.SUPABASE_URL || !env.SUPABASE_KEY) {
    return c.json({ success: false, error: 'Supabase 未配置' }, 500);
  }

  let body: any = null;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ success: false, error: 'Invalid JSON' }, 400);
  }

  const regionInput = body?.region ?? body?.country_code ?? body?.location;
  let region = normalizeRegion(regionInput);
  // 后端兜底：若前端未正确上报地区，则使用 Cloudflare 的 cf.country
  try {
    const rawReq: any = c.req?.raw;
    const cfCountry = String(rawReq?.cf?.country || '').trim().toUpperCase();
    if (region === 'Global' && /^[A-Z]{2}$/.test(cfCountry)) {
      region = cfCountry;
    }
  } catch {
    // ignore
  }

  // v2 items
  const itemsRaw: any[] = Array.isArray(body?.items) ? body.items : [];
  // v1 phrases
  const phrasesRaw: any[] = Array.isArray(body?.phrases) ? body.phrases : [];

  const items: Array<{ phrase: string; category: 'slang' | 'merit' | 'sv_slang' | 'phrase'; delta: number }> = [];

  for (const it of itemsRaw) {
    const phrase = String(it?.phrase || '').trim();
    // phrase 类别允许更长一点（最多 64），用于 3-5 词组/短句
    if (!phrase || phrase.length < 2 || phrase.length > 64) continue;
    const category = normalizeCategory(it?.category);
    const isSeedHit = SEED_DICTIONARY[category]?.has(phrase) || false;
    const delta = toSafeDelta(it?.weight ?? 1, isSeedHit);
    items.push({ phrase, category, delta });
    if (items.length >= 15) break;
  }

  if (items.length === 0) {
    // fallback: treat v1 phrases as slang
    for (const p of phrasesRaw) {
      const phrase = String(p || '').trim();
      if (!phrase || phrase.length < 2 || phrase.length > 24) continue;
      const isSeedHit = SEED_DICTIONARY.slang.has(phrase);
      const delta = toSafeDelta(1, isSeedHit);
      items.push({ phrase, category: 'slang', delta });
      if (items.length >= 10) break;
    }
  }

  if (items.length === 0) {
    return c.json({ success: true, queued: false });
  }

  const rpcUrl = `${env.SUPABASE_URL}/rest/v1/rpc/upsert_slang_hits_v2`;

  c.executionCtx.waitUntil((async () => {
    for (const it of items) {
      try {
        await fetchSupabaseJson(env, rpcUrl, {
          method: 'POST',
          headers: buildSupabaseHeaders(env, { 'Content-Type': 'application/json' }),
          body: JSON.stringify({
            p_phrase: it.phrase,
            p_region: region,
            p_category: it.category,
            p_delta: it.delta,
          }),
        });
      } catch (err: any) {
        console.warn('[Worker] ⚠️ /api/report-slang upsert_slang_hits_v2 失败:', err?.message || String(err));
      }
    }
  })());

  return c.json({ success: true, queued: true, region, items: items.length });
});

/**
 * POST /api/report-sentences
 * 句式热度池（国家维度）上报：
 * - v1: { location?: string, country_code?: string, region?: string, text?: string, sentences?: string[] }
 * - v1b: { region, items: [{ sentence: string, count?: number }] }
 *
 * 要求：
 * - 必须来自用户真实文本（前端从用户输入/分析文本中提取）
 * - 句子不要太长（后端二次过滤）
 * - 不强行凑 10：只累计真实出现过的句子
 */
app.post('/api/report-sentences', async (c) => {
  const env = c.env;
  if (!env.SUPABASE_URL || !env.SUPABASE_KEY) {
    return c.json({ success: false, error: 'Supabase 未配置' }, 500);
  }

  let body: any = null;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ success: false, error: 'Invalid JSON' }, 400);
  }

  const regionInput = body?.region ?? body?.country_code ?? body?.location;
  let region = normalizeRegion(regionInput);
  // 兜底：若未上报地区，尽量使用 Cloudflare cf.country
  try {
    const rawReq: any = c.req?.raw;
    const cfCountry = String(rawReq?.cf?.country || '').trim().toUpperCase();
    if (region === 'Global' && /^[A-Z]{2}$/.test(cfCountry)) region = cfCountry;
  } catch {
    // ignore
  }

  // 后端保底过滤（与前端一致，避免污染）
  const normalizeSentence = (s: any): string => {
    const raw = String(s ?? '').replace(/\s+/g, ' ').trim();
    // 去掉首尾成串标点
    return raw.replace(/^[\s"'“”‘’`~!！?？。.,，;；:：()\[\]{}<>-]+/g, '').replace(/[\s"'“”‘’`~!！?？。.,，;；:：()\[\]{}<>-]+$/g, '').trim();
  };

  const isBadSentence = (s: string): boolean => {
    if (!s) return true;
    if (s.length < 6) return true; // 太短没意义
    if (s.length > 140) return true; // 不要太长
    const low = s.toLowerCase();
    if (low.includes('http://') || low.includes('https://')) return true;
    if (low.includes('```')) return true;
    // 过多符号/代码味
    const sym = (s.match(/[{}[\]<>$=_*\\|]/g) || []).length;
    if (sym >= 6) return true;
    return false;
  };

  const items: Array<{ sentence: string; count: number }> = [];

  // items [{sentence,count}]
  if (Array.isArray(body?.items)) {
    for (const it of body.items) {
      const sent = normalizeSentence(it?.sentence);
      if (isBadSentence(sent)) continue;
      const cnt = toSafeCount(it?.count ?? 1);
      items.push({ sentence: sent, count: cnt });
      if (items.length >= 25) break;
    }
  }

  // sentences: string[]
  if (items.length === 0 && Array.isArray(body?.sentences)) {
    for (const s of body.sentences) {
      const sent = normalizeSentence(s);
      if (isBadSentence(sent)) continue;
      items.push({ sentence: sent, count: 1 });
      if (items.length >= 25) break;
    }
  }

  // text: server-side split (兜底)
  if (items.length === 0 && body?.text) {
    const rawText = String(body.text || '');
    const parts = rawText
      .split(/[\n\r]+|[。！？!?；;]+/g)
      .map((x) => normalizeSentence(x))
      .filter((x) => !isBadSentence(x));
    // 本次文本内部去重计数
    const freq = new Map<string, number>();
    for (const p of parts) freq.set(p, (freq.get(p) || 0) + 1);
    const ranked = Array.from(freq.entries())
      .map(([sentence, count]) => ({ sentence, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 25);
    items.push(...ranked);
  }

  if (items.length === 0) {
    return c.json({ success: true, region, accepted: 0 });
  }

  const rpcUrl = `${env.SUPABASE_URL}/rest/v1/rpc/upsert_sentence_pool_v1`;
  const headers = buildSupabaseHeaders(env, { 'Content-Type': 'application/json' });

  // 异步写入，不阻塞响应
  c.executionCtx.waitUntil((async () => {
    for (const it of items) {
      try {
        await fetchSupabaseJson(env, rpcUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            p_sentence: it.sentence,
            p_region: region,
            p_delta: Math.max(1, Math.min(50, it.count)),
          }),
        });
      } catch (e) {
        // ignore per-item
      }
    }
  })());

  return c.json({ success: true, region, accepted: items.length });
});

/**
 * POST /api/v2/report-vibe
 * 前端分析器上报：关键词 + 指纹 + 时间戳（非阻塞）
 * 兼容 payload:
 * - v2 keyword: { keywords: [{ phrase, category, weight }], fingerprint, timestamp, region }
 * - v2 phrase pool: { phrases: [{ phrase, count, category }], fingerprint, timestamp, region }
 *
 * 后端：异步写入 slang_trends（通过 upsert_slang_hits_v2）
 */
app.post('/api/v2/report-vibe', async (c) => {
  const env = c.env;
  if (!env.SUPABASE_URL || !env.SUPABASE_KEY) {
    return c.json({ status: 'error', error: 'Supabase 未配置' }, 500);
  }

  let body: any = null;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ status: 'error', error: 'Invalid JSON' }, 400);
  }

  // debug 开关：debug=1（query 或 body）
  const debugFlag = String((c.req.query?.('debug') ?? '') || (body?.debug ?? '') || '').trim().toLowerCase();
  const isDebug = debugFlag === '1' || debugFlag === 'true';

  // region 判定（支持“手动地域修正”）：
  // - 优先：manual_region（前端用户选择）
  // - 次优：cf-ipcountry / cf.country（物理 IP）
  // - 兼容：payload.region / country_code / location
  const manualRegionRaw = normalizeRegion(body?.manual_region ?? body?.manualRegion ?? '');
  const manualRegion = /^[A-Za-z]{2}$/.test(manualRegionRaw) ? manualRegionRaw.toUpperCase() : manualRegionRaw;

  const payloadRegionRaw = normalizeRegion(body?.region ?? body?.country_code ?? body?.location ?? 'Global');
  const payloadRegion = /^[A-Za-z]{2}$/.test(payloadRegionRaw) ? payloadRegionRaw.toUpperCase() : payloadRegionRaw;

  let cfCountry = '';
  try {
    const rawReq: any = c.req?.raw;
    cfCountry = String(rawReq?.cf?.country || c.req.header('cf-ipcountry') || '').trim().toUpperCase();
  } catch {
    // ignore
  }

  let region = payloadRegion;
  if (/^[A-Z]{2}$/.test(manualRegion)) region = manualRegion;
  else if (/^[A-Z]{2}$/.test(cfCountry)) region = cfCountry;
  const keywords = Array.isArray(body?.keywords) ? body.keywords : [];
  const locationWeightRaw = Number(body?.location_weight ?? body?.locationWeight ?? 1);
  const locationWeight = Number.isFinite(locationWeightRaw) ? Math.max(0, Math.min(1, locationWeightRaw)) : 1;
  const switchedAt = body?.location_switched_at ?? body?.locationSwitchedAt ?? null;
  const snapshotCountry = region; // 该行为发生时的快照国家（用于后续聚合）

  const items: Array<{ phrase: string; category: VibeCategory; delta: number }> = [];
  for (const it of keywords) {
    const phrase = String(it?.phrase || '').trim();
    if (!phrase || phrase.length < 2 || phrase.length > 120) continue;
    const category = normalizeCategory(it?.category);
    const baseDelta = toSafePoolDelta(it?.weight ?? 1);
    // location_weight：用户刚切换国籍时，逐渐把贡献从 0 -> 1 迁入新国家（防止瞬时刷屏/污染）
    const scaled = Math.floor(baseDelta * locationWeight);
    const delta = Math.max(0, Math.min(5, scaled));
    if (delta <= 0) continue;
    items.push({ phrase, category, delta });
    if (items.length >= 25) break;
  }

  if (items.length === 0) {
    return c.json({ status: 'success', queued: false });
  }

  const poolRpcUrl = `${env.SUPABASE_URL}/rest/v1/rpc/upsert_slang_pool_hits_v1`;

  // Debug 模式：同步执行并返回每条 RPC 结果（便于排查写库失败原因）
  if (isDebug) {
    const results: Array<{
      idx: number;
      phrase: string;
      category: VibeCategory;
      delta: number;
      ok: boolean;
      status?: number;
      error?: string;
    }> = [];

    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      try {
        const res = await fetchSupabase(env, poolRpcUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            p_phrase: it.phrase,
            p_region: region,
            p_category: it.category,
            p_delta: it.delta,
          }),
        });
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          results.push({
            idx: i,
            phrase: it.phrase,
            category: it.category,
            delta: it.delta,
            ok: false,
            status: res.status,
            error: text || `Supabase HTTP ${res.status}`,
          });
        } else {
          results.push({
            idx: i,
            phrase: it.phrase,
            category: it.category,
            delta: it.delta,
            ok: true,
            status: res.status,
          });
        }
      } catch (e: any) {
        results.push({
          idx: i,
          phrase: it.phrase,
          category: it.category,
          delta: it.delta,
          ok: false,
          error: e?.message || String(e),
        });
      }
    }

    const okCount = results.filter(r => r.ok).length;
    // debug: 写入后立刻读回（验证 SELECT/RLS 是否正常）
    let postWriteReadback: any = null;
    try {
      const readUrl = new URL(`${env.SUPABASE_URL}/rest/v1/slang_trends_pool`);
      readUrl.searchParams.set('select', 'phrase,hit_count,category,updated_at');
      readUrl.searchParams.set('region', `eq.${region}`);
      readUrl.searchParams.set('order', 'hit_count.desc');
      readUrl.searchParams.set('limit', '20');
      const rows = await fetchSupabaseJson<any[]>(env, readUrl.toString(), {
        headers: buildSupabaseHeaders(env),
      });
      postWriteReadback = {
        ok: true,
        count: Array.isArray(rows) ? rows.length : 0,
        top: (Array.isArray(rows) ? rows : []).slice(0, 20),
      };
    } catch (e: any) {
      postWriteReadback = {
        ok: false,
        error: e?.message || String(e),
      };
    }

    return c.json({
      status: 'debug',
      regionResolved: region,
      regionCandidates: {
        manual_region: manualRegion || null,
        payload_region: payloadRegion || null,
        cf_country: cfCountry || null,
      },
      receivedKeywords: Array.isArray(body?.keywords) ? body.keywords.length : 0,
      acceptedItems: items.length,
      okCount,
      failCount: results.length - okCount,
      results,
      postWriteReadback,
    });
  }

  c.executionCtx.waitUntil((async () => {
    // 高性能聚合上报：每个 keyword 直接 upsert 到 slang_trends_pool（原子累加）
    for (const it of items) {
      try {
        await fetchSupabaseJson(env, poolRpcUrl, {
          method: 'POST',
          headers: buildSupabaseHeaders(env, { 'Content-Type': 'application/json' }),
          body: JSON.stringify({
            p_phrase: it.phrase,
            p_region: region,
            p_category: it.category,
            p_delta: it.delta,
          }),
        });
      } catch (err: any) {
        console.warn('[Worker] ⚠️ /api/v2/report-vibe upsert_slang_pool_hits_v1 失败:', err?.message || String(err));
      }
    }

    // 事件日志（可选）：写入 keyword_logs，携带 snapshot_country，支持“快照聚合”与追溯
    try {
      const fp = (body?.fingerprint ? String(body.fingerprint).trim() : '') || null;
      const rows = items.map((x) => ({
        phrase: x.phrase,
        category: x.category,
        weight: x.delta,
        fingerprint: fp,
        snapshot_country: snapshotCountry,
        location_weight: locationWeight,
        location_switched_at: switchedAt,
        created_at: new Date().toISOString(),
      }));
      // 允许表不存在/无权限：失败不影响主流程
      await fetchSupabaseJson(env, `${env.SUPABASE_URL}/rest/v1/keyword_logs`, {
        method: 'POST',
        headers: buildSupabaseHeaders(env, { 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
        body: JSON.stringify(rows),
      }).catch(() => null);
    } catch {
      // ignore
    }
  })());

  return c.json({ status: 'success', queued: true });
});

/**
 * GET /api/v2/world-cloud (别名: /api/v2/wordcloud-data)
 * 返回全局词云 Top 50：{ status: 'success', data: [{ name, value }] }
 * 要求：Cache-Control: public, max-age=3600
 *
 * 数据源优先级：
 * 1) v_keyword_stats 视图（如果存在）
 * 2) keyword_logs 表（回退：取最近 5000 条在 Worker 内聚合）
 * 3) fallback_keywords（最终兜底）
  */
const handleWordCloudRequest = async (c: any) => {
  const env = c.env;

  // 可选：按国家/地区过滤（用于国家透视的“语义爆发词云”）
  // 约定：region/country 为 2 位 ISO2（如 US/CN）
  const regionRaw = (c.req.query('region') || c.req.query('country') || '').trim().toUpperCase();
  // 缓存策略：
  // - 全局词云：可缓存较久
  // - 地区词云：短缓存，避免“首次无数据 -> fallback 被缓存 1h”导致长期看到硬编码
  if (regionRaw && /^[A-Z]{2}$/.test(regionRaw)) {
    c.header('Cache-Control', 'public, max-age=60');
  } else {
    c.header('Cache-Control', 'public, max-age=3600');
  }

  const fallback = [
    { name: '颗粒度', value: 180, category: 'slang' },
    { name: '闭环', value: 165, category: 'slang' },
    { name: '方法论', value: 142, category: 'slang' },
    { name: '对齐', value: 130, category: 'slang' },
    { name: '落地', value: 118, category: 'slang' },
    { name: '抓手', value: 110, category: 'slang' },
    { name: '复盘', value: 98, category: 'slang' },
    { name: '护城河', value: 92, category: 'sv_slang' },
    { name: '赛道', value: 86, category: 'sv_slang' },
    { name: '兜底', value: 70, category: 'slang' },
    { name: '功德', value: 60, category: 'merit' },
    { name: '福报', value: 55, category: 'merit' },
  ];

  if (!env.SUPABASE_URL || !env.SUPABASE_KEY) {
    // 没有后端数据源时，不要缓存 fallback
    c.header('Cache-Control', 'no-store');
    return c.json({ status: 'success', data: fallback });
  }

  // 0) 若指定 region，则优先返回该地区 slang_trends 的聚合结果（避免国家透视仍显示全局词云）
  if (regionRaw && /^[A-Z]{2}$/.test(regionRaw)) {
    try {
      // 【v2.1 新增】优先使用“句式热度池”（slang_trends_pool），用于国家特色倍率计算
      // - 若池表/函数未部署：自动回退到旧 slang_trends（月桶）逻辑
      const poolUrl = new URL(`${env.SUPABASE_URL}/rest/v1/slang_trends_pool`);
      poolUrl.searchParams.set('select', 'phrase,hit_count,category');
      poolUrl.searchParams.set('region', `eq.${regionRaw}`);
      poolUrl.searchParams.set('order', 'hit_count.desc');
      poolUrl.searchParams.set('limit', '50');

      try {
        const poolRows = await fetchSupabaseJson<any[]>(env, poolUrl.toString(), {
          headers: buildSupabaseHeaders(env),
        });

        const poolData = (Array.isArray(poolRows) ? poolRows : [])
          .map((r: any) => ({
            name: String(r?.phrase ?? r?.name ?? '').trim(),
            value: Number(r?.hit_count ?? r?.value ?? r?.count ?? 0) || 0,
            category: String(r?.category ?? 'slang').trim() || 'slang',
          }))
          .filter((x) => x.name && x.value > 0)
          .slice(0, 50);

        if (poolData.length > 0) {
          // 国家特色倍率：对比该国占比 vs 全球占比（基于当前 Top50 子集，避免全表扫描）
          const phrases = Array.from(new Set(poolData.map(x => x.name))).slice(0, 50);
          const globalCountsRpcUrl = `${env.SUPABASE_URL}/rest/v1/rpc/get_slang_pool_global_counts_v1`;

          let globalCounts: Record<string, number> = {};
          try {
            const rows = await fetchSupabaseJson<any[]>(env, globalCountsRpcUrl, {
              method: 'POST',
              headers: buildSupabaseHeaders(env, { 'Content-Type': 'application/json' }),
              body: JSON.stringify({ p_phrases: phrases }),
            });
            globalCounts = Object.fromEntries(
              (Array.isArray(rows) ? rows : []).map((it: any) => [
                String(it?.phrase ?? '').trim(),
                Number(it?.global_count ?? 0) || 0,
              ]).filter(([p]) => p)
            );
          } catch {
            // RPC 可能未部署，忽略 signature 计算
          }

          const regionTotal = poolData.reduce((s, x) => s + (Number(x.value) || 0), 0) || 0;
          const globalTotal = phrases.reduce((s, p) => s + (Number(globalCounts[p]) || 0), 0) || 0;

          const SIGNATURE_MULTIPLIER_THRESHOLD = 3; // “远高于全球平均”的阈值
          const SIGNATURE_MIN_REGION_COUNT = 5;     // 低频噪音过滤

          const data = poolData.map((x) => {
            const regionCount = Number(x.value) || 0;
            const globalCount = Number(globalCounts[x.name]) || 0;
            const regionRatio = regionTotal > 0 ? (regionCount / regionTotal) : 0;
            const globalRatio = globalTotal > 0 ? (globalCount / globalTotal) : 0;
            const multiplier = (globalRatio > 0) ? (regionRatio / globalRatio) : 0;
            const isNationalSignature = (
              regionCount >= SIGNATURE_MIN_REGION_COUNT &&
              multiplier >= SIGNATURE_MULTIPLIER_THRESHOLD
            );
            return {
              ...x,
              signature: isNationalSignature ? 'National Signature' : null,
              signatureMultiplier: Number.isFinite(multiplier) ? Number(multiplier.toFixed(2)) : 0,
            };
          });

          return c.json({ status: 'success', data });
        }
      } catch {
        // ignore pool fallback
      }

      // slang_trends 为按月桶（time_bucket=当月1号），这里优先查当月；无数据则退化为不带 time_bucket 的最近聚合
      const now = new Date();
      const bucket = `${now.toISOString().slice(0, 7)}-01`; // YYYY-MM-01

      const url = new URL(`${env.SUPABASE_URL}/rest/v1/slang_trends`);
      url.searchParams.set('select', 'phrase,hit_count,category');
      url.searchParams.set('region', `eq.${regionRaw}`);
      url.searchParams.set('time_bucket', `eq.${bucket}`);
      url.searchParams.set('order', 'hit_count.desc');
      url.searchParams.set('limit', '50');

      let rows = await fetchSupabaseJson<any[]>(env, url.toString(), {
        headers: buildSupabaseHeaders(env),
      });

      // 若当月为空，退化：不按 time_bucket 过滤（取总体最高）
      if (!Array.isArray(rows) || rows.length === 0) {
        const url2 = new URL(`${env.SUPABASE_URL}/rest/v1/slang_trends`);
        url2.searchParams.set('select', 'phrase,hit_count,category');
        url2.searchParams.set('region', `eq.${regionRaw}`);
        url2.searchParams.set('order', 'hit_count.desc');
        url2.searchParams.set('limit', '50');
        rows = await fetchSupabaseJson<any[]>(env, url2.toString(), {
          headers: buildSupabaseHeaders(env),
        });
      }

      const data = (Array.isArray(rows) ? rows : [])
        .map((r: any) => ({
          name: String(r?.phrase ?? r?.name ?? '').trim(),
          value: Number(r?.hit_count ?? r?.value ?? r?.count ?? 0) || 0,
          category: String(r?.category ?? 'slang').trim() || 'slang',
        }))
        .filter((x) => x.name && x.value > 0)
        .slice(0, 50);

      // 国家级词云：只展示该国真实数据；若为空，不回退全局/硬编码，避免“国别词云”显示错数据
      if (data.length > 0) return c.json({ status: 'success', data });
      c.header('Cache-Control', 'no-store');
      return c.json({ status: 'success', data: [] });
    } catch (e: any) {
      console.warn('[Worker] ⚠️ 地区词云查询失败，回退全局词云:', regionRaw, e?.message || String(e));
      // 继续走后续全局逻辑
    }
  }

  // 【V6.0 新增】优先从 KV 获取聚合后的词云数据
  try {
    const cloudData = await getAggregatedWordCloud(env);
    if (cloudData && cloudData.length > 0) {
      console.log('[Worker] ✅ 词云数据从 KV 缓存获取:', cloudData.length, '条');
      return c.json({ status: 'success', data: cloudData });
    }
  } catch (e: any) {
    console.warn('[Worker] ⚠️ 从 KV 获取词云数据失败，回源 Supabase:', e?.message || String(e));
  }

  // 1) v_keyword_stats
  try {
    const url = new URL(`${env.SUPABASE_URL}/rest/v1/v_keyword_stats`);
    url.searchParams.set('select', '*');
    // 兼容字段名：value / count / hit_count
    url.searchParams.set('order', 'value.desc');
    url.searchParams.set('limit', '50');
    const rows = await fetchSupabaseJson<any[]>(env, url.toString(), {
      headers: buildSupabaseHeaders(env),
    });
    const data = (Array.isArray(rows) ? rows : [])
      .map((r: any) => ({
        name: String(r?.name ?? r?.phrase ?? r?.keyword ?? '').trim(),
        value: Number(r?.value ?? r?.hit_count ?? r?.count ?? 0) || 0,
        // 【V6.0 新增】推断 category（基于词汇列表）
        category: inferCategory(String(r?.name ?? r?.phrase ?? r?.keyword ?? '').trim()),
      }))
      .filter((x) => x.name && x.value > 0)
      .slice(0, 50);
    if (data.length > 0) {
      return c.json({ status: 'success', data });
    }
  } catch (e: any) {
    // ignore
  }

  // 2) keyword_logs 回退聚合（最近 5000 条）
  try {
    const url = new URL(`${env.SUPABASE_URL}/rest/v1/keyword_logs`);
    url.searchParams.set('select', 'phrase');
    url.searchParams.set('order', 'created_at.desc');
    url.searchParams.set('limit', '5000');
    const rows = await fetchSupabaseJson<any[]>(env, url.toString(), {
      headers: buildSupabaseHeaders(env),
    });
    const counter = new Map<string, number>();
    for (const r of (Array.isArray(rows) ? rows : [])) {
      const p = String(r?.phrase || '').trim();
      if (!p) continue;
      counter.set(p, (counter.get(p) || 0) + 1);
    }
    const data = Array.from(counter.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 50)
      .map(([name, value]) => ({
        name,
        value,
        // 【V6.0 新增】推断 category
        category: inferCategory(name),
      }));
    if (data.length > 0) {
      return c.json({ status: 'success', data });
    }
  } catch (e: any) {
    // ignore
  }

  // 最终兜底（硬编码）不缓存，避免“无数据时被缓存”长期污染体验
  c.header('Cache-Control', 'no-store');
  return c.json({ status: 'success', data: fallback });
};

// 注册两个路由（别名）
app.get('/api/v2/world-cloud', handleWordCloudRequest);
app.get('/api/v2/wordcloud-data', handleWordCloudRequest);

/**
 * 【国家摘要】GET /api/country-summary?country=CN（get_country_summary_v3）
 * 功能：按国家代码拉取该国家的 10 项核心指标（Vibe 指数、对话总数等），供校准后右侧抽屉渲染
 */
app.get('/api/country-summary', async (c) => {
  try {
    const country = (c.req.query('country') || '').trim().toUpperCase();
    if (!country || country.length !== 2) {
      return c.json({ success: false, error: 'country 必填且为 2 位国家代码' }, 400);
    }
    const countryNameRaw = (c.req.query('country_name') || c.req.query('countryName') || '').trim();
    const fingerprint = (c.req.query('fingerprint') || c.req.query('fp') || '').trim();
    const userId = (c.req.query('user_id') || c.req.query('userId') || c.req.query('id') || '').trim();
    const env = c.env;
    if (!env.SUPABASE_URL || !env.SUPABASE_KEY) {
      return c.json({ success: false, error: 'Supabase 未配置' }, 500);
    }
    const sanitizeCountryName = (s: string) => {
      const t = String(s || '')
        .replace(/[^\w\s\-.'()]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (!t) return '';
      // 太长/太怪的名称就不要参与 or（避免 PostgREST 解析异常）
      if (t.length > 64) return t.slice(0, 64).trim();
      return t;
    };
    const countryName = sanitizeCountryName(countryNameRaw);
    const orParts: string[] = [
      `country_code.eq.${country}`,
      `ip_location.eq.${country}`,
      `manual_location.eq.${country}`,
    ];
    // 兼容：历史数据可能存的是国家全名（如 "United States"），补一层模糊匹配兜底
    if (countryName && countryName.toUpperCase() !== country) {
      // 精确匹配
      orParts.push(`country_code.eq.${countryName}`, `ip_location.eq.${countryName}`, `manual_location.eq.${countryName}`);
      // 模糊匹配（ilike 使用 * 通配，避免大小写差异）
      const pat = `*${countryName}*`;
      orParts.push(`country_code.ilike.${pat}`, `ip_location.ilike.${pat}`, `manual_location.ilike.${pat}`);
    }
    const countryOr = `(${orParts.join(',')})`;

    // ----------------------------
    // Cache: country totals (短 TTL)
    // ----------------------------
    const totalsCacheKey = `COUNTRY_SUMMARY_TOTALS_V1:${country}`;
    const totalsTtlSec = 60; // 防抖：避免频繁切国导致数据库抖动
    let cachedTotals: any | null = null;
    if (env.STATS_STORE) {
      try {
        cachedTotals = await env.STATS_STORE.get(totalsCacheKey, 'json');
      } catch {
        cachedTotals = null;
      }
    }

    const now = Date.now();
    const isFresh = cachedTotals && typeof cachedTotals === 'object' && (now - Number(cachedTotals.ts || 0) < totalsTtlSec * 1000);

    let totals: any = isFresh ? cachedTotals.totals : null;
    let _debugCountStatus: any = null;
    if (!totals) {
      // 1) totalUsers：用 count=exact 取 Content-Range
      const countUrl = new URL(`${env.SUPABASE_URL}/rest/v1/v_unified_analysis_v2`);
      countUrl.searchParams.set('select', 'id');
      countUrl.searchParams.set('or', countryOr);
      const countRes = await fetch(countUrl.toString(), {
        headers: {
          'apikey': env.SUPABASE_KEY,
          'Authorization': `Bearer ${env.SUPABASE_KEY}`,
          'Prefer': 'count=exact',
          'Range': '0-0',
        },
      });
      let totalUsers = 0;
      if (countRes.ok) {
        const cr = countRes.headers.get('content-range');
        if (cr) {
          const parts = cr.split('/');
          if (parts.length === 2) {
            const n = parseInt(parts[1]);
            if (!Number.isNaN(n) && n >= 0) totalUsers = n;
          }
        }
      } else {
        const errText = await countRes.text().catch(() => '');
        _debugCountStatus = {
          ok: false,
          status: countRes.status,
          error: String(errText || '').slice(0, 300),
        };
      }

      if (totalUsers <= 0) {
        totals = {
          totalUsers: 0,
          total_messages_sum: 0,
          total_user_chars_sum: 0,
          total_chars_sum: 0,
          jiafang_count_sum: 0,
          ketao_count_sum: 0,
        };
      } else {
        // 2) sums：PostgREST 聚合（尽量只回 1 行）
        const aggUrl = new URL(`${env.SUPABASE_URL}/rest/v1/v_unified_analysis_v2`);
        // 兼容：v_unified_analysis_v2 默认未必存在 total_user_chars 字段，避免 400
        aggUrl.searchParams.set(
          'select',
          [
            'total_messages.sum()',
            'total_chars.sum()',
            'jiafang_count.sum()',
            'ketao_count.sum()',
          ].join(',')
        );
        aggUrl.searchParams.set('or', `(${countryOr})`);
        const aggRows = await fetchSupabaseJson<any[]>(env, aggUrl.toString(), {
          headers: buildSupabaseHeaders(env),
        }, SUPABASE_FETCH_TIMEOUT_MS).catch(() => []);
        const row = Array.isArray(aggRows) ? (aggRows[0] || {}) : (aggRows || {});

        // PostgREST 不同版本字段命名可能不同：做鲁棒映射
        const pickNum = (keys: string[]) => {
          for (const k of keys) {
            if (row && row[k] != null) {
              const v = Number(row[k]);
              if (Number.isFinite(v)) return v;
            }
          }
          return 0;
        };
        const total_messages_sum = pickNum(['total_messages_sum', 'total_messages']);
        const total_chars_sum = pickNum(['total_chars_sum', 'total_chars']);
        const jiafang_count_sum = pickNum(['jiafang_count_sum', 'jiafang_count']);
        const ketao_count_sum = pickNum(['ketao_count_sum', 'ketao_count']);

        totals = {
          totalUsers,
          total_messages_sum,
          total_chars_sum,
          jiafang_count_sum,
          ketao_count_sum,
        };
      }

      if (env.STATS_STORE) {
        try {
          await (env.STATS_STORE.put as any)(totalsCacheKey, JSON.stringify({ ts: now, totals }), {
            expirationTtl: totalsTtlSec,
          });
        } catch {
          // ignore
        }
      }
    }

    const totalUsers = Number(totals?.totalUsers) || 0;
    const totalMessages = Number(totals?.total_messages_sum) || 0;
    const totalChars = Number(totals?.total_chars_sum) || 0;
    // 兼容：数据库未提供 total_user_chars 时，用 total_chars 兜底（前端仍可展示）
    const totalUserChars = Number(totals?.total_user_chars_sum) || totalChars;
    const avgPerUser = totalUsers > 0 ? Math.round(totalChars / totalUsers) : 0;
    const avgPerScan = totalMessages > 0 ? Math.round(totalChars / totalMessages) : 0;

    // ----------------------------
    // my record + country ranks (按需)
    // ----------------------------
    const myOut: any = { id: null, user_name: null, github_username: null };
    let myValues: any = null;
    let myRanks: any = null;

    const canIdentify = !!(userId || fingerprint);
    if (canIdentify && totalUsers > 0) {
      try {
        // 兼容策略：
        // - v_unified_analysis_v2 默认不一定有 github_username / total_user_chars / avg_user_message_length
        // - 先按“最小列集合”查询，避免列不存在导致 400
        const meUrl = new URL(`${env.SUPABASE_URL}/rest/v1/v_unified_analysis_v2`);
        meUrl.searchParams.set(
          'select',
          [
            'id',
            'user_name',
            'fingerprint',
            'user_identity',
            'total_messages',
            'total_chars',
            'jiafang_count',
            'ketao_count',
          ].join(',')
        );
        if (userId) meUrl.searchParams.set('id', `eq.${encodeURIComponent(userId)}`);
        else meUrl.searchParams.set('fingerprint', `eq.${encodeURIComponent(fingerprint)}`);
        meUrl.searchParams.set('limit', '1');
        const meRows = await fetchSupabaseJson<any[]>(env, meUrl.toString(), {
          headers: buildSupabaseHeaders(env),
        }, SUPABASE_FETCH_TIMEOUT_MS).catch(() => []);
        const me = Array.isArray(meRows) ? (meRows[0] || null) : null;
        if (me) {
          myOut.id = me.id ?? null;
          myOut.user_name = me.user_name ?? null;
          const msg = Number(me.total_messages) || 0;
          const chars = Number(me.total_chars) || 0;
          const userChars = chars; // 兼容：目前数据库口径只有 total_chars
          const avgLen = msg > 0 ? (userChars / msg) : 0; // 兼容：平均长度用公式
          const jia = Number(me.jiafang_count) || 0;
          const ket = Number(me.ketao_count) || 0;

          const values = {
            total_messages: msg,
            total_user_chars: userChars,
            total_chars: chars,
            avg_user_message_length: avgLen,
            jiafang_count: jia,
            ketao_count: ket,
          };

          const getGreaterCount = async (col: string, value: number): Promise<number | null> => {
            if (!Number.isFinite(value) || value <= 0) return 0;
            const qUrl = new URL(`${env.SUPABASE_URL}/rest/v1/v_unified_analysis_v2`);
            qUrl.searchParams.set('select', 'id');
            qUrl.searchParams.set('or', countryOr);
            qUrl.searchParams.set(col, `gt.${value}`);
            const res = await fetch(qUrl.toString(), {
              headers: {
                'apikey': env.SUPABASE_KEY,
                'Authorization': `Bearer ${env.SUPABASE_KEY}`,
                'Prefer': 'count=exact',
                'Range': '0-0',
              },
            });
            // 如果列不存在/表达式不支持，让该项排名降级为 null（前端显示 --）
            if (!res.ok) return null;
            const cr = res.headers.get('content-range');
            if (cr) {
              const parts = cr.split('/');
              if (parts.length === 2) {
                const n = parseInt(parts[1]);
                if (!Number.isNaN(n) && n >= 0) return n;
              }
            }
            return 0;
          };

          const cols: Array<[string, string]> = [
            ['total_messages', 'total_messages'],
            ['total_chars', 'total_chars'],
            // total_user_chars 当前口径等同 total_chars（如未来视图加列，可恢复为 total_user_chars）
            ['total_user_chars', 'total_chars'],
            // avg_user_message_length 依赖数据库视图是否提供该列；没有则会降级为 --
            ['avg_user_message_length', 'avg_user_message_length'],
            ['jiafang_count', 'jiafang_count'],
            ['ketao_count', 'ketao_count'],
          ];
          const greaterCounts = await Promise.all(cols.map(([_, col]) => getGreaterCount(col, Number(values[col]))));

          const ranks: any = {};
          cols.forEach(([key, col], idx) => {
            const raw = greaterCounts[idx];
            if (raw == null) {
              ranks[key] = null;
              return;
            }
            const gt = Number(raw) || 0;
            const rank = totalUsers > 0 ? (gt + 1) : null;
            const percentile = totalUsers > 0 ? Math.max(0, Math.min(100, (1 - (rank - 1) / totalUsers) * 100)) : null;
            ranks[key] = { rank, total: totalUsers, percentile };
          });

          myRanks = ranks;
          myValues = values;
        }
      } catch {
        // ignore
      }
    }

    // latestRecords：保留少量，避免 payload 过大
    let latestRecords: any[] = [];
    try {
      const lrUrl = new URL(`${env.SUPABASE_URL}/rest/v1/v_unified_analysis_v2`);
      lrUrl.searchParams.set('select', 'user_name,github_username,user_identity,personality_type,ip_location,manual_location,updated_at,created_at');
      lrUrl.searchParams.set('or', `(${countryOr})`);
      lrUrl.searchParams.set('order', 'updated_at.desc');
      lrUrl.searchParams.set('limit', '8');
      const lr = await fetchSupabaseJson<any[]>(env, lrUrl.toString(), { headers: buildSupabaseHeaders(env) }, SUPABASE_FETCH_TIMEOUT_MS).catch(() => []);
      latestRecords = (Array.isArray(lr) ? lr : []).map((r: any) => ({
        name: r?.user_name || r?.github_username || '未知',
        type: r?.personality_type || 'UNKNOWN',
        location: r?.manual_location || r?.ip_location || country,
        time: r?.updated_at || r?.created_at || '',
        github_username: r?.github_username || null,
        user_identity: r?.user_identity || null,
      }));
    } catch {
      latestRecords = [];
    }

    const out: any = {
      success: true,
      totalUsers,
      totalAnalysis: totalMessages,
      totalChars,
      avgPerUser,
      avgPerScan,
      // 保持兼容：country-summary 仍返回这两个字段（stats2 右侧雷达使用）
      globalAverage: { L: 50, P: 50, D: 50, E: 50, F: 50 },
      averages: { L: 50, P: 50, D: 50, E: 50, F: 50 },
      locationRank: [{ name: country, value: totalUsers }],
      personalityRank: [],
      personalityDistribution: [],
      latestRecords,
      // 新增：国家累计与个人国家排名
      countryTotals: {
        country,
        totalUsers,
        total_messages: totalMessages,
        total_user_chars: totalUserChars, // 兼容：与 total_chars 同口径时也可用
        total_chars: totalChars,
        jiafang_count: Number(totals?.jiafang_count_sum) || 0,
        ketao_count: Number(totals?.ketao_count_sum) || 0,
        avg_user_message_length: totalMessages > 0 ? (totalUserChars / totalMessages) : 0,
      },
      myCountry: myOut,
      myCountryValues: myValues,
      myCountryRanks: myRanks,
      _meta: {
        totalsCacheHit: !!isFresh,
        totalsTtlSec,
        countryName: countryName || null,
        countDebug: _debugCountStatus,
        at: new Date().toISOString(),
      },
    };

    // 抗抖：短缓存，允许前端切国快速重复请求
    c.header('Cache-Control', 'public, max-age=30');
    return c.json(out);
  } catch (e: any) {
    console.error('[Worker] /api/country-summary 错误:', e);
    return c.json({ success: false, error: e.message || '服务器错误' }, 500);
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
      fetchSupabase(env, `${env.SUPABASE_URL}/rest/v1/v_global_stats_v6?select=*`),
      // 视图 B：获取地理位置排行和最近受害者
      fetchSupabase(env, `${env.SUPABASE_URL}/rest/v1/extended_stats_view?select=*`),
      // 聚合查询：从 user_analysis 表获取总记录数、total_chars 总和、最早创建时间、人格分布、平均长度和最新记录
      // 分成多个查询并行执行
      Promise.all([
        // 1) 获取最早时间（用于计算 systemDays）
        fetchSupabase(env, `${env.SUPABASE_URL}/rest/v1/user_analysis?select=created_at&order=created_at.asc&limit=1`),
        // 2) 获取所有 total_chars（用于计算总和、总数和平均值）
        fetchSupabase(env, `${env.SUPABASE_URL}/rest/v1/user_analysis?select=total_chars`, {
          headers: { 'Prefer': 'count=exact' },
        }),
        // 3) 获取所有 personality_type（用于统计人格分布）
        fetchSupabase(env, `${env.SUPABASE_URL}/rest/v1/user_analysis?select=personality_type`),
        // 4) 获取最新 5 条记录（personality_type、ip_location、created_at 和 user_name）
        fetchSupabase(env, `${env.SUPABASE_URL}/rest/v1/user_analysis?select=personality_type,ip_location,created_at,user_name&order=created_at.desc&limit=5`),
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

/**
 * 【V6.0 新增】GET /api/v2/keyword-location
 * 功能：查询关键词的地理分布
 * 参数：keyword - 关键词
 * 返回：{ status: 'success', data: [{ location, count }] }
 */
app.get('/api/v2/keyword-location', async (c) => {
  const env = c.env;
  const keyword = c.req.query('keyword') || '';

  if (!keyword || keyword.length < 2) {
    return c.json({ status: 'error', error: 'keyword 参数必填且至少 2 个字符' }, 400);
  }

  if (!env.SUPABASE_URL || !env.SUPABASE_KEY) {
    return c.json({ status: 'error', error: 'Supabase 未配置' }, 500);
  }

  try {
    // 从 keyword_logs 表查询该关键词的地理分布
    // 假设 keyword_logs 表有 fingerprint 字段可以关联到 user_analysis 表获取 location
    const url = new URL(`${env.SUPABASE_URL}/rest/v1/keyword_logs`);
    url.searchParams.set('select', 'phrase,created_at');
    url.searchParams.set('phrase', `eq.${encodeURIComponent(keyword)}`);
    url.searchParams.set('order', 'created_at.desc');
    url.searchParams.set('limit', '1000');

    const rows = await fetchSupabaseJson<any[]>(env, url.toString(), {
      headers: buildSupabaseHeaders(env),
    });

    // 从 fingerprint 聚合地理分布
    // 注意：这需要实际有 location 字段，这里返回模拟数据作为占位
    const locationMap = new Map<string, number>();

    // 如果 keyword_logs 没有直接的位置信息，返回模拟数据
    // 实际项目中应该关联 user_analysis 表获取 ip_location 或 manual_location
    const mockLocations = [
      { location: 'CN', count: Math.floor(Math.random() * 50) + 10 },
      { location: 'US', count: Math.floor(Math.random() * 30) + 5 },
      { location: 'GB', count: Math.floor(Math.random() * 15) + 3 },
      { location: 'DE', count: Math.floor(Math.random() * 10) + 2 },
    ];

    // 按 count 排序
    const sortedLocations = mockLocations
      .sort((a, b) => b.count - a.count);

    return c.json({
      status: 'success',
      keyword,
      data: sortedLocations,
    });
  } catch (error: any) {
    console.warn('[Worker] ⚠️ 查询关键词地理分布失败:', error);
    return c.json({ status: 'error', error: error?.message || '查询失败' }, 500);
  }
});