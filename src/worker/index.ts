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
import { getIdentityWordSets, matchChatToIdentityKeywords, type IdentityWordBankLang } from './identityWordBanks';
import { createClient } from '@supabase/supabase-js';
import { syncGithubCombatStats } from './github-sync-service';

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

// 定义环境变量类型（与 wrangler.toml 一致：灵魂词使用 KV_VIBE_PROD）
export type Env = {
  SUPABASE_URL?: string;
  /** 服务端调用 Supabase 时使用，与 wrangler.toml [vars] 或 Secret 一致 */
  SUPABASE_KEY?: string;
  /** 可选：客户端/公开场景可用 ANON Key，服务端优先用 SUPABASE_KEY */
  SUPABASE_ANON_KEY?: string;
  /** GitHub 同步写 user_analysis 时强制使用 Service Role，绕过 RLS */
  SUPABASE_SERVICE_ROLE_KEY?: string;
  STATS_STORE?: KVNamespace; // KV 存储（国家汇总、全局统计等）
  CONTENT_STORE?: KVNamespace; // KV 存储（第三阶段：文案库）
  KV_VIBE_PROD?: KVNamespace; // 灵魂词上报与同步专用 KV（与 wrangler.toml binding 一致）
  prompts_library?: D1Database; // D1 数据库：答案之书
  GITHUB_TOKEN?: string; // 可选，用于 GitHub API 代理提升限流额度
};

async function refreshCountryStatsCurrent(env: Env): Promise<{ success: boolean; error?: string }> {
  try {
    if (!env.SUPABASE_URL || !env.SUPABASE_KEY) return { success: false, error: 'Supabase 未配置' };
    // RPC：public.refresh_country_stats_current()
    const rpcUrl = `${env.SUPABASE_URL}/rest/v1/rpc/refresh_country_stats_current`;
    await fetchSupabaseJson<any>(env, rpcUrl, {
      method: 'POST',
      headers: buildSupabaseHeaders(env, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({}),
    }, SUPABASE_FETCH_TIMEOUT_MS);
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message || String(e) };
  }
}

/** GitHub 天梯榜 Top50 每日巡检：调用 Edge Function 同步每用户数据（需 SUPABASE_KEY 为 Service Role） */
type GitHubLeaderboardRow = { id: string; rank: number; github_login: string; user_name: string | null; github_score: number };
async function dailyGitHubAudit(env: Env): Promise<void> {
  if (!env.SUPABASE_URL || !env.SUPABASE_KEY) {
    console.warn('[Worker] GitHub 巡检跳过：Supabase 未配置');
    return;
  }
  const rpcUrl = `${env.SUPABASE_URL}/rest/v1/rpc/get_github_leaderboard`;
  let list: GitHubLeaderboardRow[] = [];
  try {
    const raw = await fetchSupabaseJson<GitHubLeaderboardRow[]>(env, rpcUrl, {
      method: 'POST',
      headers: buildSupabaseHeaders(env, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ limit_count: 50 }),
    }, 15000);
    list = Array.isArray(raw) ? raw : [];
  } catch (e: any) {
    console.warn('[Worker] get_github_leaderboard 失败:', e?.message);
    return;
  }
  const funcUrl = `${env.SUPABASE_URL}/functions/v1/sync-github-stats`;
  const headers = buildSupabaseHeaders(env, { 'Content-Type': 'application/json' });
  let ok = 0;
  let fail = 0;
  for (const row of list) {
    try {
      const res = await fetch(funcUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({ userId: row.id }),
      });
      if (res.ok) ok++;
      else fail++;
    } catch (e: any) {
      fail++;
      console.warn('[Worker] sync-github-stats 单用户失败:', row.id, e?.message);
    }
    await new Promise((r) => setTimeout(r, 1100));
  }
  console.log('[Worker] GitHub Top50 巡检完成:', { ok, fail, total: list.length });
}

/** 从 KV payload 提取 data[countryCode] 形态，供前端 data[userCountry].ranks[dimensionKey] 使用 */
function buildCountryDataByCode(kv: GlobalCountryStatsPayload | null): Record<string, { ranks: Record<string, number>; [k: string]: any }> | undefined {
  if (!kv || typeof kv !== 'object') return undefined;
  const out: Record<string, any> = {};
  const reserved = new Set(['country_level', 'updated_at', '_meta']);
  for (const [k, v] of Object.entries(kv)) {
    if (reserved.has(k) || !v || typeof v !== 'object') continue;
    if (/^[A-Z]{2}$/.test(k)) out[k] = v;
  }
  return Object.keys(out).length ? out : undefined;
}

/** 从 KV 读取国家累积排行（冷数据）；无则返回 null，严禁在接口内做 GROUP BY */
async function getGlobalCountryStatsFromKV(env: Env): Promise<GlobalCountryStatsPayload | null> {
  if (!env.STATS_STORE) return null;
  try {
    const raw = await env.STATS_STORE.get(KV_KEY_GLOBAL_COUNTRY_STATS, 'json');
    if (!raw || typeof raw !== 'object') return null;
    const r = raw as any;
    if (!Array.isArray(r.country_level)) return null;
    return r as GlobalCountryStatsPayload;
  } catch {
    return null;
  }
}

/** 国家累积 KV 结构：country_level 为各国 6 维累积 + 全球排名；[countryCode] 为 byCountry 形态，含 ranks 对象 */
interface GlobalCountryStatsPayload {
  _meta?: { total_countries?: number; updated_at?: string };
  country_level: Array<{
    country_code: string;
    total_messages_sum?: number;
    total_chars_sum?: number;
    total_user_chars_sum?: number;
    jiafang_count_sum?: number;
    ketao_count_sum?: number;
    work_days_sum?: number;
    avg_user_message_length_sum?: number;
    total_users?: number;
    rank_total_messages?: number;
    rank_total_chars?: number;
    rank_total_user_chars?: number;
    rank_jiafang?: number;
    rank_ketao?: number;
    rank_avg_len?: number;
    rank_work_days?: number;
    total_countries?: number;
    no_competition?: boolean; // 人数极少时标注“该地区暂无竞争”
  }>;
  updated_at?: string;
}

/** 窗口函数 RPC：一次获取用户国家内/全球排名与总数，修复 1/1 */
async function getUserRankV2(
  env: Env,
  fingerprint: string | null,
  userId: string | null
): Promise<{ rank_in_country: number; total_in_country: number; rank_global: number; total_global: number; ip_location: string | null } | null> {
  if (!env.SUPABASE_URL || !env.SUPABASE_KEY) return null;
  if (!fingerprint && !userId) return null;
  try {
    const rpcUrl = `${env.SUPABASE_URL}/rest/v1/rpc/get_user_rank_v2`;
    const body: { p_fingerprint?: string; p_user_id?: string } = {};
    if (userId) body.p_user_id = userId;
    if (fingerprint) body.p_fingerprint = fingerprint;
    const rows = await fetchSupabaseJson<any[]>(env, rpcUrl, {
      method: 'POST',
      headers: buildSupabaseHeaders(env, { 'Content-Type': 'application/json' }),
      body: JSON.stringify(body),
    }, SUPABASE_FETCH_TIMEOUT_MS);
    const row = Array.isArray(rows) ? rows[0] : rows;
    if (!row || row.rank_in_country == null) return null;
    return {
      rank_in_country: Number(row.rank_in_country) || 0,
      total_in_country: Number(row.total_in_country) || 0,
      rank_global: Number(row.rank_global) || 0,
      total_global: Number(row.total_global) || 0,
      ip_location: row.ip_location ?? null,
    };
  } catch (e: any) {
    console.warn('[Worker] get_user_rank_v2 RPC 失败:', e?.message);
    return null;
  }
}

/** 6 维度双排名 RPC：返回全球 + 本国排名（贝叶斯平滑）及 user_total_messages（置信度展示） */
async function getUserRanks6d(
  env: Env,
  fingerprint: string | null,
  userId: string | null
): Promise<{ ranks: Record<string, { rank_global: number; total_global: number; rank_country: number; total_country: number }>; user_total_messages?: number } | null> {
  if (!env.SUPABASE_URL || !env.SUPABASE_KEY) return null;
  if (!fingerprint && !userId) return null;
  try {
    const rpcUrl = `${env.SUPABASE_URL}/rest/v1/rpc/get_user_ranks_6d`;
    const body: { p_fingerprint?: string; p_user_id?: string } = {};
    if (userId) body.p_user_id = userId;
    if (fingerprint) body.p_fingerprint = fingerprint;
    const raw = await fetchSupabaseJson<any>(env, rpcUrl, {
      method: 'POST',
      headers: buildSupabaseHeaders(env, { 'Content-Type': 'application/json' }),
      body: JSON.stringify(body),
    }, SUPABASE_FETCH_TIMEOUT_MS);
    if (!raw || typeof raw !== 'object') return null;
    const DIMS = ['total_messages', 'total_chars', 'avg_user_message_length', 'jiafang_count', 'ketao_count', 'work_days'] as const;
    const out: Record<string, { rank_global: number; total_global: number; rank_country: number; total_country: number }> = {};
    for (const k of DIMS) {
      const v = raw[k];
      if (v && typeof v === 'object') {
        out[k] = {
          rank_global: Number(v.rank_global) || 0,
          total_global: Number(v.total_global) || 0,
          rank_country: Number(v.rank_country) || 0,
          total_country: Number(v.total_country) || 0,
        };
      }
    }
    const user_total_messages = raw.user_total_messages != null ? Number(raw.user_total_messages) : undefined;
    return Object.keys(out).length ? { ranks: out, user_total_messages } : null;
  } catch (e: any) {
    console.warn('[Worker] get_user_ranks_6d RPC 失败:', e?.message);
    return null;
  }
}

// KV 存储的键名
const KV_KEY_GLOBAL_AVERAGE = 'global_average';
const KV_KEY_LAST_UPDATE = 'global_average_last_update';
const KV_KEY_GLOBAL_AVERAGES = 'GLOBAL_AVERAGES'; // 大盘汇总数据键名
const KV_KEY_GLOBAL_STATS_CACHE = 'GLOBAL_STATS_CACHE'; // 完整统计数据缓存（原子性）
const KV_KEY_GLOBAL_STATS_V6 = 'GLOBAL_STATS_V6'; // V6 协议全局统计（用于动态排名）
const KV_KEY_GLOBAL_DASHBOARD_DATA = 'GLOBAL_DASHBOARD_DATA'; // 右侧抽屉：大盘数据缓存（v_global_stats_v6）
const KV_KEY_GLOBAL_COUNTRY_STATS = 'GLOBAL_COUNTRY_STATS'; // 国家维度累积排行（冷数据，仅定时任务写入，接口只读 KV）
const KV_CACHE_TTL = 3600; // 缓存有效期：1小时（秒）

// 右侧抽屉大盘缓存 TTL（秒）
const KV_GLOBAL_STATS_V6_VIEW_TTL = 300;

/**
 * 【止血】脏检查保护：仅当值发生变化时才执行 KV 写入，减少免费额度消耗
 */
async function secureKVPut(
  env: Env,
  key: string,
  newValue: string,
  ttl?: number
): Promise<void> {
  const kv = env.STATS_STORE;
  if (!kv) return;
  try {
    const oldValue = await kv.get(key, 'text');
    const newStr = String(newValue);
    if (oldValue !== null && oldValue === newStr) return;
    const opts = ttl != null ? { expirationTtl: ttl } : undefined;
    await kv.put(key, newStr, opts);
  } catch (e) {
    console.warn('[Worker] ⚠️ secureKVPut 失败:', key, e);
  }
}

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

/** 构建 Supabase 请求头：必须同时带 apikey 与 Authorization: Bearer，否则会报 No API key found */
function buildSupabaseHeaders(env: Env, extra?: Record<string, string>): Record<string, string> {
  const apikey = (env.SUPABASE_KEY || env.SUPABASE_ANON_KEY || '').trim();
  if (!apikey) {
    console.warn('[Worker] buildSupabaseHeaders: SUPABASE_KEY 与 SUPABASE_ANON_KEY 均为空，Supabase 请求可能报 No API key found');
  }
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
      await secureKVPut(env, KV_KEY_WORDCLOUD_BUFFER, JSON.stringify(initialBuffer), 86400);
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
    await secureKVPut(env, KV_KEY_WORDCLOUD_BUFFER, JSON.stringify(buffer), 86400);

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
      await secureKVPut(env, KV_KEY_WORDCLOUD_AGGREGATED, JSON.stringify(globalCloudData), 3600);
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
      await secureKVPut(env, KV_KEY_WORDCLOUD_AGGREGATED, JSON.stringify(cloudData), 3600);
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

/**
 * 写入去重：检查 user_analysis 在过去 N ms 内是否已有记录
 * - 优先按 fingerprint
 * - 若提供 claim_token，则在 fingerprint 未命中时再按 claim_token 检查
 *
 * 目的：防止前端重复触发/并发请求导致短时间内重复写库与副作用（排行榜重复、统计被重复累加等）。
 */
async function hasRecentUserAnalysisRecord(
  env: Env,
  params: { fingerprint?: string | null; claim_token?: string | null },
  withinMs = 10_000
): Promise<boolean> {
  if (!env.SUPABASE_URL || !env.SUPABASE_KEY) return false;

  const now = Date.now();
  const checkOne = async (kind: 'fingerprint' | 'claim_token', val: string) => {
    const v = String(val || '').trim();
    if (!v) return false;

    const url = new URL(`${env.SUPABASE_URL}/rest/v1/user_analysis`);
    url.searchParams.set('select', 'id,created_at,updated_at');
    url.searchParams.set(kind, `eq.${v}`);
    url.searchParams.set('order', 'updated_at.desc,created_at.desc');
    url.searchParams.set('limit', '1');

    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: buildSupabaseHeaders(env, { Prefer: 'return=representation' }),
    }).catch(() => null);
    if (!res || !res.ok) return false;

    const rows = await res.json().catch(() => null);
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row) return false;

    const tsRaw = row?.updated_at || row?.created_at || null;
    const ts = tsRaw ? Date.parse(String(tsRaw)) : NaN;
    if (!Number.isFinite(ts)) return false;

    return (now - ts) <= withinMs;
  };

  // 1) fingerprint 优先
  const fp = params.fingerprint != null ? String(params.fingerprint).trim() : '';
  if (fp) {
    const hit = await checkOne('fingerprint', fp);
    if (hit) return true;
  }

  // 2) claim_token 兜底
  const ct = params.claim_token != null ? String(params.claim_token).trim() : '';
  if (ct) {
    const hit = await checkOne('claim_token', ct);
    if (hit) return true;
  }

  return false;
}

/**
 * 5 秒短期幂等：用于阻止“同一用户短时间重复入库”
 * 规则（满足任一即视为重复）：
 * - claim_token 相同（优先）
 * - fingerprint 相同
 * - 同一 IP（ip_location）且 total_messages 相同（高度相似）
 *
 * 返回：最近一条记录（如果命中），否则 null
 */
async function getRecentDuplicateUserAnalysis(
  env: Env,
  params: { claim_token?: string | null; fingerprint?: string | null; ip_location?: string | null; total_messages?: number | null },
  withinMs = 5_000
): Promise<any | null> {
  if (!env.SUPABASE_URL || !env.SUPABASE_KEY) return null;

  const sinceIso = new Date(Date.now() - withinMs).toISOString();
  const tryFetch = async (url: URL) => {
    try {
      const res = await fetch(url.toString(), {
        method: 'GET',
        headers: buildSupabaseHeaders(env, { Prefer: 'return=representation' }),
      });
      if (!res.ok) return null;
      const rows = await res.json().catch(() => null);
      return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
    } catch {
      return null;
    }
  };

  const claimToken = params.claim_token != null ? String(params.claim_token).trim() : '';
  if (claimToken) {
    const url = new URL(`${env.SUPABASE_URL}/rest/v1/user_analysis`);
    url.searchParams.set('select', '*');
    url.searchParams.set('claim_token', `eq.${claimToken}`);
    url.searchParams.set('updated_at', `gte.${sinceIso}`);
    url.searchParams.set('order', 'updated_at.desc,created_at.desc');
    url.searchParams.set('limit', '1');
    const row = await tryFetch(url);
    if (row) return row;
  }

  const fp = params.fingerprint != null ? String(params.fingerprint).trim() : '';
  if (fp) {
    const url = new URL(`${env.SUPABASE_URL}/rest/v1/user_analysis`);
    url.searchParams.set('select', '*');
    url.searchParams.set('fingerprint', `eq.${fp}`);
    url.searchParams.set('updated_at', `gte.${sinceIso}`);
    url.searchParams.set('order', 'updated_at.desc,created_at.desc');
    url.searchParams.set('limit', '1');
    const row = await tryFetch(url);
    if (row) return row;
  }

  const ip = params.ip_location != null ? String(params.ip_location).trim() : '';
  const tm = params.total_messages != null ? Number(params.total_messages) : NaN;
  if (ip && Number.isFinite(tm) && tm > 0) {
    const url = new URL(`${env.SUPABASE_URL}/rest/v1/user_analysis`);
    url.searchParams.set('select', '*');
    url.searchParams.set('ip_location', `eq.${ip}`);
    url.searchParams.set('total_messages', `eq.${String(Math.floor(tm))}`);
    url.searchParams.set('updated_at', `gte.${sinceIso}`);
    url.searchParams.set('order', 'updated_at.desc,created_at.desc');
    url.searchParams.set('limit', '1');
    const row = await tryFetch(url);
    if (row) return row;
  }

  return null;
}

// 5 秒返回缓存（同一个 Worker 实例内）：直接复用上一次响应，彻底避免“双请求双写库”
const __analysisResponseCache: Map<string, { ts: number; payload: any }> =
  (globalThis as any).__analysisResponseCache ||
  (((globalThis as any).__analysisResponseCache = new Map()) as Map<string, { ts: number; payload: any }>);

// 创建 Hono 应用
const app = new Hono<{ Bindings: Env }>();

// CORS 配置（V6 协议：允许所有来源访问）
// 注意：这是一个公开的 API，允许所有域名访问以支持跨域请求
// 如果需要限制访问，可以取消注释下面的 ALLOWED_ORIGINS 配置
// 允许的来源（含 localhost:3000，供灵魂词等跨域上报）
const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
  'https://vibecodinger.com',
  'https://*.vibecodinger.com',
  'https://*.github.io', // 允许 GitHub Pages
  'https://*.github.com', // 允许 GitHub
  // 可以根据需要添加更多允许的域名
];

// 全局跨域：解决 CORS Error，通过浏览器 Preflight（OPTIONS）预检
// 使用 '*' 确保对所有路径（含 /api/v2/log-vibe-soul）生效，避免 localhost 跨域被拦
app.use('*', cors({
  origin: '*',
  allowMethods: ['POST', 'GET', 'OPTIONS', 'PUT', 'PATCH', 'DELETE', 'HEAD'],
  allowHeaders: ['Content-Type', 'X-Fingerprint', 'Cache-Control', 'Authorization', 'X-Requested-With', 'cache-control', 'x-fingerprint', 'x-intent', 'X-Intent', 'Accept'],
  exposeHeaders: ['Content-Length', 'Content-Type'],
  credentials: false,
  maxAge: 86400,
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

    // 【指纹统一】若 fingerprint 未上报，尝试从 meta.fingerprint 兜底补齐（避免出现“同一次流程 fingerprint 不一致”）
    try {
      const fpFromBody = body?.fingerprint ? String(body.fingerprint).trim() : '';
      const fpFromMeta = (body as any)?.meta?.fingerprint ? String((body as any).meta.fingerprint).trim() : '';
      if (!fpFromBody && fpFromMeta) {
        (body as any).fingerprint = fpFromMeta;
      }
    } catch {
      // ignore
    }

    // 【认领机制】如果请求包含 access_token，先调用 migrateFingerprintToUserId
    const authHeader = c.req.header('Authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const token = authHeader.substring(7);
        const parts = token.split('.');
        if (parts.length === 3) {
          const payload = JSON.parse(
            atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'))
          );
          const authenticatedUserId = payload.sub || null;
          
          if (authenticatedUserId && body.fingerprint) {
            const fingerprint = String(body.fingerprint).trim();
            if (fingerprint) {
              console.log('[Worker] 🔑 检测到 access_token，开始迁移 fingerprint 到 user_id...', {
                userId: authenticatedUserId.substring(0, 8) + '...',
                fingerprint: fingerprint.substring(0, 8) + '...',
              });
              
              // 调用迁移函数（基于 fingerprint 迁移，不需要 claim_token）
              const migrateResult = await migrateFingerprintToUserId(fingerprint, authenticatedUserId, undefined, env);
              if (migrateResult) {
                console.log('[Worker] ✅ Fingerprint 迁移成功');
              } else {
                console.log('[Worker] ℹ️ Fingerprint 迁移未执行（可能已迁移或无需迁移）');
              }
            }
          }
        }
      } catch (error: any) {
        console.warn('[Worker] ⚠️ 迁移 fingerprint 时出错（继续处理请求）:', error.message);
      }
    }

    // ==========================================================
    // 【5 秒短期幂等：响应缓存】（优先命中内存缓存，直接返回上一次结果）
    // 触发条件：claim_token / fingerprint / ip + totalMessages（高度相似）
    // ==========================================================
    const clientIP =
      c.req.header('CF-Connecting-IP') ||
      c.req.header('X-Forwarded-For') ||
      c.req.header('X-Real-IP') ||
      'anonymous';
    const fpKey = (body?.fingerprint ? String(body.fingerprint).trim() : '') || '';
    const ctKey = (body as any)?.claim_token ? String((body as any).claim_token).trim() : '';
    const tmKey =
      (body?.stats && (body.stats as any).totalMessages != null)
        ? Number((body.stats as any).totalMessages)
        : null;
    const cacheKey =
      (ctKey ? `ct:${ctKey}` : (fpKey ? `fp:${fpKey}` : (tmKey != null ? `ip:${clientIP}|tm:${Math.floor(Number(tmKey) || 0)}` : ''))) || '';
    if (cacheKey) {
      const hit = __analysisResponseCache.get(cacheKey);
      if (hit && (Date.now() - hit.ts) <= 5_000) {
        const cached = hit.payload;
        if (cached && typeof cached === 'object') {
          (cached as any)._dedup = { hit: true, source: 'memory_cache', within_ms: 5000 };
          return c.json(cached);
        }
      }
    }

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
    // work_days：优先客户端上报的真实上岗天数（earliestFileTime→now），其次聊天跨度，最后兜底 1
    let workDays = 1;
    const statsWorkDays =
      (body.stats as any)?.work_days ??
      (body.stats as any)?.usageDays ??
      (body.stats as any)?.usage_days ??
      (body.stats as any)?.days;
    if (statsWorkDays !== undefined && statsWorkDays !== null && Number(statsWorkDays) >= 1) {
      workDays = Math.max(1, Number(statsWorkDays));
    } else if (body.usageDays !== undefined || body.days !== undefined || body.workDays !== undefined) {
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

    // 【身份词云】若 stats.identityLevelCloud 存在 Architect/Senior 等高阶键，合并到 Professional，确保前端读 Professional 能拿到数据
    if (finalStats && finalStats.identityLevelCloud) {
      finalStats.identityLevelCloud = normalizeIdentityLevelCloudForFrontend(finalStats.identityLevelCloud);
    }

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

    // 【身份词库】提前计算匹配结果，供异步入库与 debug_info 使用（便于区分“没匹配到”与“存不进去”）
    const fullTextForIdentity = userMessages.map((m: any) => m.text || m.content || '').join('\n');
    const identityLang: IdentityWordBankLang = isMainlyEnglish(fullTextForIdentity) ? 'en' : 'zh';
    const identityMatches = matchChatToIdentityKeywords(fullTextForIdentity, identityLang);
    const wordSets = getIdentityWordSets(identityLang);
    (result as any).debug_info = {
      identity_match_count: identityMatches.length,
      identity_lang: identityLang,
      word_set_sizes: { novice: wordSets.novice.size, professional: wordSets.professional.size, architect: wordSets.architect.size },
    };

    // 【统一身份】响应中回传 vibe_user_id，供前端持久化到 localStorage
    const vibeUserIdFromRequest = (c.req.header('X-Vibe-User-Id') || (body as any)?.vibe_user_id)
      ? String((c.req.header('X-Vibe-User-Id') || (body as any)?.vibe_user_id || '')).trim()
      : null;
    if (vibeUserIdFromRequest) result.vibe_user_id = vibeUserIdFromRequest;

    // 【前置逻辑保护】执行任何数据库操作前确保 Supabase 已正确初始化，缺失时打明确日志
    const supabaseKey = (env.SUPABASE_KEY || env.SUPABASE_ANON_KEY || '').trim();
    if (!env.SUPABASE_URL || !supabaseKey) {
      if (!env.SUPABASE_URL) console.error('[API] /api/v2/analyze Supabase 未初始化：SUPABASE_URL 缺失');
      if (!supabaseKey) console.error('[API] /api/v2/analyze Supabase 未初始化：SUPABASE_KEY 与 SUPABASE_ANON_KEY 均未配置或为空');
    }
    // 【异步存储】使用 waitUntil 异步写入 Supabase
    if (env.SUPABASE_URL && supabaseKey) {
      try {
        const executionCtx = c.executionCtx;
        if (executionCtx && typeof executionCtx.waitUntil === 'function') {
          // 【统一身份】优先使用前端持久化的 vibe_user_id（Header X-Vibe-User-Id 或 body.vibe_user_id），再 fallback 到 Authorization
          const vibeUserIdHeader = c.req.header('X-Vibe-User-Id');
          const vibeUserIdBody = (body as any)?.vibe_user_id != null ? String((body as any).vibe_user_id).trim() : '';
          const vibeUserId = (vibeUserIdHeader && vibeUserIdHeader.trim()) || vibeUserIdBody || null;
          let authenticatedUserId: string | null = null;
          let useUserIdForUpsert = false;

          if (vibeUserId) {
            const existingByVibeId = await identifyUserByUserId(vibeUserId, env);
            if (existingByVibeId) {
              useUserIdForUpsert = true;
              authenticatedUserId = vibeUserId;
              console.log('[Worker] ✅ 使用前端 vibe_user_id 匹配已有用户，将更新该记录:', vibeUserId.substring(0, 8) + '...');
            } else {
              useUserIdForUpsert = true;
              authenticatedUserId = vibeUserId;
              console.log('[Worker] ℹ️ 前端 vibe_user_id 尚未在库，将按 id 执行 upsert（指纹合并）:', vibeUserId.substring(0, 8) + '...');
            }
          }

          // 【后端适配】无 vibe_user_id 时：Header 带 Authorization 则使用 Supabase Auth 的 user.id 作为主键 upsert；无 Token 则按 fingerprint upsert
          const authHeader = c.req.header('Authorization');
          if (!useUserIdForUpsert && authHeader && authHeader.startsWith('Bearer ')) {
            try {
              const token = authHeader.substring(7);
              // 从 JWT token 中提取 user_id（Supabase Auth 的 user.id 即 payload.sub）
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

          // 【身份优先级】无 vibe_user_id 且无 Authorization 时：若该 fingerprint 已关联 GitHub 用户，则复用该用户行，避免产生两条记录（github + 匿名）
          if (!useUserIdForUpsert) {
            const fp = (body.fingerprint != null && String(body.fingerprint).trim() !== '') ? String(body.fingerprint).trim() : '';
            if (fp) {
              try {
                const existingByFp = await identifyUserByFingerprint(fp, env);
                if (existingByFp && (existingByFp as any).user_identity === 'github') {
                  useUserIdForUpsert = true;
                  authenticatedUserId = (existingByFp as any).id ?? null;
                  if (authenticatedUserId) {
                    console.log('[Worker] ✅ 匿名请求的 fingerprint 已关联 GitHub 用户，将更新该用户行，忽略新建匿名记录:', authenticatedUserId.substring(0, 8) + '...');
                  }
                }
              } catch (_) { /* ignore */ }
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

          // 【增量更新 / 首次创建时间保护】查询已有记录，避免 work_days 被更小值覆盖
          // 【防污染】数据强度校验：若 db.total_messages > 本次上传量，严禁用弱数据覆盖核心统计字段
          // 【唯一键变更】始终基于 fingerprint 查询（fingerprint 是唯一主键）
          // 【三维灵魂绑定】同时拉取 identity_cloud、total_messages 用于深度合并与累加
          let existingWorkDays: number | null = null;
          let existingCreatedAt: string | null = null;
          let existingId: string | null = null;
          let existingIdentityCloud: Record<string, Array<{ word: string; count: number }>> | null = null;
          let existingTotalMessages: number | null = null;
          let existingTotalChars: number | null = null;
          let existingUserName: string | null = null;
          let existingStats: any = null;
          if (env.SUPABASE_URL && env.SUPABASE_KEY && fingerprint) {
            try {
              // 基于 fingerprint 查询已有记录（含 identity_cloud、total_messages、total_chars、user_name、stats 用于防污染与合并）
              const existingUrl = `${env.SUPABASE_URL}/rest/v1/user_analysis?select=id,work_days,created_at,stats,identity_cloud,total_messages,total_chars,user_name&fingerprint=eq.${encodeURIComponent(fingerprint)}&order=created_at.asc&limit=1`;
              const existingRows = await fetchSupabaseJson<any[]>(env, existingUrl, { headers: buildSupabaseHeaders(env) }, 5000);
              const arr = Array.isArray(existingRows) ? existingRows : (existingRows ? [existingRows] : []);
              const row = arr[0];
              if (row) {
                existingId = row.id || null;
                existingCreatedAt = row.created_at || null;
                if (row.total_messages != null) existingTotalMessages = Number(row.total_messages) || 0;
                if (row.total_chars != null) existingTotalChars = Number(row.total_chars) || 0;
                if (row.user_name != null && String(row.user_name).trim()) existingUserName = String(row.user_name).trim();
                if (row.stats != null && typeof row.stats === 'object') existingStats = row.stats;
                // 优先 identity_cloud 列，其次 stats.identityLevelCloud
                const rawCloud = row.identity_cloud ?? (row.stats && typeof row.stats === 'object' ? row.stats.identityLevelCloud : null);
                if (rawCloud && typeof rawCloud === 'object') {
                  const toArr = (x: any): Array<{ word: string; count: number; fingerprint?: string }> => {
                    if (!Array.isArray(x)) return [];
                    return x.map((item: any) => ({
                      word: String(item?.word ?? item?.phrase ?? '').trim(),
                      count: Number(item?.count ?? item?.weight ?? 0) || 0,
                      fingerprint: item?.fingerprint != null ? String(item.fingerprint).trim() : undefined,
                    })).filter((t: { word: string; count: number }) => t.word.length > 0);
                  };
                  existingIdentityCloud = {
                    Novice: toArr(rawCloud.Novice),
                    Professional: toArr(rawCloud.Professional),
                    Architect: toArr(rawCloud.Architect),
                  };
                }
                // 【数据一致性】同时检查独立字段和 JSONB 字段，取较大值
                const fromCol = row.work_days != null ? Number(row.work_days) : NaN;
                const fromStats = (row.stats && typeof row.stats === 'object' && row.stats.work_days != null) ? Number(row.stats.work_days) : NaN;
                const maxFromDb = Number.isFinite(fromCol) && Number.isFinite(fromStats) 
                  ? Math.max(fromCol, fromStats)
                  : (Number.isFinite(fromCol) ? fromCol : (Number.isFinite(fromStats) ? fromStats : null));
                existingWorkDays = maxFromDb;
                // 【兜底】当本次计算为 1 时，用最早 created_at 推算
                if (workDays === 1 && existingCreatedAt) {
                  const ms = Date.now() - new Date(existingCreatedAt).getTime();
                  const days = Math.floor(ms / 86400000);
                  if (days >= 1) {
                    workDays = Math.max(1, days);
                    basicAnalysis.day = workDays;
                    console.log('[Worker] ✅ work_days 兜底: 从最早记录推算', { earliest: existingCreatedAt, days, workDays });
                  }
                }
              }
            } catch (e) {
              console.warn('[Worker] work_days 已有记录查询失败:', (e as Error)?.message);
            }
          }
          // 【最大值保护】永不将 work_days 覆盖为更小值（增量更新 / 首次创建时间保护）
          const prevWorkDays = workDays;
          workDays = Math.max(existingWorkDays ?? 0, workDays);
          if (existingWorkDays != null && existingWorkDays > prevWorkDays) {
            basicAnalysis.day = workDays;
            console.log('[Worker] ✅ work_days 增量保护: 保留已有更大值', { existingWorkDays, computedWas: prevWorkDays, final: workDays });
          }
          
          // 【数据一致性】确保独立字段和 JSONB 字段的 work_days 值完全同步
          const finalWorkDays = workDays;

          // 【强制覆盖 / 最新快照】本次请求的 stats 与顶层统计字段（total_messages、total_chars 等）均以当前上传的本地解析结果为唯一来源，禁止与库中旧值累加；stats JSON 与外层字段保持绝对同步，供侧边栏直接读取（含 roast_text）。
          // 【V6 协议】构建完整的数据负载（包含 jsonb 字段存储完整 stats）
          // 核心：fingerprint 作为幂等 Upsert 的业务主键
          // 【V6 协议】使用 v6Stats 或从 finalStats 构建
          // 【数据一致性】确保 work_days 独立字段与 JSONB stats.work_days 完全同步
          const v6StatsForStorage: any = {
            ...(v6Stats || finalStats),
            // 【关键修复】确保 work_days、jiafang_count、ketao_count 被正确传递到 stats jsonb 字段
            // 使用 finalWorkDays 确保独立字段和 JSONB 字段完全同步
            work_days: finalWorkDays,
            jiafang_count: (v6Stats || finalStats)?.jiafang_count ?? jiafangCount ?? basicAnalysis.no ?? 0,
            ketao_count: (v6Stats || finalStats)?.ketao_count ?? ketaoCount ?? basicAnalysis.please ?? 0,
          };
          // 【增加采样深度】确保 stats.identityLevelCloud 为按维度的词汇+频率数组（前端已传则直接保留）
          if (body.stats && (body.stats as any).identityLevelCloud && typeof (body.stats as any).identityLevelCloud === 'object') {
            v6StatsForStorage.identityLevelCloud = (body.stats as any).identityLevelCloud;
          }
          // 【灵魂词组】identity_cloud 每项含 word, count, fingerprint；按 (word 小写, fingerprint) 合并并累加 count，入库保留首次拼写
          type IdentityCloudItem = { word: string; count: number; fingerprint?: string };
          const toWordCountFpArr = (x: any, fp: string): IdentityCloudItem[] => {
            if (!Array.isArray(x)) return [];
            return x.map((item: any) => ({
              word: String(item?.word ?? item?.phrase ?? '').trim(),
              count: Number(item?.count ?? item?.weight ?? 0) || 0,
              fingerprint: fp || undefined,
            })).filter((t: IdentityCloudItem) => t.word.length > 0);
          };
          const deepMergeIdentityCloud = (
            oldCloud: Record<string, Array<IdentityCloudItem>> | null,
            current: Record<string, Array<IdentityCloudItem>> | undefined,
            currentFingerprint: string
          ): Record<string, Array<IdentityCloudItem>> => {
            const levels = ['Novice', 'Professional', 'Architect'] as const;
            const out: Record<string, Array<IdentityCloudItem>> = { Novice: [], Professional: [], Architect: [] };
            for (const level of levels) {
              const map = new Map<string, IdentityCloudItem>();
              const mergeIn = (t: IdentityCloudItem) => {
                const key = `${t.word.toLowerCase()}|${t.fingerprint ?? '__legacy__'}`;
                const existing = map.get(key);
                if (existing) {
                  existing.count += t.count;
                } else {
                  map.set(key, { word: t.word, count: t.count, fingerprint: t.fingerprint });
                }
              };
              (oldCloud?.[level] ?? []).forEach(mergeIn);
              (current?.[level] ?? []).forEach(mergeIn);
              out[level] = Array.from(map.values()).sort((a, b) => b.count - a.count);
            }
            return out;
          };
          const currentSessionCloudRaw = v6StatsForStorage.identityLevelCloud && typeof v6StatsForStorage.identityLevelCloud === 'object'
            ? normalizeIdentityLevelCloudForFrontend(v6StatsForStorage.identityLevelCloud) as Record<string, Array<{ word: string; count: number }>>
            : undefined;
          const currentFp = String(fingerprint ?? (body.fingerprint && String(body.fingerprint).trim()) ?? '').trim();
          const currentSessionCloud: Record<string, Array<IdentityCloudItem>> | undefined = currentSessionCloudRaw
            ? {
                Novice: toWordCountFpArr(currentSessionCloudRaw.Novice, currentFp),
                Professional: toWordCountFpArr(currentSessionCloudRaw.Professional, currentFp),
                Architect: toWordCountFpArr(currentSessionCloudRaw.Architect, currentFp),
              }
            : undefined;
          const existingIdentityCloudTyped = existingIdentityCloud as Record<string, Array<IdentityCloudItem>> | null;
          const soulTotal = (currentSessionCloud?.Novice?.length ?? 0) + (currentSessionCloud?.Professional?.length ?? 0) + (currentSessionCloud?.Architect?.length ?? 0);
          const mergedIdentityCloud = (currentSessionCloud && soulTotal > 0 && soulTotal <= 3)
            ? currentSessionCloud
            : deepMergeIdentityCloud(existingIdentityCloudTyped, currentSessionCloud, currentFp);
          result.identity_cloud = mergedIdentityCloud;
          // 内存中保留一份供本请求内副作用（如 analysis_events）使用
          v6StatsForStorage.identityLevelCloud = mergedIdentityCloud;
          // 【写入 DB 时】从 stats 中剔除 identityLevelCloud，避免大对象挤在 stats 文本里难以查询；词云仅写入 identity_cloud 列
          const statsForDb = { ...v6StatsForStorage };
          delete statsForDb.identityLevelCloud;
          // 【霸天/脱发/新手 唯一代表词】存入 stats 供 personality_data / 前端按 key 使用
          if (body.representativeWords && typeof body.representativeWords === 'object') {
            statsForDb.representativeWords = body.representativeWords;
          }
          
          // 【调试日志】验证修复后的值
          console.log('[Worker] ✅ v6StatsForStorage 修复验证:', {
            work_days: v6StatsForStorage.work_days,
            jiafang_count: v6StatsForStorage.jiafang_count,
            ketao_count: v6StatsForStorage.ketao_count,
            source_workDays: workDays,
            source_jiafangCount: jiafangCount,
            source_ketaoCount: ketaoCount,
            basicAnalysis_day: basicAnalysis.day,
            basicAnalysis_no: basicAnalysis.no,
            basicAnalysis_please: basicAnalysis.please,
          });
          
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
            // 【唯一键变更】fingerprint 是唯一主键，如果记录已存在（fingerprint 匹配），则更新现有记录
            // 【禁止创建新行】如果 fingerprint 已存在，必须更新原行，不能创建新行
            // 如果用户已登录，更新现有记录的 user_id（基于 fingerprint 作为冲突键）
            ...(useUserIdForUpsert && authenticatedUserId ? { id: authenticatedUserId } : {}),
            // 如果已有记录存在 id，保留原有 id（避免主键冲突）
            ...(existingId && !useUserIdForUpsert ? { id: existingId } : {}),
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
            // 【数据一致性】work_days 独立字段与 JSONB stats.work_days 必须完全同步
            work_days: finalWorkDays,
            jiafang_count: v6StatsForStorage.jiafang_count || basicAnalysis.no || 0,
            ketao_count: v6StatsForStorage.ketao_count || basicAnalysis.please || 0,
            
            vibe_index: vibeIndex,
            // 【三维灵魂绑定】total_messages 持续累加：已有记录时 = 旧值 + 本次会话消息数；country_code 可更新为最新检测，但 total_messages 只增不减
            total_messages: existingTotalMessages != null
              ? existingTotalMessages + (v6StatsForStorage.totalMessages ?? basicAnalysis.totalMessages ?? 0)
              : (v6StatsForStorage.totalMessages ?? basicAnalysis.totalMessages ?? 0),
            total_chars: (v6StatsForStorage.totalChars ?? basicAnalysis.totalChars ?? 0),
            lpdef: lpdef,
            lang: body.lang || 'zh-CN',
            // 【必须更新】updated_at 写入当前时间，确保前端 refreshUserStats 能拉取到最新记录
            updated_at: new Date().toISOString(),
            // 【保护创建时间】禁止更新 created_at，让数据库保持原有值
            // 注意：不包含 created_at 字段，Supabase 的 upsert 不会更新已存在的 created_at
            
            // 【废话文学一致性】后端生成后直接入库，侧边栏只读存储的 roast_text，不再由前端推算
            roast_text: combinedRoastText || null,
            
            // 【V6 协议】stats 存入 jsonb 时不再包含 identityLevelCloud，词云仅存 identity_cloud 列便于查询
            // 【数据一致性】stats.work_days 与独立字段 work_days 完全同步
            stats: statsForDb,
            // 【三维灵魂绑定】词云从 stats.identityLevelCloud 提取后只写此列，结构 {"Novice": [{word,count}], "Professional": [...], "Architect": [...]}，deepMerge 已合并词频且 total_messages 累加
            identity_cloud: mergedIdentityCloud,
            
            // 【关键修复】添加 personality 对象，包含 detailedStats 与 answer_book（与 dimensions 等一并同步给 GitHub 用户/视图）
            // 数据格式：{ type, detailedStats, answer_book: { title, content, vibe_level } }
            personality: (() => {
              const base: Record<string, unknown> = {
                type: personalityType,
                detailedStats: detailedStats, // 包含 L, P, D, E, F 五个维度的详细统计数据
                answer_book: answerBook ?? null, // 答案之书，供 stats2 左侧抽屉「今日箴言」与 index 同步
              };
              if (body.personality && typeof body.personality === 'object' && (body.personality as any).vibe_lexicon) {
                base.vibe_lexicon = (body.personality as any).vibe_lexicon;
              }
              return base;
            })(),
            
            // 【新增】personality_data 字段：包含称号和随机吐槽的五个维度数组（JSONB）
            // 格式：Array<{ dimension, score, label, roast }>
            personality_data: detailedStats, // 直接使用 detailedStats 数组
          };

          // 【防污染】数据强度校验：若库中 total_messages 大于本次上传量，严禁用弱数据覆盖核心统计字段
          const incomingTotalMessages = Number(v6StatsForStorage?.totalMessages ?? basicAnalysis?.totalMessages ?? 0) || 0;
          const dbStrongerThanIncoming = existingTotalMessages != null && incomingTotalMessages >= 0 && existingTotalMessages > incomingTotalMessages;
          if (dbStrongerThanIncoming) {
            payload.total_messages = existingTotalMessages;
            if (existingTotalChars != null) payload.total_chars = existingTotalChars;
            if (existingWorkDays != null) payload.work_days = existingWorkDays;
            if (existingIdentityCloud != null) payload.identity_cloud = existingIdentityCloud;
            if (existingUserName != null) payload.user_name = existingUserName;
            if (existingStats != null) payload.stats = existingStats;
            console.log('[Worker] 🛡️ 防污染：库中数据更强，保留核心字段不覆盖', {
              db_total_messages: existingTotalMessages,
              incoming_total_messages: incomingTotalMessages,
              preserved_user_name: existingUserName ? existingUserName.substring(0, 12) + '...' : null,
            });
          }

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
          // 尝试从 Cloudflare 请求对象获取国家信息；若前端传入 ip_location（如身份校准 CN），则优先使用
          try {
            const bodyIpLocation = body.ip_location != null && /^[A-Za-z]{2}$/.test(String(body.ip_location).trim())
              ? String(body.ip_location).trim().toUpperCase()
              : null;
            if (bodyIpLocation) {
              payload.ip_location = bodyIpLocation;
            } else {
              const rawRequest = c.req.raw as any;
              if (rawRequest.cf && rawRequest.cf.country) {
                payload.ip_location = rawRequest.cf.country;
              } else {
                payload.ip_location = normalizedIpLocation;
              }
            }
          } catch (e) {
            payload.ip_location = normalizedIpLocation;
          }

          // 【地理位置一致性】确保 manual_location 与 ip_location 口径一致：无用户校准时用 ip_location（ISO2）补全
          const ipIso2 = payload.ip_location && /^[A-Za-z]{2}$/.test(String(payload.ip_location).trim())
            ? String(payload.ip_location).trim().toUpperCase()
            : null;
          if (ipIso2 && !payload.manual_location) {
            payload.manual_location = ipIso2;
          }

          // 【地理标识修复】自动从 Cloudflare 环境获取国家代码，修复存量数据 country_code 为 NULL 的问题
          // 优先级：手动指定 > Cloudflare cf.country > ip_location > 默认值
          let countryCodeForDb: string | null = null;
          try {
            // 1. 优先使用手动指定的 country_code
            if (body?.country_code && /^[A-Za-z]{2}$/.test(String(body.country_code).trim())) {
              countryCodeForDb = String(body.country_code).trim().toUpperCase();
            }
            // 2. 如果没有，尝试从 Cloudflare 环境获取
            else {
              const rawRequest = c.req.raw as any;
              if (rawRequest?.cf?.country && /^[A-Za-z]{2}$/.test(String(rawRequest.cf.country).trim())) {
                countryCodeForDb = String(rawRequest.cf.country).trim().toUpperCase();
              }
              // 3. 如果还没有，使用 ip_location（如果它是 ISO2 格式）
              else if (ipIso2) {
                countryCodeForDb = ipIso2;
              }
            }
          } catch (e) {
            // 忽略错误，继续使用 null
            console.warn('[Worker] 获取国家代码失败:', e);
          }
          // 设置 country_code 字段（如果获取到了有效的国家代码）
          if (countryCodeForDb) {
            payload.country_code = countryCodeForDb;
          }

          // 【身份词库】使用已提前计算好的 identityMatches（带 category），见上方 debug_info

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
          // 【原子更新 Upsert】已登录 GitHub 以 id（github_id）为唯一键更新，未登录以 fingerprint 为唯一键更新
          const conflictKey = useUserIdForUpsert && authenticatedUserId ? 'id' : 'fingerprint';
          const supabaseUrl = `${env.SUPABASE_URL}/rest/v1/user_analysis?on_conflict=${conflictKey}`;
          
          try {
            // 【5 秒短期幂等（数据库侧）】claim_token / fingerprint / ip+total_messages
            // - 命中则：直接跳过写库与所有副作用（避免重复入库/重复累加）
            // - 响应由上面的 5 秒内存缓存兜底复用（同实例）；
            //   跨实例情况下，至少保证不会重复写入。
            try {
              const dupRow = await getRecentDuplicateUserAnalysis(env, {
                claim_token: payload?.claim_token ?? (body as any)?.claim_token ?? null,
                fingerprint: payload?.fingerprint ?? null,
                ip_location: payload?.ip_location ?? null,
                total_messages: payload?.total_messages ?? null,
              }, 5_000);
              if (dupRow) {
                console.warn('[DB] 🛑 5 秒短期幂等命中（数据库侧），跳过写库与副作用:', {
                  conflictKey,
                  hasClaimToken: !!(payload?.claim_token ?? (body as any)?.claim_token),
                  fingerprint: String(payload?.fingerprint || '').slice(0, 8) + '...',
                  ip: String(payload?.ip_location || '').slice(0, 24),
                  total_messages: payload?.total_messages ?? null,
                });
                return;
              }
            } catch {
              // ignore -> fallback to existing checks
            }

            // 【10 秒去重】防止前端重复触发/并发请求导致短时间内重复写入与副作用
            // - 命中则直接跳过所有写库（user_analysis / analysis_events / 全局统计 / 词云），避免重复累加与排行榜异常
            const recentHit = await hasRecentUserAnalysisRecord(
              env,
              {
                fingerprint: payload?.fingerprint ?? null,
                claim_token: payload?.claim_token ?? null,
              },
              10_000
            );
            if (recentHit) {
              console.warn('[DB] 🛑 检测到 10 秒内重复上报，跳过写库与统计副作用:', {
                conflictKey,
                fingerprint: String(payload?.fingerprint || '').slice(0, 8) + '...',
                hasClaimToken: !!payload?.claim_token,
              });
              return;
            }

            const userRecordIdForSync = useUserIdForUpsert && authenticatedUserId ? authenticatedUserId : null;
            const githubTokenForSync = (body as any)?.github_access_token ?? (body as any)?.githubAccessToken ?? '';

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
              // 【V6 协议】增量更新 KV 全局统计（5% 采样，减少 KV 写入）
              (async () => {
                if (Math.random() >= 0.05) return;
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
              // 【身份词库】异步入库 keyword_logs：遍历命中关键词，RPC upsert_keyword_log_identity；参数名与 DB 一致：p_phrase, p_category, p_ip_location, p_fingerprint
              (async () => {
                if (!identityMatches.length) return;
                const ipLocation = (payload.ip_location && /^[A-Za-z]{2}$/.test(String(payload.ip_location).trim()))
                  ? String(payload.ip_location).trim().toUpperCase()
                  : (countryCodeForDb || '');
                const fp = (payload.fingerprint && String(payload.fingerprint).trim()) ? String(payload.fingerprint).trim() : null;
                const rpcUrl = `${env.SUPABASE_URL}/rest/v1/rpc/upsert_keyword_log_identity`;
                const headers = buildSupabaseHeaders(env, { 'Content-Type': 'application/json' });
                console.log('[Worker] [keyword_logs] 待入库词条数量:', identityMatches.length, '样本:', identityMatches.slice(0, 5).map(m => ({ phrase: m.phrase, category: m.category })));
                for (const { phrase, category } of identityMatches) {
                  try {
                    await fetchSupabaseJson(env, rpcUrl, {
                      method: 'POST',
                      headers,
                      body: JSON.stringify({
                        p_phrase: phrase,
                        p_category: category,
                        p_ip_location: ipLocation,
                        p_fingerprint: fp,
                      }),
                    });
                  } catch (err: any) {
                    console.warn('[Worker] [keyword_logs] RPC 单条写入失败:', { phrase, category, error: err?.message });
                  }
                }
                console.log('[Worker] ✅ keyword_logs 身份关键词写入完成:', { count: identityMatches.length, ip_location: ipLocation || '(空)' });
              })(),
            ]);
            } catch (dbErr: any) {
              console.warn('[API] /api/v2/analyze 数据库写入/副作用异常（不中断响应）:', dbErr?.message);
            }

            // 刷新触发：写入完成后异步调用 RPC 刷新视图
            executionCtx.waitUntil(refreshGlobalStatsV6Rpc(env));

            // 【接口优化】写入后查询 v_user_analysis_extended，将实时排名合并到返回结果；失败仅 warn，不抛错
            try {
              const viewSelect = `${env.SUPABASE_URL}/rest/v1/v_user_analysis_extended?select=jiafang_rank,ketao_rank,days_rank,country_code,vibe_rank,vibe_percentile`;
              const viewBy = useUserIdForUpsert && authenticatedUserId
                ? `id=eq.${encodeURIComponent(authenticatedUserId)}`
                : `fingerprint=eq.${encodeURIComponent(payload.fingerprint || '')}`;
              const viewUrl = `${viewSelect}&${viewBy}&limit=1`;
              const viewRes = await fetchSupabase(env, viewUrl, { headers: buildSupabaseHeaders(env) });
              if (viewRes.ok) {
                const viewData = await viewRes.json();
                const row = Array.isArray(viewData) ? viewData[0] : viewData;
                if (row && typeof row === 'object') {
                  if (row.jiafang_rank != null) result.jiafang_rank = Number(row.jiafang_rank);
                  if (row.ketao_rank != null) result.ketao_rank = Number(row.ketao_rank);
                  if (row.days_rank != null) result.days_rank = Number(row.days_rank);
                  if (row.country_code != null) result.country_code = String(row.country_code);
                  if (row.vibe_rank != null) result.vibe_rank = Number(row.vibe_rank);
                  if (row.vibe_percentile != null) result.vibe_percentile = Number(row.vibe_percentile);
                }
              }
            } catch (viewErr: any) {
              console.warn('[Worker] ⚠️ 查询 v_user_analysis_extended 失败（使用默认排名）:', viewErr?.message);
            }

            // 【确保 GitHub 同步触发】即便上方 RPC/DB 失败，也进入异步同步阶段；waitUntil 前打点
            if (githubTokenForSync && userRecordIdForSync && executionCtx && typeof executionCtx.waitUntil === 'function') {
              console.log('[API] 准备进入异步同步阶段，ID:', userRecordIdForSync);
              executionCtx.waitUntil(
                syncGithubCombatStats(githubTokenForSync, payload.user_name || '', env, {
                  id: userRecordIdForSync,
                  fingerprint: payload.fingerprint ?? undefined,
                }).catch((e: any) => console.warn('[API] GitHub 同步 waitUntil 失败:', e?.message))
              );
            }
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

    // 个人实时排名（窗口函数 RPC）：国家内/全球 rank 与 total，修复 1/1
    try {
      const authHeader = c.req.header('Authorization');
      let userId: string | null = null;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        try {
          const payload = JSON.parse(atob(authHeader.substring(7).split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
          userId = payload.sub || null;
        } catch (_) { /* ignore */ }
      }
      const fp = (body.fingerprint && String(body.fingerprint).trim()) ? String(body.fingerprint).trim() : null;
      if (fp || userId) {
        const [rankRow, ranks6d] = await Promise.all([
          getUserRankV2(c.env, fp, userId),
          getUserRanks6d(c.env, fp, userId),
        ]);
        if (rankRow) {
          result.rank_in_country = rankRow.rank_in_country;
          result.total_in_country = rankRow.total_in_country;
          result.rank_global = rankRow.rank_global;
          result.total_global = rankRow.total_global;
        }
        if (ranks6d) {
          result.global_user_ranks = {} as Record<string, { rank: number; total: number }>;
          result.country_user_ranks = {} as Record<string, { rank: number; total: number }>;
          const ranks = ranks6d.ranks;
          for (const [k, v] of Object.entries(ranks)) {
            const val = v as { rank_global: number; total_global: number; rank_country: number; total_country: number };
            result.global_user_ranks[k] = { rank: val.rank_global, total: val.total_global };
            result.country_user_ranks[k] = { rank: val.rank_country, total: val.total_country };
          }
          if (ranks6d.user_total_messages != null) {
            result.user_total_messages = ranks6d.user_total_messages;
          }
        }
      }
    } catch (_) { /* ignore */ }

    // 返回结果（不阻塞数据库写入）
    // 写入 5 秒缓存：防止前端重复触发导致出现第二次 /api/v2/analyze 调用与重复入库
    if (cacheKey) {
      try {
        __analysisResponseCache.set(cacheKey, { ts: Date.now(), payload: { ...result, _dedup: { hit: false, source: 'computed', within_ms: 5000 } } });
      } catch {
        // ignore
      }
    }
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

/** 国家码 -> 中文名（供 /api/v2/summary _meta.countryName 使用） */
const COUNTRY_CODE_TO_NAME: Record<string, string> = {
  CN: '中国', US: '美国', JP: '日本', KR: '韩国', GB: '英国', DE: '德国', FR: '法国',
  IN: '印度', SG: '新加坡', AU: '澳大利亚', CA: '加拿大', RU: '俄罗斯', BR: '巴西',
};

const IDENTITY_CATEGORIES = ['Novice', 'Professional', 'Architect'] as const;

/** 将任意 vibe_lexicon 形状规范为 { Novice, Professional, Architect }，供右侧抽屉按身份 Tab 展示 */
function normalizeVibeLexiconToIdentity(raw: any): { Novice: any[]; Professional: any[]; Architect: any[] } {
  const empty: any[] = [];
  if (!raw || typeof raw !== 'object') {
    return { Novice: empty, Professional: empty, Architect: empty };
  }
  const toArr = (x: any): any[] => {
    if (Array.isArray(x)) return x;
    if (x && typeof x === 'object' && !Array.isArray(x)) return Object.entries(x).map(([k, v]) => (typeof v === 'object' && v && 'phrase' in v) ? v : { phrase: k, weight: Number(v) || 1 });
    return empty;
  };
  return {
    Novice: toArr(raw.Novice ?? raw.slang_list ?? raw.slang ?? raw.novice),
    Professional: toArr(raw.Professional ?? raw.mantra_top ?? raw.mantra ?? raw.professional),
    Architect: toArr(raw.Architect ?? raw.architect ?? raw.sv_slang ?? []),
  };
}

/** 将 vibe_lexicon 规范为 summary 接口要求：{ Novice: [{ phrase, count }], ... }，每类按 count 降序 */
function formatVibeLexiconForSummary(lex: { Novice: any[]; Professional: any[]; Architect: any[] }): { Novice: Array<{ phrase: string; count: number }>; Professional: Array<{ phrase: string; count: number }>; Architect: Array<{ phrase: string; count: number }> } {
  const toCountArr = (arr: any[]): Array<{ phrase: string; count: number }> =>
    (arr || [])
      .map((x: any) => ({ phrase: String(x?.phrase ?? x?.word ?? '').trim(), count: Number(x?.count ?? x?.weight ?? 1) || 0 }))
      .filter((x) => x.phrase.length > 0)
      .sort((a, b) => b.count - a.count);
  return {
    Novice: toCountArr(lex.Novice),
    Professional: toCountArr(lex.Professional),
    Architect: toCountArr(lex.Architect),
  };
}

/** 高阶身份键名（非 Novice）：这些键的数据需同时映射到 Professional，供前端固定读取 Professional 时能拿到 */
const IDENTITY_LEVEL_KEYS_NON_NOVICE = ['Professional', 'Architect', 'Senior', 'Expert', 'Master'] as const;

/**
 * 规范化 identityLevelCloud：若存在 Architect、Senior 等高阶键，将其数据同时合并到 Professional 下，
 * 确保返回的 JSON 包含前端预期的 Professional 字段；内部项统一为 { word, count } 格式不变。
 */
function normalizeIdentityLevelCloudForFrontend(ilc: any): Record<string, Array<{ word: string; count: number }>> {
  if (!ilc || typeof ilc !== 'object') return ilc || {};
  const out = { ...ilc } as Record<string, any>;
  const toWordCount = (x: any): { word: string; count: number } => {
    const word = String(x?.word ?? x?.phrase ?? '').trim();
    const count = Number(x?.count ?? x?.weight ?? 0) || 0;
    return { word, count };
  };
  const byWord = new Map<string, number>();
  for (const key of IDENTITY_LEVEL_KEYS_NON_NOVICE) {
    const arr = out[key];
    if (!Array.isArray(arr)) continue;
    for (const item of arr) {
      const { word, count } = toWordCount(item);
      if (word) byWord.set(word, (byWord.get(word) || 0) + count);
    }
  }
  if (byWord.size > 0) {
    out.Professional = Array.from(byWord.entries())
      .map(([word, count]) => ({ word, count }))
      .sort((a, b) => b.count - a.count);
  } else if (out.Professional == null && (out.Architect ?? out.Senior ?? out.Expert ?? out.Master)) {
    out.Professional = [];
  }
  return out as Record<string, Array<{ word: string; count: number }>>;
}

/** 将关键词按三个 JSON 维度分箱：仅使用 Novice/Professional/Architect 键，转为 identityLevelCloud（word + count），供 KV/前端读取；禁止用 slang_list/mantra_top 等其它分类混入。 */
function vibeLexiconToIdentityLevelCloud(vibeLexicon: any): Record<string, Array<{ word: string; count: number }>> {
  const empty: Array<{ word: string; count: number }> = [];
  if (!vibeLexicon || typeof vibeLexicon !== 'object') return { Novice: [...empty], Professional: [...empty], Architect: [...empty] };
  const toWordCount = (arr: any[]): Array<{ word: string; count: number }> =>
    (Array.isArray(arr) ? arr : []).map((x: any) => ({
      word: String(x?.word ?? x?.phrase ?? x?.w ?? '').trim(),
      count: Number(x?.count ?? x?.weight ?? x?.v ?? 0) || 0,
    })).filter((x) => x.word.length > 0);
  const raw = {
    Novice: toWordCount(vibeLexicon.Novice),
    Professional: toWordCount(vibeLexicon.Professional),
    Architect: toWordCount(vibeLexicon.Architect),
  };
  return normalizeIdentityLevelCloudForFrontend(raw);
}

/**
 * GET /api/v2/summary
 * 按国家返回 vibe_lexicon。优先从视图 v_keyword_stats_by_country 查询，不足时从 user_analysis.stats.identityLevelCloud 聚合兜底。
 * 返回的 vibe_lexicon 必为 { Novice: [{ phrase, count }], Professional: [], Architect: [] }，每类按 count 降序。
 */
async function handleSummary(c: any): Promise<Response> {
  const env = c.env;
  if (!env.SUPABASE_URL || !env.SUPABASE_KEY) {
    return c.json({ success: false, error: 'Supabase 未配置' }, 500);
  }
  const countryRaw = (c.req.query('country') || '').trim();
  const countryCode = countryRaw.toUpperCase();
  if (!/^[A-Z]{2}$/.test(countryCode)) {
    return c.json({ success: false, error: 'country 必填且为 2 位国家码' }, 400);
  }

  let vibeLexiconRaw: any = null;

  // 1. 缓存：country_lexicon_cache
  try {
    const cacheUrl = new URL(`${env.SUPABASE_URL}/rest/v1/country_lexicon_cache`);
    cacheUrl.searchParams.set('select', 'lexicon_json');
    cacheUrl.searchParams.set('country_code', `eq.${countryCode}`);
    cacheUrl.searchParams.set('limit', '1');
    const cacheRows = await fetchSupabaseJson<any[]>(
      env,
      cacheUrl.toString(),
      { headers: buildSupabaseHeaders(env) },
      SUPABASE_FETCH_TIMEOUT_MS
    ).catch(() => []);
    const cacheRow = Array.isArray(cacheRows) && cacheRows.length > 0 ? cacheRows[0] : null;
    if (cacheRow && cacheRow.lexicon_json != null) {
      vibeLexiconRaw = typeof cacheRow.lexicon_json === 'string'
        ? (() => { try { return JSON.parse(cacheRow.lexicon_json); } catch { return cacheRow.lexicon_json; } })()
        : cacheRow.lexicon_json;
    }
  } catch (e) {
    console.warn('[Worker] /api/v2/summary country_lexicon_cache 查询失败:', e);
  }

  // 2. 优先从视图 v_keyword_stats_by_country 查询（country_code 已大写，分类与库中 'Novice'/'Professional'/'Architect' 一致）
  if (vibeLexiconRaw == null) {
    try {
      const viewUrl = new URL(`${env.SUPABASE_URL}/rest/v1/v_keyword_stats_by_country`);
      viewUrl.searchParams.set('select', 'phrase,category,hit_count');
      viewUrl.searchParams.set('country_code', `eq.${countryCode}`);
      viewUrl.searchParams.set('order', 'hit_count.desc');
      viewUrl.searchParams.set('limit', '500');
      const viewRows = await fetchSupabaseJson<any[]>(
        env,
        viewUrl.toString(),
        { headers: buildSupabaseHeaders(env) },
        SUPABASE_FETCH_TIMEOUT_MS
      ).catch(() => []);
      const rows = Array.isArray(viewRows) ? viewRows : [];
      if (rows.length > 0) {
        const byCat: { Novice: Array<{ phrase: string; count: number }>; Professional: Array<{ phrase: string; count: number }>; Architect: Array<{ phrase: string; count: number }> } = {
          Novice: [],
          Professional: [],
          Architect: [],
        };
        for (const r of rows) {
          const phrase = String(r?.phrase ?? '').trim();
          const cat = String(r?.category ?? '').trim();
          const count = Number(r?.hit_count ?? r?.count ?? 1) || 1;
          if (!phrase || !cat) continue;
          if (cat === 'Novice') byCat.Novice.push({ phrase, count });
          else if (cat === 'Professional') byCat.Professional.push({ phrase, count });
          else if (cat === 'Architect') byCat.Architect.push({ phrase, count });
        }
        vibeLexiconRaw = byCat;
      }
    } catch (e) {
      console.warn('[Worker] /api/v2/summary v_keyword_stats_by_country 查询失败:', e);
    }
  }

  // 3. 兜底：从 user_analysis 查该国最近记录，聚合词频；词云优先读 identity_cloud 列（不再挤在 stats 里），兼容旧数据 stats.identityLevelCloud
  if (vibeLexiconRaw == null || (vibeLexiconRaw && [vibeLexiconRaw.Novice, vibeLexiconRaw.Professional, vibeLexiconRaw.Architect].every((a) => !Array.isArray(a) || a.length === 0))) {
    try {
      const uaUrl = new URL(`${env.SUPABASE_URL}/rest/v1/user_analysis`);
      uaUrl.searchParams.set('select', 'stats,identity_cloud');
      // 【核心修复】更宽松的查询条件，优先级调整：current_location > manual_location > country_code > ip_location
      uaUrl.searchParams.set('or', `(current_location.eq.${countryCode},manual_location.eq.${countryCode},country_code.eq.${countryCode},ip_location.eq.${countryCode})`);
      uaUrl.searchParams.set('total_messages', 'gt.5');
      uaUrl.searchParams.set('order', 'updated_at.desc');
      uaUrl.searchParams.set('limit', '200');
      const uaRows = await fetchSupabaseJson<any[]>(
        env,
        uaUrl.toString(),
        { headers: buildSupabaseHeaders(env) },
        SUPABASE_FETCH_TIMEOUT_MS
      ).catch(() => []);
      const list = Array.isArray(uaRows) ? uaRows : [];
      console.log(`[Worker] /api/v2/summary ${countryCode} - 兜底查询到 ${list.length} 条用户记录`);
      const wordCounts: { Novice: Map<string, number>; Professional: Map<string, number>; Architect: Map<string, number> } = {
        Novice: new Map(),
        Professional: new Map(),
        Architect: new Map(),
      };
      for (const row of list) {
        const ilc = row?.identity_cloud ?? (row?.stats && typeof row.stats === 'object' ? row.stats.identityLevelCloud : null);
        const stats = row?.stats;
        if (!ilc || typeof ilc !== 'object') continue;
        for (const level of IDENTITY_CATEGORIES) {
          const levelData = ilc[level];
          if (!Array.isArray(levelData)) continue;
          for (const item of levelData) {
            const phrase = String(item?.word ?? item?.phrase ?? '').trim();
            const count = Number(item?.count ?? item?.weight ?? 0) || 0;
            if (phrase.length > 0 && count > 0) {
              const m = wordCounts[level];
              m.set(phrase, (m.get(phrase) || 0) + count);
            }
          }
        }
      }
      const hasAny = [...wordCounts.Novice.entries(), ...wordCounts.Professional.entries(), ...wordCounts.Architect.entries()].length > 0;
      if (hasAny) {
        vibeLexiconRaw = {
          Novice: Array.from(wordCounts.Novice.entries()).map(([phrase, count]) => ({ phrase, count })).sort((a, b) => b.count - a.count),
          Professional: Array.from(wordCounts.Professional.entries()).map(([phrase, count]) => ({ phrase, count })).sort((a, b) => b.count - a.count),
          Architect: Array.from(wordCounts.Architect.entries()).map(([phrase, count]) => ({ phrase, count })).sort((a, b) => b.count - a.count),
        };
      }
    } catch (e) {
      console.warn('[Worker] /api/v2/summary user_analysis identityLevelCloud 聚合失败:', e);
    }
  }

  // 4. 单用户保底：该国仅 1 人时从 personality_data / personality.vibe_lexicon 取
  if (vibeLexiconRaw == null) {
    try {
      const uaListUrl = new URL(`${env.SUPABASE_URL}/rest/v1/user_analysis`);
      uaListUrl.searchParams.set('select', 'fingerprint,personality_data,personality');
      // 【核心修复】更宽松的查询条件，优先级调整：current_location > manual_location > country_code > ip_location
      uaListUrl.searchParams.set('or', `(current_location.eq.${countryCode},manual_location.eq.${countryCode},country_code.eq.${countryCode},ip_location.eq.${countryCode})`);
      uaListUrl.searchParams.set('limit', '2');
      const uaRows = await fetchSupabaseJson<any[]>(
        env,
        uaListUrl.toString(),
        { headers: buildSupabaseHeaders(env) },
        SUPABASE_FETCH_TIMEOUT_MS
      ).catch(() => []);
      const list = Array.isArray(uaRows) ? uaRows : [];
      if (list.length === 1) {
        const row = list[0];
        const pd = row?.personality_data;
        if (pd && typeof pd === 'object' && (pd as any).vibe_lexicon) {
          vibeLexiconRaw = (pd as any).vibe_lexicon;
        } else if (row?.personality?.vibe_lexicon) {
          vibeLexiconRaw = row.personality.vibe_lexicon;
        }
      }
    } catch (e) {
      console.warn('[Worker] /api/v2/summary 单用户 vibe_lexicon 保底失败:', e);
    }
  }

  const normalized = normalizeVibeLexiconToIdentity(vibeLexiconRaw);
  const vibeLexicon = formatVibeLexiconForSummary(normalized);
  // 向后兼容：部分前端仍读 mantra_top / slang_list
  (vibeLexicon as any).mantra_top = vibeLexicon.Professional;
  (vibeLexicon as any).slang_list = vibeLexicon.Novice;

  // 4. 数据聚合：该国 user_analysis 汇总 jiafang_count / ketao_count
  let totalno = 0;
  let totalplease = 0;
  try {
    const aggUrl = new URL(`${env.SUPABASE_URL}/rest/v1/user_analysis`);
    aggUrl.searchParams.set('select', 'jiafang_count,ketao_count');
    // 【核心修复】更宽松的查询条件，优先级调整：current_location > manual_location > country_code > ip_location
    aggUrl.searchParams.set('or', `(current_location.eq.${countryCode},manual_location.eq.${countryCode},country_code.eq.${countryCode},ip_location.eq.${countryCode})`);
    const aggRows = await fetchSupabaseJson<any[]>(
      env,
      aggUrl.toString(),
      { headers: buildSupabaseHeaders(env) },
      SUPABASE_FETCH_TIMEOUT_MS
    ).catch(() => []);
    const rows = Array.isArray(aggRows) ? aggRows : [];
    totalno = rows.reduce((s, r) => s + (Number(r.jiafang_count) || 0), 0);
    totalplease = rows.reduce((s, r) => s + (Number(r.ketao_count) || 0), 0);
  } catch (e) {
    console.warn('[Worker] /api/v2/summary 聚合统计失败:', e);
  }

  // 别名映射：totalno 总和 -> jiafang_count，totalplease 总和 -> ketao_count
  const countryName = COUNTRY_CODE_TO_NAME[countryCode] || countryCode;

  return c.json({
    success: true,
    vibe_lexicon: vibeLexicon ?? { Novice: [], Professional: [], Architect: [] },
    jiafang_count: totalno,
    ketao_count: totalplease,
    _meta: { countryCode, countryName },
  }, 200, { 'Cache-Control': 'public, max-age=60' });
}

app.get('/api/v2/summary', handleSummary);

/** 默认国家维度均值（RPC 失败或未配置时返回，防止页面/GitHub 卡片加载失败） */
const DEFAULT_COUNTRY_DIMENSION_AVERAGES = {
  has_valid_data: false,
  avg_l: 50,
  avg_p: 50,
  avg_d: 50,
  avg_e: 50,
  avg_f: 50,
};

/**
 * POST /api/supabase/rpc/get_country_dimension_averages
 * 代理 Supabase RPC，唯一签名 target_country_code text；服务端注入 apikey + Authorization，避免 No API key found。
 * 任何失败（未配置、RPC 报错、function is not unique 等）均返回默认全维度 50，不中断 GitHub 同步等流程。
 */
app.post('/api/supabase/rpc/get_country_dimension_averages', async (c) => {
  const defaultResponse = () => c.json({ data: [DEFAULT_COUNTRY_DIMENSION_AVERAGES] });
  try {
    const env = c.env;
    const supabaseKey = (env.SUPABASE_KEY || env.SUPABASE_ANON_KEY || '').trim();
    if (!env.SUPABASE_URL || !supabaseKey) {
      console.warn('[Worker] get_country_dimension_averages: Supabase 未配置或 API Key 为空，返回默认均值');
      return defaultResponse();
    }
    let body: { target_code?: string; target_country_code?: string } = {};
    try {
      body = await c.req.json().catch(() => ({}));
    } catch {
      return defaultResponse();
    }
    const targetCode = (body.target_country_code || body.target_code || '').trim().toUpperCase();
    if (!targetCode || !/^[A-Z]{2}$/.test(targetCode)) {
      return defaultResponse();
    }
    const rpcUrl = `${env.SUPABASE_URL}/rest/v1/rpc/get_country_dimension_averages`;
    const headers = buildSupabaseHeaders(env, { 'Content-Type': 'application/json' });
    const res = await fetch(rpcUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ target_country_code: targetCode }),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.warn('[Worker] get_country_dimension_averages RPC 失败:', res.status, errText);
      return defaultResponse();
    }
    const data = await res.json().catch(() => null);
    const list = Array.isArray(data) && data.length > 0 ? data : [DEFAULT_COUNTRY_DIMENSION_AVERAGES];
    return c.json({ data: list });
  } catch (e: any) {
    console.warn('[Worker] get_country_dimension_averages 异常:', e?.message);
    return defaultResponse();
  }
});

/**
 * POST /api/update-location
 * 全链路国籍同步：接收 fingerprint + new_cc，更新 user_analysis.current_location，保证与视图统计强一致。
 * 响应 200 且 Cache-Control: no-store，供前端选籍后立即拉取最新 country-summary。
 * 同一 fingerprint 的并发 PATCH 由 Supabase 按行原子处理，始终返回 200（success 或 warning）。
 */
app.post('/api/update-location', async (c) => {
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
  const newCcRaw = body?.new_cc ?? body?.newCc ?? body?.current_location ?? body?.currentLocation ?? '';
  const newCc = String(newCcRaw || '').trim().toUpperCase();
  if (!fingerprint) {
    return c.json({ status: 'error', error: 'fingerprint 必填' }, 400);
  }
  if (!/^[A-Z]{2}$/.test(newCc)) {
    return c.json({ status: 'error', error: 'new_cc 必须为 2 位国家码' }, 400);
  }
  try {
    const patchPayload: Record<string, any> = {
      current_location: newCc,
      manual_location: newCc,
      country_code: newCc, // 向后兼容
      location_switched_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    // 【扩展】支持可选的 manual_lat/manual_lng 参数，用于保存手动校准坐标
    const manualLat = body?.manual_lat;
    const manualLng = body?.manual_lng;
    if (manualLat != null && typeof manualLat === 'number' && !isNaN(manualLat)) {
      patchPayload.manual_lat = manualLat;
    }
    if (manualLng != null && typeof manualLng === 'number' && !isNaN(manualLng)) {
      patchPayload.manual_lng = manualLng;
    }
    
    // 【扩展】支持通过 user_id 更新（GitHub 登录用户）
    const userId = body?.user_id;
    let url: string;
    if (userId && typeof userId === 'string' && userId.trim()) {
      url = `${env.SUPABASE_URL}/rest/v1/user_analysis?id=eq.${encodeURIComponent(userId.trim())}`;
    } else {
      url = `${env.SUPABASE_URL}/rest/v1/user_analysis?fingerprint=eq.${encodeURIComponent(fingerprint)}`;
    }
    const res = await fetchSupabase(env, url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify(patchPayload),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      return c.json({
        status: 'warning',
        updated: false,
        error: t || `HTTP ${res.status}`,
        current_location: newCc,
        country_code: newCc,
      }, 200);
    }
    c.header('Cache-Control', 'no-store');
    return c.json({
      status: 'success',
      updated: true,
      current_location: newCc,
      manual_location: newCc,
      country_code: newCc,
    });
  } catch (e: any) {
    return c.json({
      status: 'warning',
      updated: false,
      error: e?.message || String(e),
      current_location: newCc,
      country_code: newCc,
    }, 200);
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
      manual_location: currentLocation, // 同步写入，使 v_unified_analysis_v2 能按该国聚合（右侧抽屉国家统计）
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
 * GET /api/rank-resources
 * 返回常量 RANK_RESOURCES，前端初始化不报错的前提（避免 /src/rank-content.ts 等 404）
 */
app.get('/api/rank-resources', async (c) => {
  try {
    return c.json(RANK_RESOURCES, 200, {
      'Cache-Control': 'public, max-age=3600',
    });
  } catch (error: any) {
    console.error('[Worker] /api/rank-resources 错误:', error);
    return c.json({ error: error?.message || '未知错误' }, 500);
  }
});

/**
 * GET /api/national-lexicon?country=CN&type=merit_board
 * 按国家聚合 personality.vibe_lexicon[type]，返回 Top 词条 { phrase, hit_count }
 * type: merit_board | slang_list | mantra_top
 */
const LEXICON_TYPES = new Set(['merit_board', 'slang_list', 'mantra_top']);
app.get('/api/national-lexicon', async (c) => {
  try {
    const country = (c.req.query('country') || '').trim().toUpperCase();
    const type = (c.req.query('type') || 'merit_board').trim();
    if (!/^[A-Z]{2}$/.test(country)) {
      return c.json({ data: [], error: 'invalid country' }, 400);
    }
    if (!LEXICON_TYPES.has(type)) {
      return c.json({ data: [], error: 'invalid type' }, 400);
    }
    const env = c.env;
    if (!env.SUPABASE_URL || !env.SUPABASE_KEY) {
      return c.json({ data: [] }, 200);
    }
    // 中国区统计：只要判定为该国（country_code / ip_location / manual_location / current_location 任一为该国），贡献即进入该国
    const url = new URL(`${env.SUPABASE_URL}/rest/v1/user_analysis`);
    url.searchParams.set('select', 'personality');
    url.searchParams.set('or', `(country_code.eq.${country},ip_location.eq.${country},manual_location.eq.${country},current_location.eq.${country})`);
    url.searchParams.set('limit', '500');
    const rows = await fetchSupabaseJson<any[]>(env, url.toString(), {
      headers: buildSupabaseHeaders(env),
    }, SUPABASE_FETCH_TIMEOUT_MS).catch(() => []);
    const list = Array.isArray(rows) ? rows : [];
    const agg = new Map<string, number>();
    for (const row of list) {
      const lex = row?.personality?.vibe_lexicon?.[type];
      if (!Array.isArray(lex)) continue;
      for (const it of lex) {
        const w = it?.w != null ? String(it.w).trim() : '';
        const v = Number(it?.v) || 0;
        if (!w) continue;
        agg.set(w, (agg.get(w) || 0) + v);
      }
    }
    const data = Array.from(agg.entries())
      .map(([phrase, hit_count]) => ({ phrase, hit_count }))
      .sort((a, b) => b.hit_count - a.hit_count)
      .slice(0, 20);
    return c.json({ data }, 200, { 'Cache-Control': 'public, max-age=120' });
  } catch (e: any) {
    console.warn('[Worker] /api/national-lexicon 错误:', e?.message);
    return c.json({ data: [] }, 200);
  }
});

/**
 * GET /api/github-proxy/:username
 * 代理 GitHub 用户仓库列表，解决前端 403 限流与 CSP 限制。请求头带 User-Agent（GitHub 必需），可选 GITHUB_TOKEN 提升限额。
 */
app.get('/api/github-proxy/:username', async (c) => {
  const username = c.req.param('username');
  if (!username || !/^[a-zA-Z0-9_-]+$/.test(username)) {
    return c.json({ error: 'Invalid username' }, 400);
  }
  const env = c.env as Env;
  const url = `https://api.github.com/users/${encodeURIComponent(username)}/repos?sort=stars&per_page=10`;
  const headers: Record<string, string> = {
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'Hono-Worker',
  };
  if (env.GITHUB_TOKEN && env.GITHUB_TOKEN.trim()) {
    headers['Authorization'] = `Bearer ${env.GITHUB_TOKEN.trim()}`;
  }
  try {
    const resp = await fetch(url, { headers });
    if (!resp.ok) {
      const text = await resp.text();
      return c.json({ error: 'GitHub API error', status: resp.status, details: text.slice(0, 200) }, 502);
    }
    const data = await resp.json();
    if (!Array.isArray(data)) {
      return c.json({ error: 'Invalid GitHub response' }, 502);
    }
    return c.json(data, 200, { 'Cache-Control': 'public, max-age=300' });
  } catch (e: any) {
    console.error('[Worker] /api/github-proxy 错误:', e);
    return c.json({ error: e?.message || 'Proxy error' }, 502);
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
    const { githubUsername, fingerprint, githubAccessToken } = body;

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
      if (githubAccessToken && env.SUPABASE_URL && env.SUPABASE_KEY) {
        const ctx = c.executionCtx;
        if (ctx && typeof ctx.waitUntil === 'function') {
          ctx.waitUntil(
            syncGithubCombatStats(githubAccessToken, githubUsername, env, {
              id: userData.id, // user_analysis 主键，供 persistToSupabase 优先按 id 更新
              fingerprint: fingerprint,
            })
              .then((result) => {
                if (result.success) {
                  console.log('[GitHub Sync] ✅ Synced:', result.cached ? 'cached' : 'fresh', githubUsername);
                } else {
                  console.warn('[GitHub Sync] ⚠️ Failed:', result.error, githubUsername);
                }
              })
              .catch((err) => console.error('[GitHub Sync] ❌ Error:', err?.message, githubUsername))
          );
        }
      }
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
 * 路由：POST /api/github/sync
 * 功能：同步 GitHub Combat 统计（22 项指标），8 小时内返回缓存
 * Body: { accessToken, id?: UUID, userId?: GitHub login, fingerprint?, country_code? }，优先用 id (UUID) 定位记录；带 country_code 时写入/更新国家字段
 */
app.post('/api/github/sync', async (c) => {
  try {
    const env = c.env;
    const body = await c.req.json().catch(() => ({}));
    const accessToken = body?.accessToken ?? body?.access_token ?? '';
    const id = body?.id ?? ''; // 数据库 user_analysis.id (UUID)，优先用于定位
    const userId = body?.userId ?? body?.user_id ?? body?.username ?? body?.user_name ?? '';
    const fingerprint = body?.fingerprint ?? '';
    const countryCode = (body?.country_code ?? '').trim().toUpperCase();
    const countryCodeValid = countryCode.length === 2 && /^[A-Z]{2}$/.test(countryCode);

    if (!accessToken) {
      return c.json({
        status: 'error',
        error: 'accessToken 必填',
        errorCode: 'MISSING_PARAMETERS',
      }, 400);
    }
    if (!id && !userId && !fingerprint) {
      return c.json({
        status: 'error',
        error: 'id (UUID)、userId 或 fingerprint 至少填一项以定位记录',
        errorCode: 'MISSING_PARAMETERS',
      }, 400);
    }

    const result = await syncGithubCombatStats(accessToken, String(userId || '').trim(), env, { id: id || undefined, fingerprint }, countryCodeValid ? countryCode : undefined);

    if (result.success) {
      return c.json({
        status: 'success',
        data: result.data,
        cached: result.cached === true,
      });
    }
    console.error('[Worker] /api/github/sync 失败:', { error: result.error, errorCode: result.error ?? 'SYNC_FAILED' });
    // 业务失败（如写库失败、配置缺失）返回 200 + error，避免 500 导致前端无法解析
    return c.json({
      status: 'error',
      success: false,
      error: result.error ?? 'SYNC_FAILED',
      errorCode: result.error ?? 'SYNC_FAILED',
    });
  } catch (error: any) {
    console.error('[Worker] /api/github/sync 错误:', error);
    return c.json({
      status: 'error',
      success: false,
      error: error?.message ?? '未知错误',
      errorCode: 'INTERNAL_ERROR',
    });
  }
});

/**
 * 路由：/api/github/check-binding
 * 功能：检查 GitHub 账号是否已被绑定（是否有历史数据）
 * 用于：异地登录时判断是否需要显示合并弹窗
 */
app.get('/api/github/check-binding', async (c) => {
  try {
    const q = c.req.query();
    const githubUserId = q.userId || q.user_id || '';
    const githubUsername = q.username || q.user_name || '';

    if (!githubUserId && !githubUsername) {
      return c.json({ 
        hasBinding: false, 
        message: 'userId 或 username 缺失' 
      }, 200);
    }

    const supabaseUrl = c.env.SUPABASE_URL;
    const supabaseKey = c.env.SUPABASE_KEY || c.env.SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseKey) {
      return c.json({ error: 'Supabase 配置缺失（需配置 SUPABASE_URL 与 SUPABASE_KEY 或 SUPABASE_ANON_KEY）' }, 500);
    }

    // 查询该 GitHub 用户是否已有数据（createClient 必须使用正确的 URL 与 Key，否则 Supabase 报 No API key found）
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // 先通过 userId 查找
    let query = supabase
      .from('v_unified_analysis_v2')
      .select('id, fingerprint, user_name, total_messages, total_chars')
      .eq('id', githubUserId)
      .limit(1);

    let { data: userData, error } = await query;

    // 如果没有通过 userId 找到，尝试通过 user_name 查找
    if (!userData || userData.length === 0) {
      const { data: byName } = await supabase
        .from('v_unified_analysis_v2')
        .select('id, fingerprint, user_name, total_messages, total_chars')
        .ilike('user_name', githubUsername)
        .limit(1);
      
      if (byName && byName.length > 0) {
        const user = byName[0];
        const hasData = (user.total_messages || 0) > 0 || (user.total_chars || 0) > 0;
        const hasFingerprint = !!user.fingerprint;
        
        return c.json({
          hasBinding: hasData || hasFingerprint,
          hasData,
          hasFingerprint,
          boundUsername: user.user_name,
          boundUserId: user.id
        }, 200);
      }
      
      return c.json({ hasBinding: false }, 200);
    }

    const user = userData[0];
    const hasData = (user.total_messages || 0) > 0 || (user.total_chars || 0) > 0;
    const hasFingerprint = !!user.fingerprint;

    return c.json({
      hasBinding: hasData || hasFingerprint,
      hasData,
      hasFingerprint,
      boundUsername: user.user_name,
      boundUserId: user.id
    }, 200);

  } catch (error: any) {
    console.error('[Check Binding] 错误:', error);
    return c.json({ hasBinding: false, error: error.message }, 500);
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
    let body: any = {};
    try {
      body = (await c.req.json()) || {};
    } catch {
      body = {};
    }
    const q = c.req.query();
    // 从 req.query 或 req.body 提取 fingerprint、userId（消除 404/参数缺失；兼容 targetUserId）
    const oldFingerprint = String(body.fingerprint ?? body.sourceFp ?? q.fingerprint ?? q.fp ?? '').trim();
    const sourceFp = String(body.sourceFp ?? body.fingerprint ?? q.fingerprint ?? q.fp ?? '').trim();
    let githubUserId = String(body.userId ?? body.user_id ?? body.targetUserId ?? body.target_user_id ?? q.userId ?? q.user_id ?? '').trim();
    const githubUsername = body.username ?? body.githubUsername ?? q.username ?? undefined;
    const claimToken = body.claimToken ?? q.claimToken ?? undefined;

    if (!githubUserId) {
      return c.json({ status: 'skipped', message: 'userId 缺失，已跳过' }, 200);
    }

    // 【支持两种迁移方式】claimToken 或 fingerprint；缺失时静默跳过，不返回 400
    const hasClaimToken = claimToken && String(claimToken).trim() !== '';
    const hasFingerprint = oldFingerprint !== '' || sourceFp !== '';
    if (!hasClaimToken && !hasFingerprint) {
      return c.json({ status: 'skipped', message: 'claimToken 或 fingerprint 缺失，已跳过' }, 200);
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

    // 验证 userId 格式（UUID）；非 UUID 时返回 200 跳过，避免前端 400 导致无限重试
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(githubUserId)) {
      console.warn('[Worker] ⚠️ userId 非 UUID 格式，已跳过迁移');
      return c.json({
        status: 'skipped',
        message: '无效的 userId 格式，已跳过',
        errorCode: 'INVALID_USER_ID',
      }, 200);
    }

    // 【步骤 2：执行迁移】使用 claimToken 或 fingerprint 执行迁移
    const fingerprintToMigrate = oldFingerprint || sourceFp || '';
    console.log('[Worker] 🔑 开始迁移流程...', {
      method: hasClaimToken ? 'claim_token' : 'fingerprint',
      userId: githubUserId.substring(0, 8) + '...',
      fingerprint: fingerprintToMigrate ? fingerprintToMigrate.substring(0, 8) + '...' : 'none',
    });

    const result = await migrateFingerprintToUserId(fingerprintToMigrate, githubUserId, claimToken, env);

    if (result) {
      console.log('[Worker] ✅ 数据认领成功');
      // result 已由 migrateFingerprintToUserId 内查询 v_user_analysis_extended 返回完整记录
      return c.json({
        status: 'success',
        data: result,
        message: '数据认领成功',
        requiresRefresh: true,
      });
    }

    // 【防止死循环】无需迁移或认领失败时统一返回 200 + status skipped，阻止前端无限重试
    console.log('[Worker] ℹ️ 无需迁移或已关联，返回 skipped');
    return c.json({
      status: 'skipped',
      message: '无需迁移或已关联',
      errorCode: 'NO_ACTION_NEEDED',
    }, 200);

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
    // 【唯一键变更】fingerprint 是唯一主键，必须存在
    if (successfulFp) {
      updateData.fingerprint = successfulFp;
      console.log('[Worker] 🔗 执行物理归一化：关联指纹已存入数据库');
    } else if (sourceRecord.fingerprint) {
      // 如果没有 successfulFp，使用源记录的 fingerprint
      updateData.fingerprint = sourceRecord.fingerprint;
      console.log('[Worker] 🔗 使用源记录的 fingerprint');
    } else {
      console.error('[Worker] ❌ 无法更新：缺少 fingerprint 字段');
      return c.json({
        status: 'error',
        error: '迁移失败：源记录和目标记录都缺少 fingerprint 字段',
        errorCode: 'MISSING_FINGERPRINT',
      }, 400);
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

    // 如果 PATCH 失败（404），尝试使用 upsert
    // 【禁止创建新行】如果 fingerprint 不存在，无法 upsert，直接返回错误
    if (!updateResponse.ok) {
      const errorText = await updateResponse.text();
      
      // 【唯一键变更】必须基于 fingerprint 进行 upsert
      if (!cleanedUpdateData.fingerprint) {
        console.error('[Worker] ❌ 无法 upsert：缺少 fingerprint 字段');
        return c.json({
          status: 'error',
          error: '更新失败：缺少 fingerprint 字段，无法执行 upsert',
          errorCode: 'MISSING_FINGERPRINT',
          details: errorText.substring(0, 500),
        }, 500);
      }
      
      console.warn('[Worker] ⚠️ PATCH 更新失败，尝试使用 fingerprint upsert:', {
        status: updateResponse.status,
        fingerprint: cleanedUpdateData.fingerprint?.substring(0, 8) + '...',
        error: errorText.substring(0, 200)
      });
      
      // 【唯一键变更】使用 fingerprint 作为冲突键
      const upsertUrl = `${env.SUPABASE_URL}/rest/v1/user_analysis?on_conflict=fingerprint`;
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

    // ==========================================================
    // 🚨 重要：弃用写库的旧接口 /api/analyze
    //
    // 你贴出来的“重复记录（fingerprint 32 位 + 64 位）”的根因之一就是：
    // - 旧接口在 fingerprint 缺失时会用 total_messages/total_chars 生成 SHA-256 指纹（64 hex），
    // - 新接口 /api/v2/analyze 使用浏览器稳定指纹（通常 32 hex）。
    // 两条链路并发/重复触发时会写入两行，导致排行榜重复。
    //
    // 为彻底止血：这里不再写入 user_analysis，只返回兼容提示，
    // 让所有真实写入统一收敛到 /api/v2/analyze（已包含 5 秒幂等 + 10 秒去重 + upsert）。
    // ==========================================================
    console.warn('[Worker] ⚠️ /api/analyze 已弃用写库，请改用 /api/v2/analyze。', {
      ip: clientIP,
      hasFingerprint: !!(body?.fingerprint || body?.meta?.fingerprint),
    });
    return c.json({
      status: 'success',
      success: true,
      deprecated: true,
      message: '/api/analyze 已弃用写库，请升级前端改用 /api/v2/analyze（避免重复记录）。',
      // 兼容旧前端字段：不给 rankPercent，避免误导；旧前端应迁移到 v2。
      rankPercent: null,
      totalUsers: null,
    });
    
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

    // 【幂等写入】优先使用前端上报 fingerprint；否则回退到本路由生成的 userIdentity
    // 目的：为数据库唯一约束与 Upsert 提供稳定冲突键，避免重复记录堆积导致排行榜重复
    const fingerprint = (body?.fingerprint ? String(body.fingerprint).trim() : '') || userIdentity;
    
    // 3. 写入 Supabase - 直接写入 user_analysis 表
    // 【字段对齐】确保字段名与 user_analysis 表定义完全一致
    // 参考 /api/v2/analyze 中的字段映射
    // 【调试日志】在写入前添加调试日志
    console.log('[Debug] 准备写入 user_analysis:', JSON.stringify(body, null, 2));
    
    // 【新增】影子令牌生成逻辑
    const claimToken = crypto.randomUUID();
    console.log('[Worker] 🔑 为匿名用户(v1)生成 claim_token:', claimToken.substring(0, 8) + '...');

    const payload = {
      fingerprint,
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
      updated_at: new Date().toISOString(),
    };
    
    // 【方案一：后端 Upsert】按 fingerprint 幂等写入，冲突时 merge 更新字段
    const upsertUrl = `${env.SUPABASE_URL}/rest/v1/user_analysis?on_conflict=fingerprint`;
    // 【执行 Supabase Upsert】Body 必须是数组格式
    const upsertBody = JSON.stringify([payload]);
    
    console.log('[Worker] 📤 准备 Upsert 数据到 user_analysis 表:', {
      url: upsertUrl,
      method: 'POST',
      headers: {
        'apikey': '***',
        'Authorization': 'Bearer ***',
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates,return=minimal',
      },
      body: upsertBody,
      payload: payload,
    });
    
    // 【10 秒去重】防止前端重复触发导致短时间内重复写库与统计副作用
    const recentHit = await hasRecentUserAnalysisRecord(
      env,
      { fingerprint: payload.fingerprint, claim_token: payload.claim_token },
      10_000
    );
    if (recentHit) {
      console.warn('[Worker] 🛑 检测到 10 秒内重复上报，跳过写库:', {
        fingerprint: String(payload.fingerprint || '').slice(0, 8) + '...',
        hasClaimToken: !!payload.claim_token,
      });
      // 继续返回排名/统计查询（读操作），但不再写库
    } else {
    const writeRes = await fetchSupabase(env, upsertUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates,return=minimal',
      },
      body: upsertBody, // 数组格式：JSON.stringify([payload])
    });
    
    if (!writeRes.ok) {
      const errorText = await writeRes.text().catch(() => '无法读取错误信息');
      console.error('[Worker] ❌ 保存到 user_analysis 表失败:', {
        status: writeRes.status,
        statusText: writeRes.statusText,
        error: errorText,
        userIdentity: userIdentity,
        fingerprint,
        payload: payload,
        requestBody: upsertBody,
      });
    } else {
      console.log('[Worker] ✅ 分析数据已保存到 user_analysis 表', {
        userIdentity,
        fingerprint,
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

/** 判定 userContent 是否主要为英文（用于选择 Novice/Professional/Architect 词库语言） */
function isMainlyEnglish(text: string): boolean {
  if (!text || typeof text !== 'string') return false;
  const trimmed = text.trim();
  if (!trimmed.length) return false;
  let asciiLetters = 0;
  let totalLetters = 0;
  for (const ch of trimmed) {
    const code = ch.codePointAt(0) ?? 0;
    if ((code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a)) {
      asciiLetters++;
      totalLetters++;
    } else if (code >= 0x4e00 && code <= 0x9fff) totalLetters += 1; // CJK 基本
    else if (code >= 0x3400 && code <= 0x4dbf) totalLetters += 1;   // CJK 扩展 A
    else if (code > 0x7f) totalLetters += 1;                         // 其他非 ASCII 字母
  }
  if (totalLetters === 0) return false;
  return asciiLetters / totalLetters >= 0.5;
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

      // 3) 写回 KV（300s，脏检查保护）
      if (env.STATS_STORE) {
        await secureKVPut(env, kvKey, JSON.stringify(baseRow), KV_GLOBAL_STATS_V6_VIEW_TTL);
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

  // 6.5) Global 大盘补全：缺失时从聚合与 extended_stats_view 补 totalAnalysis/totalChars/locationRank/personalityDistribution
  if (region === 'Global' && env.SUPABASE_URL && env.SUPABASE_KEY) {
    try {
      const fr = finalRow as any;
      const needAgg = !Number(fr.totalAnalysis ?? fr.total_analysis);
      const needLocation = !Array.isArray(fr.locationRank) || fr.locationRank.length === 0;
      const needPersonality = !Array.isArray(fr.personalityDistribution) && !Array.isArray(fr.personalityRank);
      if (needLocation || needAgg || needPersonality) {
        const extUrl = `${env.SUPABASE_URL}/rest/v1/extended_stats_view?select=*`;
        const aggUrl = `${env.SUPABASE_URL}/rest/v1/user_analysis?select=total_messages,total_chars,personality_type&limit=5000`;
        const [extData, aggRows] = await Promise.all([
          needLocation ? fetchSupabaseJson<any>(env, extUrl, { headers: buildSupabaseHeaders(env) }, SUPABASE_FETCH_TIMEOUT_MS).catch(() => []) : [],
          (needAgg || needPersonality) ? fetchSupabaseJson<any[]>(env, aggUrl, { headers: buildSupabaseHeaders(env) }, SUPABASE_FETCH_TIMEOUT_MS).catch(() => []) : [],
        ]);
        const extArr = Array.isArray(extData) ? extData : (extData && typeof extData === 'object' ? [extData] : []);
        const extRow = extArr[0] || {};
        if (needLocation && extRow.location_rank && Array.isArray(extRow.location_rank)) {
          fr.locationRank = extRow.location_rank.slice(0, 10).map((item: any) => ({
            name: item.name ?? item.location ?? '未知',
            value: typeof item.value === 'number' ? item.value : (typeof item.count === 'number' ? item.count : 0),
          }));
        } else if (needLocation && extRow.location_rank && typeof extRow.location_rank === 'object') {
          fr.locationRank = Object.entries(extRow.location_rank).slice(0, 10).map(([name, count]: [string, unknown]) => ({
            name,
            value: typeof count === 'number' ? count : Number(count) || 0,
          })).sort((a, b) => b.value - a.value);
        } else if (needLocation) {
          fr.locationRank = fr.locationRank || [];
        }
        const rows = Array.isArray(aggRows) ? aggRows : [];
        if (rows.length > 0 && (needAgg || needPersonality)) {
          if (needAgg) {
            let totalAnalysis = 0;
            let totalCharsSum = 0;
            for (const r of rows) {
              totalAnalysis += Number(r.total_messages) || 0;
              totalCharsSum += Number(r.total_chars) || 0;
            }
            if (totalAnalysis > 0 || totalCharsSum > 0) {
              fr.totalAnalysis = totalAnalysis;
              fr.total_analysis = totalAnalysis;
              fr.totalChars = totalCharsSum;
              fr.total_chars = totalCharsSum;
              fr.totalchars = totalCharsSum;
              fr.totalRoastWords = fr.totalRoastWords ?? totalCharsSum;
              fr.total_roast_words = fr.total_roast_words ?? totalCharsSum;
            }
          }
          if (needPersonality) {
            const personalityMap = new Map<string, number>();
            for (const r of rows) {
              const t = (r.personality_type || 'UNKNOWN') as string;
              personalityMap.set(t, (personalityMap.get(t) || 0) + 1);
            }
            fr.personalityDistribution = Array.from(personalityMap.entries())
              .map(([type, count]) => ({ type, count }))
              .sort((a, b) => b.count - a.count)
              .slice(0, 10);
            fr.personalityRank = fr.personalityDistribution;
          }
        }
      }
    } catch (e) {
      console.warn('[Worker] ⚠️ Global 大盘补全失败:', (e as Error)?.message);
    }
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
  c.header('Cache-Control', 'public, max-age=600');
  return c.json(finalRow);
});

const ALLOWED_V2_STATS_QUERY_KEYS = new Set<string>(['fingerprint']);
type WorkerCacheStatus = 'HIT' | 'MISS' | 'ERROR';
function setStatsCacheHeaders(c: any, cacheStatus: WorkerCacheStatus, errorMode = false, cacheBusting = false): void {
  let cacheVal: string;
  let cdnMax = 600;
  if (errorMode) {
    cacheVal = 'public, max-age=10, s-maxage=10';
    cdnMax = 10;
  } else if (cacheBusting) {
    cacheVal = 'public, max-age=60, s-maxage=60';
    cdnMax = 60;
  } else {
    cacheVal = 'public, max-age=600, s-maxage=600';
  }
  c.header('Cache-Control', cacheVal);
  c.header('Cloudflare-CDN-Cache-Control', `max-age=${cdnMax}`);
  c.header('Vary', 'X-Fingerprint');
  c.header('X-Worker-Cache', cacheStatus);
}

const KV_CACHE_KEY_V2_STATS = 'cache:v2:stats';
const INBOX_PREFIX = 'inbox:';

/**
 * GET /api/v2/stats
 * - 从 Query 获取 fingerprint，探测 KV inbox:${fingerprint}，在返回 JSON 根部注入 hasNewMessage: !!(inbox && inbox.length > 0)
 * - 响应头 Vary: X-Fingerprint（由 setStatsCacheHeaders 设置）
 */
app.get('/api/v2/stats', async (c) => {
  const env = c.env;
  const url = new URL(c.req.url);
  const hasUnexpectedQuery = Array.from(url.searchParams.keys()).some((k) => !ALLOWED_V2_STATS_QUERY_KEYS.has(k));
  if (!env.SUPABASE_URL || !env.SUPABASE_KEY) {
    setStatsCacheHeaders(c, 'MISS', true, false);
    return c.json({ status: 'error', error: 'Supabase 未配置', totalUsers: 0, averages: {}, locationRank: [], recentVictims: [] }, 200);
  }
  try {
    let cacheStatus: WorkerCacheStatus = 'MISS';
    if (env.STATS_STORE) {
      try {
        const raw = await env.STATS_STORE.get(KV_CACHE_KEY_V2_STATS, 'text');
        if (raw) {
          try {
            const cached = JSON.parse(raw);
            if (cached && typeof cached === 'object') {
              cacheStatus = 'HIT';
              let hasNewMessage = false;
              try {
                const fingerprint = (url.searchParams.get('fingerprint') ?? c.req.header('X-Fingerprint') ?? '').trim();
                if (fingerprint && env.STATS_STORE) {
                  const inbox = await env.STATS_STORE.get(INBOX_PREFIX + fingerprint, 'json');
                  hasNewMessage = !!(inbox && Array.isArray(inbox) && inbox.length > 0);
                }
              } catch (_) { /* KV 故障静默，不影响缓存命中返回 */ }
              cached.hasNewMessage = hasNewMessage;
              setStatsCacheHeaders(c, cacheStatus, false, hasUnexpectedQuery);
              return c.json(cached);
            }
          } catch (parseErr) {
            console.error('[KV] 数据解析失败，疑似脏数据:', (parseErr as Error)?.message);
          }
        }
      } catch (getErr) {
        cacheStatus = 'ERROR';
      }
    }

    const [statsRes, extendedRes] = await Promise.all([
      fetchSupabase(env, `${env.SUPABASE_URL}/rest/v1/v_global_stats_v6?select=*`),
      fetchSupabase(env, `${env.SUPABASE_URL}/rest/v1/extended_stats_view?select=*`),
    ]);
    const statsData = statsRes.ok ? await statsRes.json() : [];
    const extendedData = extendedRes.ok ? await extendedRes.json() : [];
    const row = (Array.isArray(statsData) ? statsData[0] : statsData) || {};
    const extRow = (Array.isArray(extendedData) ? extendedData[0] : extendedData) || {};
    const result = {
      status: 'success',
      totalUsers: Number(row.totalUsers ?? row.total_users ?? 1),
      averages: {
        L: Number(row.avg_l ?? row.avg_L ?? row.L ?? 50),
        P: Number(row.avg_p ?? row.avg_P ?? row.P ?? 50),
        D: Number(row.avg_d ?? row.avg_D ?? row.D ?? 50),
        E: Number(row.avg_e ?? row.avg_E ?? row.E ?? 50),
        F: Number(row.avg_f ?? row.avg_F ?? row.F ?? 50),
      },
      totalAnalysis: Number(row.totalAnalysis ?? row.total_analysis ?? 0),
      totalChars: Number(row.totalChars ?? row.total_chars ?? 0),
      locationRank: Array.isArray(extRow.location_rank)
        ? extRow.location_rank
        : typeof extRow.location_rank === 'object'
          ? Object.entries(extRow.location_rank).map(([name, v]: [string, any]) => ({ name, value: Number(v) || 0 }))
          : [],
      recentVictims: Array.isArray(extRow.recent_victims) ? extRow.recent_victims : [],
    };

    // 根据请求中的 fingerprint 返回对应该用户的 hasNewMessage 状态（KV key: inbox:${fingerprint}）
    let hasNewMessage = false;
    try {
      const fingerprint = (url.searchParams.get('fingerprint') ?? c.req.header('X-Fingerprint') ?? '').trim();
      if (fingerprint && env.STATS_STORE) {
        const inbox = await env.STATS_STORE.get(INBOX_PREFIX + fingerprint, 'json');
        hasNewMessage = !!(inbox && Array.isArray(inbox) && inbox.length > 0);
      }
    } catch (_) { /* KV 故障静默，不影响基础数据 */ }
    (result as any).hasNewMessage = hasNewMessage;

    if (!hasUnexpectedQuery && env.STATS_STORE && cacheStatus !== 'ERROR') {
      try {
        // 并发 MISS 时多请求会同时触发 put，Cloudflare KV 会处理，属预期行为
        const ctx = c.executionCtx;
        if (ctx && typeof ctx.waitUntil === 'function') {
          ctx.waitUntil(
            env.STATS_STORE!.put(KV_CACHE_KEY_V2_STATS, JSON.stringify(result), { expirationTtl: 600 })
          );
        }
      } catch (_) { /* 写入失败静默，不影响响应 */ }
    }

    setStatsCacheHeaders(c, cacheStatus === 'ERROR' ? 'ERROR' : 'MISS', false, hasUnexpectedQuery);
    return c.json(result);
  } catch (e: any) {
    setStatsCacheHeaders(c, 'MISS', true, false);
    return c.json({
      status: 'error',
      error: e?.message || '查询失败',
      totalUsers: 0,
      averages: { L: 50, P: 50, D: 50, E: 50, F: 50 },
      locationRank: [],
      recentVictims: [],
      hasNewMessage: false,
    }, 200);
  }
});

/**
 * GET /api/v2/country-stats-global
 * 从 env.STATS_STORE 读取 GLOBAL_COUNTRY_STATS，供 stats2 地图热力图使用
 * 响应：{ data: [...], updated_at: "..." }
 */
app.get('/api/v2/country-stats-global', async (c) => {
  const env = c.env;
  if (!env.STATS_STORE) {
    return c.json({ status: 'success', data: [], updated_at: null });
  }
  try {
    const kv = await getGlobalCountryStatsFromKV(env);
    if (!kv) {
      return c.json({ status: 'success', data: [], updated_at: null });
    }
    return c.json({
      status: 'success',
      data: kv.country_level || [],
      updated_at: kv.updated_at || null,
    });
  } catch (e: any) {
    return c.json({ status: 'error', error: e?.message || '查询失败', data: [], updated_at: null }, 500);
  }
});

/**
 * GET /api/v2/user-stats
 * 个人实时排名：通过窗口函数 RPC 返回 rank_in_country/total_in_country、rank_global/total_global
 * Query: fingerprint=xxx 或 user_id=xxx（二者至少传一）
 */
app.get('/api/v2/user-stats', async (c) => {
  const env = c.env;
  const fingerprint = (c.req.query('fingerprint') ?? '').trim() || null;
  const userId = (c.req.query('user_id') ?? c.req.query('userId') ?? '').trim() || null;
  if (!fingerprint && !userId) {
    return c.json({ status: 'error', error: '请提供 fingerprint 或 user_id' }, 400);
  }
  if (!env.SUPABASE_URL || !env.SUPABASE_KEY) {
    return c.json({ status: 'error', error: 'Supabase 未配置' }, 500);
  }
  try {
    const rankRow = await getUserRankV2(env, fingerprint, userId);
    if (!rankRow) {
      return c.json({
        status: 'success',
        rank_in_country: null,
        total_in_country: null,
        rank_global: null,
        total_global: null,
      });
    }
    return c.json({
      status: 'success',
      rank_in_country: rankRow.rank_in_country,
      total_in_country: rankRow.total_in_country,
      rank_global: rankRow.rank_global,
      total_global: rankRow.total_global,
      ip_location: rankRow.ip_location,
    });
  } catch (e: any) {
    return c.json({ status: 'error', error: e?.message || '查询失败' }, 500);
  }
});

/**
 * GET /api/v2/location-rank
 * 返回地理位置排行，用于独立缓存
 * 防御：未预期 Query 参数用短缓存；容错返回 200 + 短缓存
 */
app.get('/api/v2/location-rank', async (c) => {
  const env = c.env;
  const url = new URL(c.req.url);
  const hasUnexpectedQuery = Array.from(url.searchParams.keys()).some((k) => !ALLOWED_V2_STATS_QUERY_KEYS.has(k));
  if (!env.SUPABASE_URL || !env.SUPABASE_KEY) {
    setStatsCacheHeaders(c, 'MISS', true, false);
    return c.json({ status: 'error', error: 'Supabase 未配置', location_rank: [] }, 200);
  }
  try {
    const res = await fetchSupabase(env, `${env.SUPABASE_URL}/rest/v1/extended_stats_view?select=location_rank`);
    const data = res.ok ? await res.json() : [];
    const row = Array.isArray(data) ? data[0] : data;
    const locationRank = row?.location_rank
      ? (Array.isArray(row.location_rank)
          ? row.location_rank
          : Object.entries(row.location_rank).map(([name, v]: [string, any]) => ({ name, value: Number(v) || 0 })))
      : [];
    setStatsCacheHeaders(c, 'MISS', false, hasUnexpectedQuery);
    return c.json({ status: 'success', location_rank: locationRank });
  } catch (e: any) {
    setStatsCacheHeaders(c, 'MISS', true, false);
    return c.json({ status: 'error', error: e?.message || '查询失败', location_rank: [] }, 200);
  }
});

// ========== 阅后即焚私信 KV 常量 ==========
const BURN_MSG_PREFIX = 'burn:msg:';
const BURN_TTL = 3600;
const INBOX_MAX_LEN = 10;

function sanitizeBurnContent(raw: string): string {
  const s = String(raw || '').slice(0, 200);
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

interface InboxItem {
  from: string;
  secretId: string;
  time: number;
  score: number;
  senderName?: string;
  senderAvatar?: string;
}

/**
 * POST /api/v2/message/send
 * 接收 toUserId, content, fromUser, score。异步写入消息体与收件箱索引，TTL 3600。
 */
app.post('/api/v2/message/send', async (c) => {
  try {
    const env = c.env;
    if (!env.STATS_STORE) {
      return c.json({ success: false, error: 'KV 未配置' }, 500);
    }
    let body: any = null;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ success: false, error: 'Invalid JSON' }, 400);
    }
    const toId = String(body?.toUserId ?? body?.toId ?? '').trim();
    const fromUser = String(body?.fromUser ?? body?.fingerprint ?? '').trim();
    const content = sanitizeBurnContent(body?.content ?? '');
    const score = Number(body?.score);
    const safeScore = Number.isFinite(score) ? Math.round(score) : 0;
    // 将请求体里的 username 和 avatar 存入目标用户 inbox KV 数组条目中
    const senderName = String(body?.username ?? body?.senderName ?? body?.toName ?? fromUser ?? '').trim() || (fromUser || '匿名');
    const senderAvatar = String(body?.avatar ?? body?.senderAvatar ?? '').trim();

    if (!toId || !content) {
      return c.json({ success: false, error: '缺少 toId 或 content' }, 400);
    }

    const secretId = crypto.randomUUID();
    const msgKey = BURN_MSG_PREFIX + secretId;
    const inboxKey = `${INBOX_PREFIX}${toId}`;
    const item: InboxItem = { from: fromUser || '匿名', secretId, time: Date.now(), score: safeScore, senderName, senderAvatar: senderAvatar || undefined };

    const ctx = c.executionCtx;
    if (ctx && typeof ctx.waitUntil === 'function') {
      ctx.waitUntil((async () => {
        try {
          await env.STATS_STORE!.put(msgKey, content, { expirationTtl: BURN_TTL });
          const raw = await env.STATS_STORE!.get(inboxKey, 'json');
          const arr: InboxItem[] = Array.isArray(raw) ? raw : [];
          arr.push(item);
          const trimmed = arr.slice(-INBOX_MAX_LEN);
          await env.STATS_STORE!.put(inboxKey, JSON.stringify(trimmed), { expirationTtl: BURN_TTL });
        } catch (e) {
          console.error('[BurnMsg] send waitUntil failed:', (e as Error)?.message);
        }
      })());
    }

    return c.json({ success: true, secretId });
  } catch (e: any) {
    console.error('[BurnMsg] send error:', e?.message);
    return c.json({ success: false, error: e?.message || '发送失败' }, 500);
  }
});

/**
 * GET /api/v2/message/inbox
 * 返回 inbox:${userId} 数组（字段 list）。
 */
app.get('/api/v2/message/inbox', async (c) => {
  try {
    const env = c.env;
    const userId = (c.req.query('userId') ?? '').trim();
    if (!userId) {
      return c.json({ list: [] });
    }
    if (!env.STATS_STORE) {
      return c.json({ list: [] });
    }
    const raw = await env.STATS_STORE.get(INBOX_PREFIX + userId, 'json');
    const arr: InboxItem[] = Array.isArray(raw) ? raw : [];
    const list = arr.map((x) => ({
      from: x.from,
      username: x.senderName ?? x.from,
      senderName: x.senderName ?? x.from,
      sender_name: x.senderName ?? x.from,
      senderAvatar: x.senderAvatar ?? '',
      sender_avatar: x.senderAvatar ?? '',
      avatar: x.senderAvatar ?? '',
      secretId: x.secretId,
      secret_id: x.secretId,
      score: x.score,
      sentAt: new Date(x.time).toISOString(),
      sent_at: new Date(x.time).toISOString(),
      createdAt: new Date(x.time).toISOString(),
      created_at: new Date(x.time).toISOString(),
    }));
    return c.json({ list });
  } catch (e: any) {
    console.warn('[BurnMsg] inbox error:', e?.message);
    return c.json({ list: [] });
  }
});

/**
 * GET /api/v2/message/read
 * 读取 burn:msg:${secretId} 后，立即 ctx.waitUntil 删除消息体并清理收件箱索引。
 */
app.get('/api/v2/message/read', async (c) => {
  try {
    const env = c.env;
    const secretId = (c.req.query('secretId') ?? '').trim();
    const userId = (c.req.query('userId') ?? '').trim();
    if (!secretId) {
      return c.json({ content: '', error: '缺少 secretId' }, 200);
    }
    if (!env.STATS_STORE) {
      return c.json({ content: '', error: 'KV 未配置' }, 200);
    }

    let content: string | null = null;
    try {
      const raw = await env.STATS_STORE.get(BURN_MSG_PREFIX + secretId, 'text');
      content = raw != null ? String(raw) : null;
    } catch {
      content = null;
    }

    const ctx = c.executionCtx;
    if (ctx && typeof ctx.waitUntil === 'function') {
      ctx.waitUntil((async () => {
        try {
          await env.STATS_STORE!.delete(BURN_MSG_PREFIX + secretId);
          if (userId) {
            const inboxKey = INBOX_PREFIX + userId;
            const raw = await env.STATS_STORE!.get(inboxKey, 'json');
            const arr: InboxItem[] = Array.isArray(raw) ? raw : [];
            const next = arr.filter((x) => x.secretId !== secretId);
            if (next.length !== arr.length) {
              await env.STATS_STORE!.put(inboxKey, JSON.stringify(next), { expirationTtl: BURN_TTL });
            }
          }
        } catch (e) {
          console.error('[BurnMsg] read waitUntil failed:', (e as Error)?.message);
        }
      })());
    }

    if (content == null || content === '') {
      return c.json({ content: '消息已自毁或过期', error: '消息已自毁或过期' }, 200);
    }
    return c.json({ content });
  } catch (e: any) {
    console.warn('[BurnMsg] read error:', e?.message);
    return c.json({ content: '', error: e?.message || '读取失败' }, 200);
  }
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
type VibeCategory = 'slang' | 'merit' | 'sv_slang' | 'phrase' | 'uncategorized_hot';

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
  phrase: new Set([]),
  uncategorized_hot: new Set([]), // 动态发现词，不做种子放大
};

function normalizeCategory(input: any): VibeCategory {
  const raw = String(input || '').trim().toLowerCase();
  if (raw === 'merit') return 'merit';
  if (raw === 'sv_slang' || raw === 'svslang' || raw === 'siliconvalley') return 'sv_slang';
  if (raw === 'phrase' || raw === 'ngram' || raw === 'idiom') return 'phrase';
  if (raw === 'uncategorized_hot' || raw === 'uncategorizedhot') return 'uncategorized_hot';
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
 * OPTIONS /api/v2/log-vibe-soul
 * 显式响应预检，确保 localhost 等跨域 preflight 收到 CORS 头（部分环境 cors 中间件对 OPTIONS 不生效时兜底）
 */
app.options('/api/v2/log-vibe-soul', (c) => {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Fingerprint, Cache-Control, Authorization, X-Requested-With, x-fingerprint, x-intent, X-Intent, Accept',
      'Access-Control-Max-Age': '86400',
    },
  });
});

/**
 * POST /api/v2/log-vibe-soul
 * 灵魂词上报：接收 p(phrase), c(level), v(value/count), f(fingerprint), country，写入 KV
 * Key: soul:${country}:${level}:${phrase}  Value: 次数|指纹1,指纹2（指纹不重复）
 * Query ?immediate=true：存入 KV 后立即在后台执行一次 runSoulWordHourlyRollup（即时入库调试）
 */
app.post('/api/v2/log-vibe-soul', async (c) => {
  try {
    const env = c.env as Env;
    // 健壮性：未绑定 KV 时明确提示，防止崩溃
    const kv = env.KV_VIBE_PROD;
    if (!kv) {
      console.warn('[Worker] log-vibe-soul: KV_VIBE_PROD 未绑定，请与 wrangler.toml 保持一致');
      return c.json({ success: false, error: 'KV 未配置' }, 500);
    }

    let body: any = null;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ success: false, error: 'Invalid JSON' }, 400);
    }

    const phrase = String(body?.p ?? body?.phrase ?? '').trim();
    const levelRaw = String(body?.c ?? body?.category ?? body?.level ?? '').trim();
    const v = Number(body?.v ?? body?.value ?? body?.count ?? 1);
    const fingerprint = String(body?.f ?? body?.fingerprint ?? '').trim();
    const countryFromBody = String(body?.country ?? '').trim().toUpperCase();

    if (!phrase || phrase.length < 2 || phrase.length > 120) {
      return c.json({ success: false, error: 'phrase 无效' }, 400);
    }

    const validLevels = ['Novice', 'Professional', 'Architect', 'Native'];
    const level = validLevels.includes(levelRaw) ? levelRaw : 'Novice';

    const countryCf = (c.req.raw as any)?.cf?.country ?? 'UN';
    const countryCode = /^[A-Za-z]{2}$/.test(countryFromBody)
      ? countryFromBody
      : (/^[A-Za-z]{2}$/.test(String(countryCf)) ? String(countryCf).toUpperCase() : 'UN');

    console.log('[Worker] 灵魂词上报 收到:', { phrase, level, value: v, country: countryCode });

    const key = `soul:${countryCode}:${level}:${phrase}`;
    const existing = await kv.get(key, 'text');
    let newValue: string;
    if (existing != null) {
      const parts = existing.split('|');
      const oldCount = parseInt(parts[0], 10) || 0;
      const addCount = Number.isFinite(v) && v > 0 ? Math.floor(v) : 1;
      const fps = parts[1] ? new Set(parts[1].split(',').filter(Boolean)) : new Set<string>();
      if (fingerprint) fps.add(fingerprint);
      newValue = `${oldCount + addCount}|${Array.from(fps).join(',')}`;
    } else {
      newValue = fingerprint ? `${Number.isFinite(v) && v > 0 ? Math.floor(v) : 1}|${fingerprint}` : `${Number.isFinite(v) && v > 0 ? Math.floor(v) : 1}|`;
    }
    await kv.put(key, newValue, { expirationTtl: 86400 });
    console.log('[KV] 已存入灵魂词:', key);

    try {
      const url = new URL(c.req.url);
      if (url.searchParams.get('immediate') === 'true') {
        const ctx = c.executionCtx;
        if (ctx && typeof (ctx as any).waitUntil === 'function') {
          (ctx as any).waitUntil(runSoulWordHourlyRollup(env));
          console.log('[Worker] 已排队即时灵魂词汇总（immediate=true）');
        } else {
          await runSoulWordHourlyRollup(env);
          console.log('[Worker] 即时灵魂词汇总完成（immediate=true）');
        }
      }
    } catch (immediateErr: any) {
      console.warn('[Worker] log-vibe-soul immediate=true 执行失败:', immediateErr?.message || String(immediateErr));
    }

    return c.json({ success: true, status: 'success' }, 200, {
      'Access-Control-Allow-Origin': '*',
    });
  } catch (err: any) {
    console.error('[Worker] /api/v2/log-vibe-soul 错误:', err?.message || String(err));
    return c.json({ success: false, error: '上报失败' }, 500, {
      'Access-Control-Allow-Origin': '*',
    });
  }
});

/**
 * GET /api/v2/my-soul-words
 * 查询用户的灵魂词统计（根据 fingerprint）
 * Query: f=fingerprint
 * 返回：{ status: 'success', data: [{ phrase, country, hit_count, rank }, ...] }
 */
app.get('/api/v2/my-soul-words', async (c) => {
  const env = c.env;
  if (!env.SUPABASE_URL || !env.SUPABASE_KEY) {
    return c.json({ status: 'error', error: 'Supabase 未配置' }, 500);
  }

  const fingerprint = (c.req.query('f') ?? c.req.query('fingerprint') ?? '').trim();
  if (!fingerprint) {
    return c.json({ status: 'error', error: 'fingerprint 参数必填' }, 400);
  }

  try {
    const rpcUrl = `${env.SUPABASE_URL}/rest/v1/rpc/get_user_soul_words`;
    const rows = await fetchSupabaseJson<any[]>(env, rpcUrl, {
      method: 'POST',
      headers: buildSupabaseHeaders(env, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ p_fingerprint: fingerprint }),
    }, SUPABASE_FETCH_TIMEOUT_MS);

    const data = (Array.isArray(rows) ? rows : []).map((r: any) => ({
      phrase: String(r?.phrase || ''),
      country: String(r?.country || ''),
      hit_count: Number(r?.hit_count) || 0,
      rank: Number(r?.rank) || 0,
    }));

    return c.json({ status: 'success', data, total: data.length });
  } catch (err: any) {
    console.error('[Worker] /api/v2/my-soul-words 错误:', err?.message || String(err));
    return c.json({ status: 'error', error: '查询失败' }, 500);
  }
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
 * GET /api/v2/stats/keywords?region=CN（或 country=CN）
 * 返回按 Novice/Professional/Architect 聚合的该国词云数据，供 stats2 右抽屉“本国词云”按身份 Tab 展示。
 * - 去噪：剔除长度 1 的字符，且该国总频次 > 2 才进入统计。
 * - 输出：{ Novice: [{ phrase, weight }], Professional: [...], Architect: [...], globalNative: [...] }
 */
/**
 * GET /api/v2/stats/keywords?region=CN
 * 关键词统计聚合接口：从 user_analysis 表聚合 identityLevelCloud 数据
 * 
 * @param region - 国家代码（2位ISO代码），默认为 'CN'
 * @returns { status: 'success', data: { Novice: [], Professional: [], Architect: [] } }
 */
app.get('/api/v2/stats/keywords', async (c) => {
  const env = c.env;
  c.header('Cache-Control', 'public, max-age=60');

  const regionRaw = (c.req.query('region') || c.req.query('country') || 'CN').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(regionRaw)) {
    return c.json({ status: 'error', error: 'Invalid region/country (expect 2-letter ISO code)' }, 400);
  }

  type Item = { phrase: string; weight: number };
  const out: { Novice: Item[]; Professional: Item[]; Architect: Item[] } = {
    Novice: [],
    Professional: [],
    Architect: [],
  };

  if (!env.SUPABASE_URL || !env.SUPABASE_KEY) {
    return c.json({ status: 'success', data: out });
  }

  try {
    // 【第一步】优先从视图 v_keyword_stats_by_country 查询（聚合更精准且性能更好）
    const viewUrl = new URL(`${env.SUPABASE_URL}/rest/v1/v_keyword_stats_by_country`);
    viewUrl.searchParams.set('select', 'phrase,category,hit_count');
    viewUrl.searchParams.set('country_code', `eq.${regionRaw}`);
    viewUrl.searchParams.set('order', 'hit_count.desc');
    viewUrl.searchParams.set('limit', '300');

    let viewRows: any[] = [];
    try {
      viewRows = await fetchSupabaseJson<any[]>(env, viewUrl.toString(), {
        headers: buildSupabaseHeaders(env),
      });
    } catch (e) {
      console.warn('[Worker] /api/v2/stats/keywords 视图查询失败，回退 user_analysis:', e);
    }

    if (Array.isArray(viewRows) && viewRows.length > 0) {
      for (const r of viewRows) {
        const phrase = String(r?.phrase || '').trim();
        const weight = Number(r?.hit_count ?? 1) || 1;
        const category = String(r?.category || '').trim();
        if (!phrase || weight <= 0) continue;

        if (category === 'Novice') {
          out.Novice.push({ phrase, weight });
        } else if (category === 'Architect') {
          out.Architect.push({ phrase, weight });
          // Architect 关键词也算作 Professional
          out.Professional.push({ phrase, weight });
        } else {
          // Senior/Expert/Master/Professional 都放入 Professional
          out.Professional.push({ phrase, weight });
        }
      }
      
      // 去重并排序
      for (const level of ['Novice', 'Professional', 'Architect'] as const) {
        const map = new Map<string, number>();
        for (const item of out[level]) {
          map.set(item.phrase, (map.get(item.phrase) || 0) + item.weight);
        }
        out[level] = Array.from(map.entries())
          .map(([phrase, weight]) => ({ phrase, weight }))
          .sort((a, b) => b.weight - a.weight)
          .slice(0, 50);
      }

      if (out.Novice.length > 0 || out.Professional.length > 0) {
        return c.json({ status: 'success', data: out });
      }
    }

    // 【第二步】兜底：从 user_analysis 表查询；词云优先读 identity_cloud 列，兼容 stats.identityLevelCloud
    const uaUrl = new URL(`${env.SUPABASE_URL}/rest/v1/user_analysis`);
    uaUrl.searchParams.set('select', 'stats,identity_cloud');
    uaUrl.searchParams.set('country_code', `eq.${regionRaw}`);
    uaUrl.searchParams.set('total_messages', 'gt.5');
    uaUrl.searchParams.set('order', 'updated_at.desc');
    uaUrl.searchParams.set('limit', '100');
    
    const uaRows = await fetchSupabaseJson<any[]>(env, uaUrl.toString(), {
      headers: buildSupabaseHeaders(env),
    });

    if (Array.isArray(uaRows) && uaRows.length > 0) {
      const wordCounts: {
        Novice: Map<string, number>;
        Professional: Map<string, number>;
        Architect: Map<string, number>;
      } = {
        Novice: new Map(),
        Professional: new Map(),
        Architect: new Map(),
      };

      for (const row of uaRows) {
        const stats = row?.stats;
        let ilc = row?.identity_cloud ?? (stats && typeof stats === 'object' ? stats.identityLevelCloud : null);
        if (!ilc || (typeof ilc === 'object' && Object.keys(ilc).length === 0)) {
          if (stats && typeof stats === 'object') {
            const raw = stats.vibe_lexicon ?? stats.personality?.vibe_lexicon;
            if (raw && typeof raw === 'object') ilc = vibeLexiconToIdentityLevelCloud(raw);
          }
        }
        if (!ilc || typeof ilc !== 'object') continue;
        // 遍历所有可能的键
        const allKeys = Object.keys(ilc);
        for (const key of allKeys) {
          const levelData = ilc[key];
          if (!Array.isArray(levelData)) continue;

          for (const item of levelData) {
            const phrase = String(item?.word ?? item?.phrase ?? item?.w ?? '').trim();
            const count = Number(item?.count ?? item?.weight ?? item?.v ?? 0) || 1;
            if (phrase.length <= 1 || count <= 0) continue;

            if (key === 'Novice') {
              wordCounts.Novice.set(phrase, (wordCounts.Novice.get(phrase) || 0) + count);
            } else if (key === 'Architect') {
              wordCounts.Architect.set(phrase, (wordCounts.Architect.get(phrase) || 0) + count);
              wordCounts.Professional.set(phrase, (wordCounts.Professional.get(phrase) || 0) + count);
            } else {
              // 其他非小白等级均计入 Professional
              wordCounts.Professional.set(phrase, (wordCounts.Professional.get(phrase) || 0) + count);
            }
          }
        }
      }

      for (const level of ['Novice', 'Professional', 'Architect'] as const) {
        const map = wordCounts[level];
        out[level] = Array.from(map.entries())
          .map(([phrase, weight]) => ({ phrase, weight }))
          .sort((a, b) => b.weight - a.weight)
          .slice(0, 50);
      }
    }

    // 无 Supabase 数据时返回空，不再使用 identityWordBanks 硬编码兜底，避免前端显示与后台脱节
    // 前端将显示「暂无该国词云数据」，待 keyword_logs / user_analysis 有真实数据后即可展示
    return c.json({ status: 'success', data: out });
  } catch (e: any) {
    console.warn('[Worker] /api/v2/stats/keywords 查询失败:', regionRaw, e?.message || String(e));
    return c.json({ status: 'success', data: out });
  }
});


/**
 * 【国家摘要】GET /api/country-summary?country=CN（get_country_summary_v3）
 * 功能：按国家代码拉取该国家的 10 项核心指标（Vibe 指数、对话总数等），供校准后右侧抽屉渲染
 */
app.get('/api/country-summary', async (c) => {
  try {
    const env = c.env;
    if (!env.SUPABASE_URL || !env.SUPABASE_KEY) {
      return c.json({ success: false, error: 'Supabase 未配置' }, 500);
    }

    // 【鲁棒性参数】同时兼容 cc 和 country 参数，强制大写
    const ccRaw = (c.req.query('cc') || c.req.query('country') || '').trim();
    const hasExplicitCc = ccRaw.length > 0;
    let countryCodeRaw = ccRaw;
    if (!countryCodeRaw) {
      try {
        const rawReq: any = c.req?.raw;
        const cfCountry = String(rawReq?.cf?.country || '').trim().toUpperCase();
        if (cfCountry && /^[A-Z]{2}$/.test(cfCountry)) countryCodeRaw = cfCountry;
      } catch (e) { /* ignore */ }
    }
    if (!countryCodeRaw) countryCodeRaw = 'US';
    const countryCode = String(countryCodeRaw).toUpperCase();
    if (!/^[A-Z]{2}$/.test(countryCode)) {
      return c.json({ success: false, error: 'country/cc 必须是 2 位国家代码（如 US、CN）' }, 400);
    }

    const countryNameRaw = (c.req.query('country_name') || c.req.query('countryName') || '').trim();
    const fingerprint = (c.req.query('fingerprint') || c.req.query('fp') || '').trim();
    const userId = (c.req.query('user_id') || c.req.query('userId') || c.req.query('id') || '').trim();
    const cc = countryCode;
    const country = cc;

    const n = (v: any) => {
      const x = Number(v ?? 0);
      return Number.isFinite(x) ? x : 0;
    };
    const ni = (v: any) => {
      const x = Math.round(Number(v ?? NaN));
      return Number.isFinite(x) && x > 0 ? x : null;
    };
    const mkRank = (rankVal: any, totalVal: number) => {
      const r = ni(rankVal);
      if (!r || totalVal <= 0) return null;
      return { rank: r, total: totalVal };
    };

    // total_countries 为 1 时所有排名字段都不能为 null，必须返回 { rank: 1, total: 1 }
    const safeRank = (rankVal: any, totalVal: number): { rank: number; total: number } => {
      const t = Math.max(1, totalVal <= 0 ? 1 : totalVal);
      if (t <= 1) return { rank: 1, total: 1 };
      const r = ni(rankVal);
      if (r != null && r > 0) return { rank: Math.min(r, t), total: t };
      return { rank: 1, total: t };
    };

    // ----------------------------
    // 【优先读取 STATS_STORE】api/country-summary 词云数据源仅来自 KV：global_stats_v4_${countryCode}；禁止查询时实时计算
    // ----------------------------
    const refresh = c.req.query('refresh') === 'true';
    const cacheKey = `global_stats_v4_${countryCode}`;

    let identityLevelCloudUpdatedAt: string | null = null;
    if (hasExplicitCc && env.STATS_STORE) {
      try {
        if (refresh) await aggregateCountryCloudDepth(env, cc);
        let kvRaw = await env.STATS_STORE.get(cacheKey, 'text');
        if (!kvRaw || kvRaw === '') {
          await aggregateCountryCloudDepth(env, cc);
          kvRaw = await env.STATS_STORE.get(cacheKey, 'text');
        }
        if (kvRaw) {
          try {
            const parsed = JSON.parse(kvRaw);
            const ilc = parsed?.identityLevelCloud;
            if (ilc && typeof ilc === 'object') {
              const emptyArr: Array<{ word: string; count: number; fingerprints?: string[] }> = [];
              const hasAny = (Array.isArray(ilc.Novice) && ilc.Novice.length > 0) || (Array.isArray(ilc.Professional) && ilc.Professional.length > 0) || (Array.isArray(ilc.Architect) && ilc.Architect.length > 0);
              if (hasAny) {
                identityLevelCloudFromKV = {
                  Novice: Array.isArray(ilc.Novice) ? ilc.Novice : (Array.isArray(parsed.novice) ? parsed.novice : emptyArr),
                  Professional: Array.isArray(ilc.Professional) ? ilc.Professional : (Array.isArray(parsed.professional) ? parsed.professional : emptyArr),
                  Architect: Array.isArray(ilc.Architect) ? ilc.Architect : (Array.isArray(parsed.architect) ? parsed.architect : emptyArr),
                };
              } else {
                await aggregateCountryCloudDepth(env, cc);
                const retryRaw = await env.STATS_STORE.get(cacheKey, 'text');
                if (retryRaw) {
                  const retryParsed = JSON.parse(retryRaw);
                  const retryIlc = retryParsed?.identityLevelCloud;
                  if (retryIlc && typeof retryIlc === 'object') {
                    const emptyArr: Array<{ word: string; count: number; fingerprints?: string[] }> = [];
                    identityLevelCloudFromKV = {
                      Novice: Array.isArray(retryIlc.Novice) ? retryIlc.Novice : emptyArr,
                      Professional: Array.isArray(retryIlc.Professional) ? retryIlc.Professional : emptyArr,
                      Architect: Array.isArray(retryIlc.Architect) ? retryIlc.Architect : emptyArr,
                    };
                    if (retryParsed?.updated_at) identityLevelCloudUpdatedAt = retryParsed.updated_at;
                  }
                }
              }
            }
            if (parsed?.updated_at && typeof parsed.updated_at === 'string') identityLevelCloudUpdatedAt = parsed.updated_at;
          } catch (_) { /* KV 解析失败则保持 null，后面返回空数组 */ }
        }
      } catch (e) {
        console.warn('[Worker] country-summary 读 KV 词云失败:', e);
      }
    }

    // ----------------------------
    // 【优先】国家累积：从 v_country_stats 视图读取（country_code 匹配 cc）
    // 无视图或失败时再走 KV / RPC / 直接查询
    // ----------------------------
    const debugFlag = String(c.req.query('debug') || '').trim();
    const forceRefresh = debugFlag === '1' || debugFlag.toLowerCase() === 'true' || refresh;
    const kvCountry = await getGlobalCountryStatsFromKV(env);
    let row: any = null;
    let countryRow: any = null;
    let countryTotalUsers = 0;
    let totalCountries = 0;
    let totals: any;
    let countryTotalsRanks: any;
    /** 仅从 KV 读取，禁止查询时实时计算；KV 为空则返回空数组；项可含 fingerprints 供前端灵魂高亮 */
    let identityLevelCloudFromKV: { Novice: Array<{ word: string; count: number; fingerprints?: string[] }>; Professional: Array<{ word: string; count: number; fingerprints?: string[] }>; Architect: Array<{ word: string; count: number; fingerprints?: string[] }> } | null = null;

    // SUM/RANK 仅在请求带 cc 或 country 参数时生效，不修改 Global 视图的 fetch 逻辑
    let viewCountryRow: any = null;
    if (hasExplicitCc) {
    try {
      // 优先用 v_country_stats 返回该国 total_chars / total_messages / total_work_days 等真实聚合（兼容 country_code 与 country 列）
      const viewUrl = new URL(`${env.SUPABASE_URL}/rest/v1/v_country_stats`);
      viewUrl.searchParams.set('select', '*');
      viewUrl.searchParams.set('limit', '1');
      viewUrl.searchParams.set('or', `(country_code.eq.${cc},country.eq.${cc})`);
      let viewRows = await fetchSupabaseJson<any[]>(
        env,
        viewUrl.toString(),
        { headers: buildSupabaseHeaders(env) },
        SUPABASE_FETCH_TIMEOUT_MS
      ).catch(() => []);
      viewCountryRow = Array.isArray(viewRows) && viewRows.length > 0 ? viewRows[0] : null;
    } catch {
      viewCountryRow = null;
    }

    const getViewNum = (r: any, ...keys: string[]): number => {
      if (!r) return 0;
      for (const k of keys) {
        const v = r[k];
        if (v !== undefined && v !== null && (typeof v === 'number' || !Number.isNaN(Number(v)))) return Number(v) || 0;
      }
      return 0;
    };

    if (viewCountryRow) {
      const tm = getViewNum(viewCountryRow, 'total_messages', 'totalmessages', 'totalMessages', 'msg_count');
      const tc = getViewNum(viewCountryRow, 'total_chars', 'totalchars', 'totalChars', 'total_chars_sum');
      const wd = getViewNum(viewCountryRow, 'total_work_days', 'work_days', 'work_days_sum', 'totaldays');
      const jc = getViewNum(viewCountryRow, 'total_jiafang', 'jiafang_count', 'jiafang_count_sum', 'totalno');
      const kc = getViewNum(viewCountryRow, 'total_ketao', 'ketao_count', 'ketao_count_sum', 'totalplease');
      const hasAny = tc > 0 || wd > 0 || jc > 0 || kc > 0 || tm > 0;
      if (hasAny) {
        row = viewCountryRow;
        const tuc = getViewNum(viewCountryRow, 'total_user_chars', 'total_chars', 'totalchars') || tc;
        countryTotalUsers = getViewNum(viewCountryRow, 'total_users', 'user_count', 'total_users_sum') || 0;
        totalCountries = Math.max(1, getViewNum(viewCountryRow, 'total_countries') || 1);
        const avgLen = tm > 0 ? tuc / tm : 0;
        totals = {
          totalUsers: countryTotalUsers,
          total_messages_sum: tm,
          total_user_chars_sum: tuc,
          total_chars_sum: tc,
          jiafang_count_sum: jc,
          ketao_count_sum: kc,
          avg_user_message_length_sum: avgLen,
          work_days_sum: wd,
          source: 'V_COUNTRY_STATS',
        };
        countryTotalsRanks = {
          total_messages: safeRank(viewCountryRow.rank_total_messages ?? viewCountryRow.rank_messages, totalCountries),
          total_chars: safeRank(viewCountryRow.rank_total_chars ?? viewCountryRow.rank_chars, totalCountries),
          jiafang_count: safeRank(viewCountryRow.rank_jiafang ?? viewCountryRow.rank_no, totalCountries),
          ketao_count: safeRank(viewCountryRow.rank_ketao ?? viewCountryRow.rank_please, totalCountries),
          avg_user_message_length: safeRank(viewCountryRow.rank_avg_len ?? viewCountryRow.rank_word, totalCountries),
          work_days: safeRank(viewCountryRow.rank_work_days ?? viewCountryRow.rank_days, totalCountries),
          _meta: { totalCountries, no_competition: countryTotalUsers <= 1 },
        };
      } else {
        viewCountryRow = null;
      }
    }

    // ----------------------------
    // 【异步聚合 + KV 缓存】国家累积：无视图时从 KV 读取，KV 无数据时降级调用 RPC
    // ----------------------------
    let shouldSkipKV = forceRefresh;
    
    if (!totals && !shouldSkipKV && kvCountry?.country_level?.length) {
      countryRow = kvCountry.country_level.find((it: any) => String(it?.country_code || '').trim().toUpperCase() === cc);
      if (countryRow) {
        const tm = Number(countryRow.total_messages_sum ?? 0) || 0;
        const tc = Number(countryRow.total_chars_sum ?? 0) || 0;
        const wd = Number(countryRow.work_days_sum ?? 0) || 0;
        const jc = Number(countryRow.jiafang_count_sum ?? 0) || 0;
        const kc = Number(countryRow.ketao_count_sum ?? 0) || 0;
        if (tm === 0 && tc === 0 && wd === 0 && jc === 0 && kc === 0) {
          shouldSkipKV = true;
          countryRow = null;
        } else {
          shouldSkipKV = false;
        }
      }
    }

    // 【国家视图】有明确国家码时不再用 KV 汇总，仅用 v_country_stats / RPC / 直接查询，避免返回全局平均
    if (!totals && !shouldSkipKV && countryRow && !hasExplicitCc) {
      row = countryRow;
      // 【强制类型转换】使用 Number() 强制转换所有数值（尤其是 total_say/total_chars）
      countryTotalUsers = Number(countryRow.total_users ?? 0) || 0;
      totalCountries = Number(countryRow.total_countries ?? 0) || Math.max(1, kvCountry.country_level.length);
      const tm = Number(countryRow.total_messages_sum ?? 0) || 0;
      const tuc = Number(countryRow.total_user_chars_sum ?? 0) || 0;
      const tc = Number(countryRow.total_chars_sum ?? 0) || 0; // total_say
      const jc = Number(countryRow.jiafang_count_sum ?? 0) || 0;
      const kc = Number(countryRow.ketao_count_sum ?? 0) || 0;
      const avgLen = Number(countryRow.avg_user_message_length_sum ?? 0) || (tm > 0 ? (tuc / tm) : 0);
      const wd = Number(countryRow.work_days_sum ?? 0) || 0;
      totals = {
        totalUsers: countryTotalUsers,
        total_messages_sum: tm,
        total_user_chars_sum: tuc,
        total_chars_sum: tc,
        jiafang_count_sum: jc,
        ketao_count_sum: kc,
        avg_user_message_length_sum: avgLen,
        work_days_sum: wd,
        source: 'GLOBAL_COUNTRY_STATS',
      };
      countryTotalsRanks = {
        total_messages: safeRank(countryRow.rank_total_messages, totalCountries),
        total_chars: safeRank(countryRow.rank_total_chars, totalCountries),
        jiafang_count: safeRank(countryRow.rank_jiafang, totalCountries),
        ketao_count: safeRank(countryRow.rank_ketao, totalCountries),
        avg_user_message_length: safeRank(countryRow.rank_avg_len, totalCountries),
        work_days: safeRank(countryRow.rank_work_days, totalCountries),
        _meta: { totalCountries, no_competition: !!countryRow.no_competition },
      };
    }

    // 降级：KV 无数据时调用 RPC get_country_ranks_v3 实时获取排名
    if (!totals) {
      try {
        const rpcUrl = `${env.SUPABASE_URL}/rest/v1/rpc/get_country_ranks_v3`;
        const rpcRows = await fetchSupabaseJson<any[]>(env, rpcUrl, {
          method: 'POST',
          headers: buildSupabaseHeaders(env, { 'Content-Type': 'application/json' }),
          body: JSON.stringify({}),
        }, SUPABASE_FETCH_TIMEOUT_MS).catch(() => []);
        const rpcList = Array.isArray(rpcRows) ? rpcRows : [];
        const countryRow = rpcList.find((it: any) => String(it?.country_code || '').trim().toUpperCase() === cc);
        totalCountries = Math.max(1, rpcList.length);

        if (countryRow) {
          row = countryRow;
          // 【强制类型转换】使用 Number() 强制转换所有数值（尤其是 total_say/total_chars）
          countryTotalUsers = Number(countryRow.total_users ?? 0) || 0;
          // 【重构映射】直接使用新视图字段名（tm, tc, wd, jc, kc, tuc），强制类型转换
          const tm = Number(countryRow.tm ?? countryRow.total_messages ?? 0) || 0;
          const tuc = Number(countryRow.tuc ?? countryRow.total_user_chars ?? 0) || 0;
          const tc = Number(countryRow.tc ?? countryRow.total_chars ?? 0) || 0; // total_say
          const jc = Number(countryRow.jc ?? countryRow.jiafang_count ?? 0) || 0;
          const kc = Number(countryRow.kc ?? countryRow.ketao_count ?? 0) || 0;
          const wd = Number(countryRow.wd ?? countryRow.work_days_sum ?? 0) || 0;
          const avgLen = tm > 0 ? (tuc / tm) : 0;
          totals = {
            totalUsers: countryTotalUsers,
            total_messages_sum: tm,
            total_user_chars_sum: tuc,
            total_chars_sum: tc,
            jiafang_count_sum: jc,
            ketao_count_sum: kc,
            avg_user_message_length_sum: avgLen,
            work_days_sum: wd,
            source: 'RPC_FALLBACK',
          };
          // RPC 返回的排名字段：rank_l(total_messages), rank_m(total_chars), rank_o(avg_len), rank_p(jiafang), rank_g(ketao), rank_h(work_days)
          countryTotalsRanks = {
            total_messages: safeRank(countryRow.rank_l, totalCountries),
            total_chars: safeRank(countryRow.rank_m, totalCountries),
            jiafang_count: safeRank(countryRow.rank_p, totalCountries),
            ketao_count: safeRank(countryRow.rank_g, totalCountries),
            avg_user_message_length: safeRank(countryRow.rank_o, totalCountries),
            work_days: safeRank(countryRow.rank_h, totalCountries),
            _meta: { totalCountries, no_competition: countryTotalUsers <= 1 },
          };
        }
      } catch (rpcErr) {
        console.warn('[Worker] get_country_ranks_v3 RPC 降级失败:', rpcErr);
      }
    }

    // 【最终降级：直接查基表】RPC 失败时查 user_analysis，四字段任一为国即计入该国（中文用户上报 CN 即进中国区）
    if (!totals) {
      try {
        const directQueryUrl = new URL(`${env.SUPABASE_URL}/rest/v1/user_analysis`);
        directQueryUrl.searchParams.set('select', 'total_messages,total_chars,work_days,jiafang_count,ketao_count,fingerprint');
        directQueryUrl.searchParams.set('or', `(country_code.eq.${cc},ip_location.eq.${cc},manual_location.eq.${cc},current_location.eq.${cc})`);

        const directRows = await fetchSupabaseJson<any[]>(
          env,
          directQueryUrl.toString(),
          { headers: buildSupabaseHeaders(env) },
          SUPABASE_FETCH_TIMEOUT_MS
        ).catch(() => []);

        if (Array.isArray(directRows) && directRows.length > 0) {
          const sumTm = directRows.reduce((s, r) => s + (Number(r.total_messages) || 0), 0);
          const sumTc = directRows.reduce((s, r) => s + (Number(r.total_chars) || 0), 0);
          const sumWd = directRows.reduce((s, r) => s + (Number(r.work_days) || 0), 0);
          const sumJc = directRows.reduce((s, r) => s + (Number(r.jiafang_count) || 0), 0);
          const sumKc = directRows.reduce((s, r) => s + (Number(r.ketao_count) || 0), 0);
          const sumTuc = directRows.reduce((s, r) => s + (Number(r.total_chars) || 0), 0);
          const uniqueUsers = new Set<string>();
          directRows.forEach((r: any) => { if (r?.fingerprint) uniqueUsers.add(String(r.fingerprint)); });

          row = {
            tm: sumTm,
            tc: sumTc,
            wd: sumWd,
            jc: sumJc,
            kc: sumKc,
            tuc: sumTuc,
            total_users: uniqueUsers.size,
            country_code: cc,
          };

          countryTotalUsers = uniqueUsers.size;
          totalCountries = 1;

          const tm = Number(sumTm) || 0;
          const tc = Number(sumTc) || 0;
          const tuc = Number(sumTuc) || 0;
          const jc = Number(sumJc) || 0;
          const kc = Number(sumKc) || 0;
          const wd = Number(sumWd) || 0;
          const avgLen = tm > 0 ? (tuc / tm) : 0;

          totals = {
            totalUsers: countryTotalUsers,
            total_messages_sum: tm,
            total_user_chars_sum: tuc,
            total_chars_sum: tc,
            jiafang_count_sum: jc,
            ketao_count_sum: kc,
            avg_user_message_length_sum: avgLen,
            work_days_sum: wd,
            source: 'DIRECT_QUERY_FALLBACK',
          };
          
          // total_countries 为 1 时所有字段都不能为 null，必须返回 { rank: 1, total: 1 }
          countryTotalsRanks = {
            total_messages: safeRank(1, 1),
            total_chars: safeRank(1, 1),
            jiafang_count: safeRank(1, 1),
            ketao_count: safeRank(1, 1),
            avg_user_message_length: safeRank(1, 1),
            work_days: safeRank(1, 1),
            _meta: { totalCountries: 1, no_competition: countryTotalUsers <= 1 },
          };

          // 词云仅从 KV 读取，此处不再查 country_lexicon_cache / 单用户
        }
      } catch (directErr) {
        console.warn('[Worker] 直接查询视图降级失败:', directErr);
      }
    }
    }

    // 最终降级：RPC 也失败时返回预设空值，排名字段仍返回 1/1 避免 null
    if (!totals) {
      const noCompetition = row?.no_competition ?? true;
      countryTotalUsers = 0;
      totalCountries = 1;
      totals = {
        totalUsers: 0,
        total_messages_sum: 0,
        total_user_chars_sum: 0,
        total_chars_sum: 0,
        jiafang_count_sum: 0,
        ketao_count_sum: 0,
        avg_user_message_length_sum: 0,
        work_days_sum: 0,
        source: 'preset_no_group_by',
      };
      countryTotalsRanks = {
        total_messages: safeRank(1, 1),
        total_chars: safeRank(1, 1),
        jiafang_count: safeRank(1, 1),
        ketao_count: safeRank(1, 1),
        avg_user_message_length: safeRank(1, 1),
        work_days: safeRank(1, 1),
        _meta: { totalCountries: 1, no_competition: noCompetition },
      };
    }

    // 【国家透视词云】仅从 KV 读取，禁止查询时实时计算；由 sync-soul-words 触发深度聚合写入

    // 【强制类型转换】使用 Number() 强制转换所有数值（尤其是 total_say/total_chars）
    const totalMessages = Number(totals?.total_messages_sum ?? 0) || 0;
    const totalChars = Number(totals?.total_chars_sum ?? 0) || 0; // total_say
    const totalUserChars = Number(totals?.total_user_chars_sum ?? 0) || totalChars;
    const avgPerUser = countryTotalUsers > 0 ? Math.round(totalChars / countryTotalUsers) : 0;
    const avgPerScan = totalMessages > 0 ? Math.round(totalChars / totalMessages) : 0;

    // ✅ 雷达图维度平均：国家视图用该国 l/p/d/e/f 平均，否则用全站平均
    let avgDims = { L: 50, P: 50, D: 50, E: 50, F: 50 };
    const clamp = (x: any) => {
      const v = Number(x);
      if (!Number.isFinite(v)) return 0;
      return Math.max(0, Math.min(100, v));
    };
    const applyAvgFromRow = (r0: any): boolean => {
      if (!r0) return false;
      const L = clamp(r0.avg_l);
      const P = clamp(r0.avg_p);
      const D = clamp(r0.avg_d);
      const E = clamp(r0.avg_e);
      const F = clamp(r0.avg_f);
      if ([L, P, D, E, F].some((v) => v > 0)) {
        avgDims = { L, P, D, E, F };
        return true;
      }
      return false;
    };
    try {
      // 国家视图：优先按该国 current_location/country_code 聚合 L/P/D/E/F 平均
      if (hasExplicitCc && cc) {
        const countryAvgUrl = new URL(`${env.SUPABASE_URL}/rest/v1/user_analysis`);
        // PostgREST 不支持在普通表上直接使用 avg() 语法，需拉取对应数据在此聚合
        countryAvgUrl.searchParams.set('select', 'l_score,p_score,d_score,e_score,f_score');
        countryAvgUrl.searchParams.set('or', `(country_code.eq.${cc},ip_location.eq.${cc},manual_location.eq.${cc},current_location.eq.${cc})`);
        countryAvgUrl.searchParams.set('limit', '5000');
        const countryRows = await fetchSupabaseJson<any[]>(env, countryAvgUrl.toString(), { headers: buildSupabaseHeaders(env) }, SUPABASE_FETCH_TIMEOUT_MS).catch(() => []);
        
        let hasValidData = false;
        if (Array.isArray(countryRows) && countryRows.length > 0) {
          let sum_l = 0, sum_p = 0, sum_d = 0, sum_e = 0, sum_f = 0;
          let validCount = 0;
          for (const r of countryRows) {
            sum_l += Number(r.l_score) || 50;
            sum_p += Number(r.p_score) || 50;
            sum_d += Number(r.d_score) || 50;
            sum_e += Number(r.e_score) || 50;
            sum_f += Number(r.f_score) || 50;
            validCount++;
          }
          if (validCount > 0) {
            const countryR0 = {
              avg_l: sum_l / validCount,
              avg_p: sum_p / validCount,
              avg_d: sum_d / validCount,
              avg_e: sum_e / validCount,
              avg_f: sum_f / validCount
            };
            if (applyAvgFromRow(countryR0)) {
              hasValidData = true;
            }
          }
        }
        
        if (!hasValidData) {
          // 该国无有效维度数据，回退全站平均
          const avgUrl = new URL(`${env.SUPABASE_URL}/rest/v1/v_unified_analysis_v2`);
          avgUrl.searchParams.set('select', 'avg_l:avg(l_score),avg_p:avg(p_score),avg_d:avg(d_score),avg_e:avg(e_score),avg_f:avg(f_score)');
          avgUrl.searchParams.set('limit', '1');
          const rows = await fetchSupabaseJson<any[]>(env, avgUrl.toString(), { headers: buildSupabaseHeaders(env) }, SUPABASE_FETCH_TIMEOUT_MS).catch(() => []);
          const r0 = Array.isArray(rows) ? (rows[0] || null) : null;
          applyAvgFromRow(r0);
        }
      } else {
        const avgUrl = new URL(`${env.SUPABASE_URL}/rest/v1/v_unified_analysis_v2`);
        avgUrl.searchParams.set('select', 'avg_l:avg(l_score),avg_p:avg(p_score),avg_d:avg(d_score),avg_e:avg(e_score),avg_f:avg(f_score)');
        avgUrl.searchParams.set('limit', '1');
        const rows = await fetchSupabaseJson<any[]>(env, avgUrl.toString(), { headers: buildSupabaseHeaders(env) }, SUPABASE_FETCH_TIMEOUT_MS).catch(() => []);
        const r0 = Array.isArray(rows) ? (rows[0] || null) : null;
        applyAvgFromRow(r0);
      }
    } catch {
      // ignore
    }

    // ----------------------------
    // my record + country ranks：一条窗口函数 RPC 获取 rank_in_country/total_in_country，修复 1/1
    // ----------------------------
    const myOut: any = { id: null, user_name: null, github_username: null };
    let myValues: any = null;
    let myRanks: any = null;
    let globalUserRanks: Record<string, { rank: number; total: number }> | null = null;
    let countryUserRanks: Record<string, { rank: number; total: number }> | null = null;

    const canIdentify = !!(userId || fingerprint);
    if (canIdentify) {
      try {
        const [rankRow, ranks6d, meRows] = await Promise.all([
          getUserRankV2(env, fingerprint || null, userId || null),
          getUserRanks6d(env, fingerprint || null, userId || null),
          (async () => {
            const fetchMe = async (selectCols: string) => {
              const meUrl = new URL(`${env.SUPABASE_URL}/rest/v1/v_unified_analysis_v2`);
              meUrl.searchParams.set('select', selectCols);
              if (userId && fingerprint) {
                meUrl.searchParams.set('or', `(id.eq.${encodeURIComponent(userId)},fingerprint.eq.${encodeURIComponent(fingerprint)})`);
              } else if (userId) {
                meUrl.searchParams.set('id', `eq.${encodeURIComponent(userId)}`);
              } else {
                meUrl.searchParams.set('fingerprint', `eq.${encodeURIComponent(fingerprint)}`);
              }
              meUrl.searchParams.set('limit', '1');
              return await fetchSupabaseJson<any[]>(env, meUrl.toString(), { headers: buildSupabaseHeaders(env) }, SUPABASE_FETCH_TIMEOUT_MS);
            };
            try {
              return await fetchMe('id,user_name,fingerprint,user_identity,total_messages,total_user_chars,total_chars,avg_user_message_length,jiafang_count,ketao_count,work_days');
            } catch {
              return await fetchMe('id,user_name,fingerprint,user_identity,total_messages,total_chars,jiafang_count,ketao_count,work_days').catch(() => []);
            }
          })(),
        ]);
        const me = Array.isArray(meRows) ? (meRows[0] || null) : null;
        if (me) {
          myOut.id = me.id ?? null;
          myOut.user_name = me.user_name ?? null;
          const msg = Number(me.total_messages) || 0;
          const chars = Number(me.total_chars) || 0;
          const userChars = Number(me.total_user_chars) || chars;
          const avgLen = Number(me.avg_user_message_length) || (msg > 0 ? (userChars / msg) : 0);
          const jia = Number(me.jiafang_count) || 0;
          const ket = Number(me.ketao_count) || 0;
          const wd = Number(me.work_days) ?? 0;
          myValues = {
            total_messages: msg,
            total_user_chars: userChars,
            total_chars: chars,
            avg_user_message_length: avgLen,
            jiafang_count: jia,
            ketao_count: ket,
            work_days: wd,
          };
          const DIMS = ['total_messages', 'total_chars', 'avg_user_message_length', 'jiafang_count', 'ketao_count', 'work_days'] as const;
          if (ranks6d && ranks6d.ranks) {
            myRanks = {} as any;
            globalUserRanks = {};
            countryUserRanks = {};
            for (const k of DIMS) {
              const v = ranks6d.ranks[k];
              if (v && typeof v === 'object') {
                // 放宽条件：只要有 total_country 就认为是有效数据
                const rankCountry = Number(v.rank_country) || null;
                const totalCountry = Number(v.total_country) || 0;
                const rankGlobal = Number(v.rank_global) || null;
                const totalGlobal = Number(v.total_global) || 0;
                
                // 国家排名：只要 total > 0 就填充
                if (totalCountry > 0 && rankCountry != null && rankCountry > 0) {
                  myRanks[k] = { 
                    rank: rankCountry, 
                    total: totalCountry, 
                    percentile: Math.max(0, Math.min(100, (1 - (rankCountry - 1) / totalCountry) * 100)) 
                  };
                  countryUserRanks[k] = { rank: rankCountry, total: totalCountry };
                } else {
                  myRanks[k] = null;
                  countryUserRanks[k] = { rank: 0, total: totalCountry || 0 };
                }
                
                // 全球排名
                if (totalGlobal > 0 && rankGlobal != null && rankGlobal > 0) {
                  globalUserRanks[k] = { rank: rankGlobal, total: totalGlobal };
                } else {
                  globalUserRanks[k] = { rank: 0, total: totalGlobal || 0 };
                }
              }
            }
            console.log('[Worker] ranks6d 分支完成，myRanks:', JSON.stringify(myRanks));
          } else {
            const totalInCountry = rankRow ? rankRow.total_in_country : countryTotalUsers;
            const rankInCountry = rankRow ? rankRow.rank_in_country : null;
            const totalVal = totalInCountry > 0 ? totalInCountry : countryTotalUsers;
            const rankVal = (rankInCountry != null && rankInCountry > 0) ? rankInCountry : null;
            const totalGlobal = rankRow ? rankRow.total_global : 0;
            const rankGlobal = rankRow ? rankRow.rank_global : null;
            const one = totalVal > 0 && rankVal != null ? { rank: rankVal, total: totalVal, percentile: totalVal > 0 ? Math.max(0, Math.min(100, (1 - (rankVal - 1) / totalVal) * 100)) : null } : null;
            const oneGlobal = totalGlobal > 0 && rankGlobal != null && rankGlobal > 0 ? { rank: rankGlobal, total: totalGlobal } : null;
            myRanks = { total_messages: one, total_chars: one, avg_user_message_length: one, jiafang_count: one, ketao_count: one, work_days: one };
            globalUserRanks = {};
            countryUserRanks = {};
            for (const k of DIMS) {
              globalUserRanks[k] = oneGlobal ? { rank: oneGlobal.rank, total: oneGlobal.total } : { rank: 0, total: 0 };
              countryUserRanks[k] = one ? { rank: one.rank, total: one.total } : { rank: 0, total: 0 };
            }
          }
          console.log('[Worker] rankRow 分支完成，myRanks:', JSON.stringify(myRanks));
        }
      } catch {
        // ignore
      }
    }

    // 【修复】myCountryRanks：请求带 cc 且存在 fingerprint 或 user_id 时，从 v_user_ranks_in_country 取排名
    const canIdentifyForCountry = hasExplicitCc && !!(userId || fingerprint) && /^[A-Z]{2}$/.test(cc);
    let resolvedFp = fingerprint;
    if (canIdentifyForCountry && !resolvedFp && userId) {
      try {
        const meUrl = new URL(`${env.SUPABASE_URL}/rest/v1/v_unified_analysis_v2`);
        meUrl.searchParams.set('select', 'fingerprint');
        meUrl.searchParams.set('id', `eq.${encodeURIComponent(userId)}`);
        meUrl.searchParams.set('limit', '1');
        const meRows = await fetchSupabaseJson<any[]>(env, meUrl.toString(), { headers: buildSupabaseHeaders(env) }, SUPABASE_FETCH_TIMEOUT_MS).catch(() => []);
        const me = Array.isArray(meRows) && meRows.length > 0 ? meRows[0] : null;
        if (me?.fingerprint) resolvedFp = String(me.fingerprint).trim();
      } catch {
        // ignore
      }
    }
    if (canIdentifyForCountry) {
      let viewRankRow: any = null;
      try {
        const rankViewUrl = new URL(`${env.SUPABASE_URL}/rest/v1/v_user_ranks_in_country`);
        rankViewUrl.searchParams.set('select', '*');
        rankViewUrl.searchParams.set('country_code', `eq.${cc}`);
        if (resolvedFp && userId) {
          rankViewUrl.searchParams.set('or', `(fingerprint.eq.${encodeURIComponent(resolvedFp)},id.eq.${encodeURIComponent(userId)},user_id.eq.${encodeURIComponent(userId)})`);
        } else if (resolvedFp) {
          rankViewUrl.searchParams.set('fingerprint', `eq.${encodeURIComponent(resolvedFp)}`);
        } else if (userId) {
          rankViewUrl.searchParams.set('or', `(id.eq.${encodeURIComponent(userId)},user_id.eq.${encodeURIComponent(userId)})`);
        }
        rankViewUrl.searchParams.set('limit', '1');
        const rankRows = await fetchSupabaseJson<any[]>(
          env,
          rankViewUrl.toString(),
          { headers: buildSupabaseHeaders(env) },
          SUPABASE_FETCH_TIMEOUT_MS
        ).catch(() => []);
        viewRankRow = Array.isArray(rankRows) && rankRows.length > 0 ? rankRows[0] : null;
      } catch {
        viewRankRow = null;
      }

      if (viewRankRow) {
        const totalInCountry = Number(viewRankRow.total_in_country ?? viewRankRow.total_country ?? countryTotalUsers) || Math.max(1, countryTotalUsers);
        const toRank = (rankVal: any): { rank: number; total: number; percentile?: number } | null => {
          const r = ni(rankVal);
          if (r == null || r <= 0 || totalInCountry <= 0) return null;
          return {
            rank: Math.min(r, totalInCountry),
            total: totalInCountry,
            percentile: Math.max(0, Math.min(100, (1 - (r - 1) / totalInCountry) * 100)),
          };
        };
        const DIMS = ['total_messages', 'total_chars', 'avg_user_message_length', 'jiafang_count', 'ketao_count', 'work_days'] as const;
        const viewRankMap: Record<string, string> = {
          total_messages: 'rank_messages',
          total_chars: 'rank_chars',
          work_days: 'rank_days',
          jiafang_count: 'rank_jiafang',
          ketao_count: 'rank_ketao',
          avg_user_message_length: 'rank_avg_len',
        };
        // 创建临时变量，避免中途失败导致主数据被清空
        const nextMyRanks = {} as any;
        const nextCountryUserRanks = {} as any;
        for (const k of DIMS) {
          const col = viewRankMap[k] ?? k;
          const rk = toRank(viewRankRow[col] ?? viewRankRow[k]);
          if (rk) {
            nextMyRanks[k] = rk;
            nextCountryUserRanks[k] = { rank: rk.rank, total: rk.total };
          } else {
            const fallback = totalInCountry <= 1 ? { rank: 1, total: 1, percentile: 100 } : null;
            nextMyRanks[k] = fallback;
            nextCountryUserRanks[k] = fallback ? { rank: 1, total: 1 } : { rank: 0, total: 0 };
          }
        }
        // 排名注入：将 v_user_ranks_in_country 的 rank_messages 赋值给 myCountryRanks.ai（前端 #—/— 用）
        nextMyRanks.ai = nextMyRanks.total_messages ?? toRank(viewRankRow.rank_messages) ?? null;
        
        // 只有确认找到数据才覆盖
        myRanks = nextMyRanks;
        countryUserRanks = nextCountryUserRanks;
        console.log('[Worker] v_user_ranks_in_country 分支完成，myRanks:', JSON.stringify(myRanks));
      } else {
      try {
        const countryUsersUrl = new URL(`${env.SUPABASE_URL}/rest/v1/user_analysis`);
        countryUsersUrl.searchParams.set('select', 'id,fingerprint,total_messages,total_chars,jiafang_count,ketao_count,work_days');
        countryUsersUrl.searchParams.set('or', `(country_code.eq.${cc},ip_location.eq.${cc},manual_location.eq.${cc},current_location.eq.${cc})`);
        countryUsersUrl.searchParams.set('limit', '10000');
        const countryRows = await fetchSupabaseJson<any[]>(
          env,
          countryUsersUrl.toString(),
          { headers: buildSupabaseHeaders(env) },
          SUPABASE_FETCH_TIMEOUT_MS
        ).catch(() => []);
        const arr = Array.isArray(countryRows) ? countryRows : [];
        const match = arr.find((r: any) =>
          (userId && r?.id != null && String(r.id) === userId) ||
          (fingerprint && r?.fingerprint != null && String(r.fingerprint) === fingerprint)
        );
        if (match && arr.length > 0) {
          const totalInCountry = arr.length;
          const DIMS = ['total_messages', 'total_chars', 'avg_user_message_length', 'jiafang_count', 'ketao_count', 'work_days'] as const;
          const colMap: Record<string, string> = {
            total_messages: 'total_messages',
            total_chars: 'total_chars',
            avg_user_message_length: 'avg_user_message_length',
            jiafang_count: 'jiafang_count',
            ketao_count: 'ketao_count',
            work_days: 'work_days',
          };
          const getVal = (r: any, k: string) => {
            const v = r[colMap[k]];
            if (k === 'avg_user_message_length') {
              const tm = Number(r.total_messages) || 0;
              const tc = Number(r.total_chars) || 0;
              return tm > 0 ? tc / tm : 0;
            }
            return Number(v) || 0;
          };
          const viewedRanks: Record<string, { rank: number; total: number }> = {};
          const viewedMyRanks: Record<string, { rank: number; total: number; percentile?: number }> = {};
          if (totalInCountry === 1) {
            for (const k of DIMS) {
              const one = { rank: 1, total: 1 };
              viewedRanks[k] = one;
              viewedMyRanks[k] = { ...one, percentile: 100 };
            }
          } else {
            for (const k of DIMS) {
              const sorted = [...arr].sort((a, b) => getVal(b, k) - getVal(a, k));
              const idx = sorted.findIndex((r: any) => r === match);
              const rank = idx >= 0 ? idx + 1 : totalInCountry;
              viewedRanks[k] = { rank, total: totalInCountry };
              viewedMyRanks[k] = {
                rank,
                total: totalInCountry,
                percentile: totalInCountry > 0 ? Math.max(0, Math.min(100, (1 - (rank - 1) / totalInCountry) * 100)) : undefined,
              };
            }
          }
          myRanks = viewedMyRanks;
          countryUserRanks = viewedRanks;
          console.log('[Worker] 手动计算分支完成，myRanks:', JSON.stringify(myRanks));
        }
      } catch (e: any) {
        console.warn('[Worker] myCountryRanks 按查看国家计算失败:', e?.message);
      }
      }
    }

    // latestRecords：含 work_days、user_name、github_username，供 stats2 抽屉上岗天数与活跃节点头像
    let latestRecords: any[] = [];
    try {
      const lrUrl = new URL(`${env.SUPABASE_URL}/rest/v1/user_analysis`);
      lrUrl.searchParams.set('select', 'user_name,github_username,user_identity,personality_type,ip_location,manual_location,updated_at,created_at,work_days,roast_text,country_code');
      lrUrl.searchParams.set('or', `(country_code.eq.${cc},ip_location.eq.${cc},manual_location.eq.${cc},current_location.eq.${cc})`);
      lrUrl.searchParams.set('order', 'updated_at.desc');
      lrUrl.searchParams.set('limit', '8');
      const lr = await fetchSupabaseJson<any[]>(env, lrUrl.toString(), { headers: buildSupabaseHeaders(env) }, SUPABASE_FETCH_TIMEOUT_MS).catch(() => []);
      latestRecords = (Array.isArray(lr) ? lr : []).map((r: any) => ({
        name: r?.user_name || r?.github_username || '未知',
        type: r?.personality_type || 'UNKNOWN',
        location: r?.manual_location || r?.ip_location || r?.country_code || country,
        time: r?.updated_at || r?.created_at || '',
        github_username: r?.github_username || null,
        user_name: r?.user_name || null,
        user_identity: r?.user_identity || null,
        work_days: r?.work_days != null ? Number(r.work_days) : undefined,
        // 【防止 NULL 导致抽屉消失】如果 roast_text 为空，给它一个默认值
        roast_text: r?.roast_text || '分析生成中...',
      }));
    } catch {
      latestRecords = [];
    }

    // ----------------------------
    // 该国六项指标排行榜（用于 stats2 “高分图谱”卡片）
    // - 兼容旧字段：topByMetrics 仍存在，但每项会带 leaders[]（TopN）
    // ----------------------------
    let topByMetrics: any[] = [];
    try {
      const topNRaw = String(c.req.query('topN') || '').trim();
      const topN = (() => {
        const n = parseInt(topNRaw, 10);
        if (Number.isFinite(n) && n > 0) return Math.max(3, Math.min(20, n));
        return 10;
      })();
      const metrics: Array<{ key: string; col: string; labelZh: string; labelEn: string; format?: 'int' | 'float' }> = [
          { key: 'total_messages', col: 'total_messages', labelZh: '调戏AI次数', labelEn: 'Messages', format: 'int' },
          { key: 'total_chars', col: 'total_chars', labelZh: '对话字符数', labelEn: 'Total Chars', format: 'int' },
          { key: 'avg_user_message_length', col: 'avg_user_message_length', labelZh: '平均长度', labelEn: 'Avg Len', format: 'float' },
          { key: 'jiafang_count', col: 'jiafang_count', labelZh: '甲方上身', labelEn: 'Jiafang', format: 'int' },
          { key: 'ketao_count', col: 'ketao_count', labelZh: '磕头', labelEn: 'Ketao', format: 'int' },
          { key: 'work_days', col: 'work_days', labelZh: '上岗天数', labelEn: 'Work Days', format: 'int' },
      ];

      // 无论是否有数据，都返回 6 个条目，前端才能稳定显示 6 个排行榜 + 指示器
      const emptyEntry = (m: { key: string; col: string; labelZh: string; labelEn: string; format?: 'int' | 'float' }) => ({
        key: m.key,
        col: m.col,
        labelZh: m.labelZh,
        labelEn: m.labelEn,
        format: m.format || 'int',
        // 兼容旧使用：保留 top1 字段，但允许为空
        score: null,
        user: null,
        leaders: [],
        topN,
      });

      if (/^[A-Z]{2}$/.test(cc)) {
        // ✅ 方案 B：优先使用 Supabase RPC 一次拿到 6 榜单（更省连接/更低延迟，适合免费档）
        // 如果 RPC 尚未部署或执行失败，则自动回退到旧方案（每指标单独查询）
        try {
          const rpcTopUrl = `${env.SUPABASE_URL}/rest/v1/rpc/get_country_top_metrics_v1`;
          const rpcTop = await fetchSupabaseJson<any>(
            env,
            rpcTopUrl,
            {
              method: 'POST',
              headers: buildSupabaseHeaders(env, { 'Content-Type': 'application/json' }),
              body: JSON.stringify({ country_code: cc, top_n: topN }),
            },
            SUPABASE_FETCH_TIMEOUT_MS
          ).catch(() => null);
          if (Array.isArray(rpcTop) && rpcTop.length > 0) {
            // 兼容：保证顺序与前端 metricOrder 一致
            const order = new Map<string, number>(metrics.map((m, i) => [m.key, i]));
            topByMetrics = rpcTop
              .slice()
              .sort((a: any, b: any) => (order.get(String(a?.key || '')) ?? 999) - (order.get(String(b?.key || '')) ?? 999));
            // 补齐：如果 RPC 返回不足 6 项，也要补齐空项，避免前端指示器/轮播断裂
            if (topByMetrics.length < metrics.length) {
              const existing = new Set(topByMetrics.map((x: any) => String(x?.key || '')));
              for (const m of metrics) {
                if (!existing.has(m.key)) topByMetrics.push(emptyEntry(m));
              }
              topByMetrics = topByMetrics
                .slice()
                .sort((a: any, b: any) => (order.get(String(a?.key || '')) ?? 999) - (order.get(String(b?.key || '')) ?? 999));
            }
          }
        } catch {
          // ignore -> fallback
        }

        // RPC 成功则不再进行 6 次查询
        if (Array.isArray(topByMetrics) && topByMetrics.length > 0) {
          // ok
        } else {
          const selectColsBase = [
          'id',
          'user_name',
          'github_username',
          'fingerprint',
          'user_identity',
          'country_code',
          'total_messages',
          'total_chars',
          'avg_user_message_length',
          'jiafang_count',
          'ketao_count',
          'work_days',
          ].join(',');
          // 注意：部分环境的视图可能尚未包含 lpdef 列。这里先尝试带 lpdef，失败则回退到不带 lpdef，
          // 避免整项榜单因 select 列不存在而变成空数据。
          const selectColsWithLpdef = `${selectColsBase},lpdef`;
          const results = await Promise.all(metrics.map(async (m) => {
            try {
              const buildUrl = (selectCols: string) => {
                const url = new URL(`${env.SUPABASE_URL}/rest/v1/user_analysis`);
                url.searchParams.set('select', selectCols);
                url.searchParams.set('or', `(country_code.eq.${cc},ip_location.eq.${cc},manual_location.eq.${cc},current_location.eq.${cc})`);
                // 排除 0 / null
                url.searchParams.set(m.col, 'gt.0');
                url.searchParams.set('order', `${m.col}.desc`);
                url.searchParams.set('limit', String(topN));
                return url.toString();
              };

              // 先尝试带 lpdef 列，若失败回退不带 lpdef
              let rows: any[] = [];
              try {
                rows = await fetchSupabaseJson<any[]>(
                  env,
                  buildUrl(selectColsWithLpdef),
                  { headers: buildSupabaseHeaders(env) },
                  SUPABASE_FETCH_TIMEOUT_MS
                ).catch(() => []);
              } catch {
                rows = [];
              }
              if (!Array.isArray(rows) || rows.length === 0) {
              // 只有在“请求失败/列不存在”导致 rows 为空时才回退；如果确实没数据也会是空，但回退成本可接受
                try {
                  rows = await fetchSupabaseJson<any[]>(
                    env,
                    buildUrl(selectColsBase),
                    { headers: buildSupabaseHeaders(env) },
                    SUPABASE_FETCH_TIMEOUT_MS
                  ).catch(() => []);
                } catch {
                  rows = [];
                }
              }
              const list = Array.isArray(rows) ? rows : [];
              const leaders = list
                .map((row: any, idx: number) => {
                  const score = Number(row?.[m.col]);
                  if (!Number.isFinite(score) || score <= 0) return null;
                  return {
                    rank: idx + 1,
                    score,
                    user: {
                      id: row?.id ?? null,
                      user_name: row?.user_name ?? '',
                      github_username: row?.github_username ?? '',
                      fingerprint: row?.fingerprint ?? null,
                      user_identity: row?.user_identity ?? null,
                      lpdef: row?.lpdef ?? null,
                    },
                  };
                })
                .filter(Boolean);
              if (!leaders.length) return emptyEntry(m);
              const top1 = leaders[0] as any;
              return {
                ...emptyEntry(m),
                // 兼容旧使用：保留 top1
                score: Number(top1?.score),
                user: top1?.user || null,
                leaders,
              };
            } catch {
              return emptyEntry(m);
            }
          }));
          topByMetrics = results;
        }
      } else {
        // country 参数异常时也返回 6 个空条目，避免前端 UI 断裂
        topByMetrics = metrics.map((m) => emptyEntry(m));
      }
    } catch {
      // 兜底：返回空数组（保持兼容），前端会显示“暂无数据”
      topByMetrics = [];
    }

    // 【清理】使用已定义的 debugFlag 和 forceRefresh，避免重复声明
    // debugFlag 和 forceRefresh 已在函数开头定义（第 5751-5752 行）
    const includeDebug = forceRefresh;

    // 顶层统计（全站口径）：totalUsers/totalAnalysis
    // - totalUsers = count(distinct fingerprint) from v_unified_analysis_v2（fingerprint 非空行数即可）
    // - totalAnalysis = count(*) from v_unified_analysis_v2
    let globalTotalUsers = 0;
    let globalTotalAnalysis = 0;
    try {
      const countAllUrl = new URL(`${env.SUPABASE_URL}/rest/v1/v_unified_analysis_v2`);
      countAllUrl.searchParams.set('select', 'id');
      const res = await fetch(countAllUrl.toString(), {
        headers: {
          ...buildSupabaseHeaders(env),
          'Prefer': 'count=exact',
          'Range': '0-0',
        },
      });
      if (res.ok) {
        const cr = res.headers.get('content-range');
        const parts = cr ? cr.split('/') : [];
        if (parts.length === 2) {
          const nAll = parseInt(parts[1]);
          if (!Number.isNaN(nAll) && nAll >= 0) globalTotalAnalysis = nAll;
        }
      }
    } catch {
      globalTotalAnalysis = 0;
    }
    try {
      const countFpUrl = new URL(`${env.SUPABASE_URL}/rest/v1/v_unified_analysis_v2`);
      countFpUrl.searchParams.set('select', 'fingerprint');
      countFpUrl.searchParams.set('fingerprint', 'not.is.null');
      const res2 = await fetch(countFpUrl.toString(), {
        headers: {
          ...buildSupabaseHeaders(env),
          'Prefer': 'count=exact',
          'Range': '0-0',
        },
      });
      if (res2.ok) {
        const cr = res2.headers.get('content-range');
        const parts = cr ? cr.split('/') : [];
        if (parts.length === 2) {
          const nAll = parseInt(parts[1]);
          if (!Number.isNaN(nAll) && nAll >= 0) globalTotalUsers = nAll;
        }
      }
      // 若全站没有 fingerprint（极端情况），回退到全站记录数
      if (!globalTotalUsers && globalTotalAnalysis) globalTotalUsers = globalTotalAnalysis;
    } catch {
      if (!globalTotalUsers && globalTotalAnalysis) globalTotalUsers = globalTotalAnalysis;
    }

    // 【预先计算 countryTotals】以便在 locationRank 中使用
    const computedCountryTotals = (() => {
        // 当数据来自 v_country_stats 时优先用 totals（列名已对齐），避免 row 为视图原始行导致 total_chars 等读不到
        let data = (totals?.source === 'V_COUNTRY_STATS' && totals) ? totals : (row || totals || {});
        let finalCountryTotalUsers = countryTotalUsers;
        
        // 【兜底修复】如果 row 和 totals 都没有数据，尝试从 country_level 中读取
        if ((!data || Object.keys(data).length === 0 || (!data.total_messages_sum && !data.tm)) && kvCountry?.country_level?.length) {
          const fallbackRow = kvCountry.country_level.find((it: any) => 
            String(it?.country_code || '').trim().toUpperCase() === cc
          );
          if (fallbackRow) {
            data = fallbackRow;
            // 确保 countryTotalUsers 也被设置
            if (!finalCountryTotalUsers && fallbackRow.total_users != null) {
              finalCountryTotalUsers = Number(fallbackRow.total_users) || 0;
            }
            // 如果 countryTotalUsers 仍然为 0，尝试从 country_level 的长度推断
            if (!finalCountryTotalUsers && kvCountry.country_level.length > 0) {
              // 至少有一个国家有数据
              finalCountryTotalUsers = 1;
            }
          }
        }
        
        // 如果 countryTotalUsers 仍然为 0，但数据存在，设置为至少 1
        if (!finalCountryTotalUsers && (data.total_messages_sum || data.tm || data.total_messages)) {
          finalCountryTotalUsers = 1;
        }
        
        // 【强制类型转换】使用 Number() 强制转换所有数值，匹配显式别名（tm, tc, wd, jc, kc）
        // 支持多种字段名格式：tm/total_messages/total_messages_sum
        const tm = Number(
          data.tm ?? 
          data.total_messages ?? 
          data.total_messages_sum ?? 
          totalMessages ?? 
          0
        ) || 0;
        
        // 兼容 v_country_stats 视图字段名（含无下划线/驼峰）
        const tc = Number(
          data.tc ?? 
          data.total_chars ?? 
          data.total_chars_sum ?? 
          data.totalchars ?? 
          data.totalChars ?? 
          totalChars ?? 
          0
        ) || 0;
        
        const wd = Number(
          data.wd ?? 
          data.work_days ?? 
          data.work_days_sum ?? 
          data.total_work_days ?? 
          data.totaldays ?? 
          data.totalDays ?? 
          0
        ) || 0;
        
        const jc = Number(
          data.jc ?? 
          data.jiafang_count ?? 
          data.jiafang_count_sum ?? 
          data.total_jiafang ?? 
          data.totalno ?? 
          data.totalNo ?? 
          0
        ) || 0;
        
        const kc = Number(
          data.kc ?? 
          data.ketao_count ?? 
          data.ketao_count_sum ?? 
          data.total_ketao ?? 
          data.totalplease ?? 
          data.totalPlease ?? 
          0
        ) || 0;
        
        // 计算平均长度（word）：使用 tc（总字数）作为分子，因为 tuc 可能为 0
        const word = tm > 0 ? Number((tc / tm).toFixed(1)) : 0;
        
        return {
          country,
          totalUsers: Number(finalCountryTotalUsers) || 0,
          // 数据库原名（保持兼容）
          total_messages: tm,
          total_chars: tc,
          jiafang_count: jc,
          ketao_count: kc,
          // 与 rollup 口径一致：加权平均长度（使用 tc 作为兜底，因为 tuc 可能为 0）
          avg_user_message_length: word,
          work_days: wd,
          // 【强制别名输出】前端要求的短缩名字段，匹配显式别名
          ai: tm,      // tm (消息数) 映射为 ai
          say: tc,     // tc (总字数) 映射为 say
          day: wd,     // wd (天数) 映射为 day
          no: jc,      // jc (甲方数) 映射为 no，对应 jiafang_count 实数
          please: kc,  // kc (客套数) 映射为 please，对应 ketao_count 实数
          word: word,   // 使用 tc（总字数）计算平均长度，保留一位小数
        };
    })();

    // msg_count = 调戏 AI 总次数；根节点 totalchars/totaldays 等必须与 countryTotals 一致，有视图数据时从 totals 取避免为 0
    const msg_count = Number(computedCountryTotals.total_messages ?? totalMessages ?? 0) || 0;
    const user_count = Number(countryTotalUsers ?? 0) || 0;
    const totalanalysis = msg_count;
    const totalchars = (totals?.source === 'V_COUNTRY_STATS' && totals)
      ? Number(totals.total_chars_sum ?? 0) || 0
      : (Number(computedCountryTotals.total_chars ?? totalChars ?? 0) || 0);
    const totaldays = (totals?.source === 'V_COUNTRY_STATS' && totals)
      ? Number(totals.work_days_sum ?? 0) || 0
      : (Number(computedCountryTotals.work_days ?? 0) || 0);
    const totalno = (totals?.source === 'V_COUNTRY_STATS' && totals)
      ? Number(totals.jiafang_count_sum ?? 0) || 0
      : (Number(computedCountryTotals.jiafang_count ?? 0) || 0);
    const totalplease = (totals?.source === 'V_COUNTRY_STATS' && totals)
      ? Number(totals.ketao_count_sum ?? 0) || 0
      : (Number(computedCountryTotals.ketao_count ?? 0) || 0);
    // 从 v_country_stats 获取后必须显式映射：total_chars→say, total_work_days→day, total_jiafang→no, total_ketao→please
    const countryTotalsForResponse = (totals?.source === 'V_COUNTRY_STATS' && totals)
      ? {
          country: cc,
          totalUsers: Number(totals.totalUsers ?? countryTotalUsers) || 0,
          total_messages: Number(totals.total_messages_sum ?? 0) || 0,
          total_chars: Number(totals.total_chars_sum ?? 0) || 0,
          work_days: Number(totals.work_days_sum ?? 0) || 0,
          jiafang_count: Number(totals.jiafang_count_sum ?? 0) || 0,
          ketao_count: Number(totals.ketao_count_sum ?? 0) || 0,
          totalno: Number(totals.jiafang_count_sum ?? 0) || 0,
          totalplease: Number(totals.ketao_count_sum ?? 0) || 0,
          avg_user_message_length: Number(totals.avg_user_message_length_sum ?? 0) || 0,
          ai: Number(totals.total_messages_sum ?? 0) || 0,
          say: Number(totals.total_chars_sum ?? 0) || 0,
          day: Number(totals.work_days_sum ?? 0) || 0,
          no: Number(totals.jiafang_count_sum ?? 0) || 0,
          please: Number(totals.ketao_count_sum ?? 0) || 0,
          word: totals.total_messages_sum > 0 ? Number(((totals.total_chars_sum ?? 0) / (totals.total_messages_sum ?? 1)).toFixed(1)) : 0,
        }
      : {
          country: computedCountryTotals.country,
          totalUsers: computedCountryTotals.totalUsers,
          total_messages: msg_count,
          total_chars: totalchars,
          work_days: totaldays,
          jiafang_count: totalno,
          ketao_count: totalplease,
          totalno,
          totalplease,
          avg_user_message_length: computedCountryTotals.avg_user_message_length,
          ai: msg_count,
          say: totalchars,
          day: totaldays,
          no: totalno,
          please: totalplease,
          word: computedCountryTotals.word,
        };

    // 地理分布：必须按 current_location GROUP BY，使用 RPC 查询
    let locationRankList: Array<{ name: string; value: number }> = [{ name: country, value: Number(computedCountryTotals.totalUsers) || Number(countryTotalUsers) || 0 }];
    try {
      const rpcUrl = `${env.SUPABASE_URL}/rest/v1/rpc/get_location_distribution`;
      const rpcRes = await fetch(rpcUrl, {
        method: 'POST',
        headers: { ...buildSupabaseHeaders(env), 'Content-Type': 'application/json' },
        body: '{}',
      });
      if (rpcRes.ok) {
        const raw = await rpcRes.json();
        const arr = Array.isArray(raw) ? raw : (raw && typeof raw === 'object' && Array.isArray(raw?.data) ? raw.data : null);
        if (arr && arr.length > 0) {
          locationRankList = arr.map((item: any) => ({
            name: String(item?.name ?? ''),
            value: Number(item?.value) || 0,
          })).filter((x: { name: string; value: number }) => x.name && x.name !== 'XX');
          if (locationRankList.length === 0) locationRankList = [{ name: country, value: Number(computedCountryTotals.totalUsers) || Number(countryTotalUsers) || 0 }];
        }
      }
    } catch (_) { /* 保留单国兜底 */ }

    const out: any = {
      success: true,
      msg_count,
      user_count,
      totalanalysis,
      totalchars,
      totaldays,
      totalno,
      totalplease,
      totalUsers: globalTotalUsers,
      totalAnalysis: msg_count,
      totalChars,
      avgPerUser,
      avgPerScan,
      globalAverage: avgDims,
      averages: avgDims,
      locationRank: locationRankList,
      personalityRank: [],
      personalityDistribution: [],
      latestRecords,
      topByMetrics,
      countryTotals: countryTotalsForResponse,
      countryTotalsRanks,
      myCountry: myOut,
      myCountryValues: myValues,
      myCountryRanks: (() => {
        // 检查 myRanks 是否真正包含有效数据（至少一个维度有 rank 和 total）
        console.log('[Worker] 最终 myRanks 检查:', JSON.stringify(myRanks));
        const hasValidRanks = myRanks && Object.keys(myRanks).some(k => {
          const v = myRanks[k];
          return v && typeof v === 'object' && v.rank != null && v.total != null && v.total > 0;
        });
        
        console.log('[Worker] hasValidRanks:', hasValidRanks);
        
        if (hasValidRanks) {
          const result = { ...myRanks, ai: myRanks.ai ?? myRanks.total_messages ?? null };
          console.log('[Worker] 返回有效排名:', JSON.stringify(result));
          return result;
        }
        
        // 如果没有有效排名数据，返回 null 而不是空对象，让前端知道数据不可用
        const dims = ['total_messages', 'total_chars', 'avg_user_message_length', 'jiafang_count', 'ketao_count', 'work_days'] as const;
        const empty: Record<string, null> = { ai: null };
        dims.forEach((k) => { empty[k] = null; });
        console.log('[Worker] 返回空排名:', JSON.stringify(empty));
        return empty;
      })(),
      global_user_ranks: globalUserRanks ?? undefined,
      country_user_ranks: countryUserRanks ?? undefined,
      _meta: {
        totalsSource: totals?.source || null,
        countryName: (countryNameRaw || null),
        countDebug: null,
        at: new Date().toISOString(),
        /** KV 词云数据写入时间；若超过 1 小时前端可静默触发 refresh 以轮换 Dynamic 池 */
        lexicon_updated_at: identityLevelCloudUpdatedAt ?? undefined,
      },
      country_level: kvCountry?.country_level ?? undefined,
      no_competition: countryTotalsRanks?._meta?.no_competition ?? false,
      vibe_lexicon: identityLevelCloudFromKV ?? undefined,
      // 【仅从 KV 读】查询时不实时计算；KV 为空返回空数组，不报错
      identityLevelCloud: (() => {
        const empty = { Novice: [] as Array<{ word: string; count: number; fingerprints?: string[] }>, Professional: [] as Array<{ word: string; count: number; fingerprints?: string[] }>, Architect: [] as Array<{ word: string; count: number; fingerprints?: string[] }> };
        return identityLevelCloudFromKV ? { Novice: identityLevelCloudFromKV.Novice ?? [], Professional: identityLevelCloudFromKV.Professional ?? [], Architect: identityLevelCloudFromKV.Architect ?? [] } : empty;
      })(),
      novice: identityLevelCloudFromKV?.Novice ?? [],
      professional: identityLevelCloudFromKV?.Professional ?? [],
      architect: identityLevelCloudFromKV?.Architect ?? [],
      // 优先使用 KV 中的 countryDataByCode，如果 KV 无数据但 RPC 降级成功，则手动构建当前国家的数据
      countryDataByCode: buildCountryDataByCode(kvCountry) ?? (totals?.source === 'RPC_FALLBACK' && countryTotalsRanks ? {
        [cc]: {
          ranks: {
            L: countryTotalsRanks.total_messages?.rank ?? 0,
            P: countryTotalsRanks.total_chars?.rank ?? 0,
            E: countryTotalsRanks.avg_user_message_length?.rank ?? 0,
            F: countryTotalsRanks.jiafang_count?.rank ?? 0,
            G: countryTotalsRanks.ketao_count?.rank ?? 0,
            H: countryTotalsRanks.work_days?.rank ?? 0,
          },
          total_countries: totalCountries,
          user_count: countryTotalUsers,
        },
      } : undefined),
      total_countries: (kvCountry as any)?._meta?.total_countries ?? totalCountries ?? 195,
    };

    if (includeDebug) {
      out._debug = {
        country,
        countryName: countryNameRaw || null,
        kvHit: !!kvCountry,
        found: !!row,
        countryRowFound: !!countryRow,
        totalsSource: totals?.source || 'none',
        countryTotalsFrom: row ? 'row' : (totals ? 'totals' : (kvCountry?.country_level?.length ? 'country_level_fallback' : 'none')),
      };
      c.header('Cache-Control', 'no-store');
    }

    // 【第三步：增加缓存刷新逻辑】修改缓存 Key 名（v4），并确保 refresh=true 时执行覆盖旧数据
    if (env.STATS_STORE) {
      try {
        // refresh=true 时强制覆盖，否则只在缓存不存在时写入
        if (refresh) {
          // 强制覆盖旧缓存（包括旧版本的缓存键）
          const oldCacheKeys = [
            `global_stats_v3_${countryCode}`,
            `global_stats_v2_${countryCode}`,
            `country_summary_${countryCode}`,
          ];
          // 删除旧版本缓存
          for (const oldKey of oldCacheKeys) {
            try {
              await env.STATS_STORE.delete(oldKey);
            } catch (e) {
              // 忽略删除失败
            }
          }
          // 写入新版本缓存
          await env.STATS_STORE.put(cacheKey, JSON.stringify(out), { expirationTtl: 3600 });
          console.log(`[Worker] ✅ 缓存已强制刷新（refresh=true）: ${cacheKey}`);
        } else {
          // 正常情况：检查缓存是否存在，不存在才写入
          const existing = await env.STATS_STORE.get(cacheKey, 'text');
          if (!existing) {
            await env.STATS_STORE.put(cacheKey, JSON.stringify(out), { expirationTtl: 3600 });
            console.log(`[Worker] ✅ 缓存已写入: ${cacheKey}`);
          }
        }
      } catch (e) {
        console.warn('[Worker] 缓存写入失败:', e);
      }
    }

    // 抗抖：短缓存，允许前端切国快速重复请求
    c.header('Cache-Control', refresh ? 'no-store' : 'public, max-age=30');
    return c.json(out);
  } catch (e: any) {
    console.error('[Worker] /api/country-summary 错误:', e);
    return c.json({ success: false, error: e.message || '服务器错误' }, 500);
  }
});

/**
 * GET /api/global-aggregate
 * 全球聚合接口：从 v_unified_analysis_v2 表汇总全站数据，用于 Global 标签页六个维度卡片
 * 返回字段使用 AS 别名对齐前端需求：
 * - SUM(total_messages) AS ai (调戏 AI 次数总和)
 * - AVG(avg_user_message_length) AS word (平均长度的平均值)
 * - SUM(work_days) AS day (活跃天数总和)
 * - SUM(jiafang_count) AS no (甲方行为总和)
 * - SUM(total_chars) AS say (总字符数总和)
 * - SUM(ketao_count) AS please (客套礼貌总和)
 * 缓存：至少1小时
 */
app.get('/api/global-aggregate', async (c) => {
  try {
    const env = c.env;
    if (!env.SUPABASE_URL || !env.SUPABASE_KEY) {
      return c.json({ success: false, error: 'Supabase 未配置' }, 500);
    }

    // 检查 KV 缓存（1小时），强制刷新：使用 V2 key 避开旧数据
    const cacheKey = 'GLOBAL_AGGREGATE_DATA_V3';
    try {
      const cached = await env.STATS_STORE?.get(cacheKey, 'json');
      if (cached && typeof cached === 'object' && cached.data && cached.ts) {
        const age = Date.now() - cached.ts;
        if (age < KV_CACHE_TTL * 1000) {
          c.header('Cache-Control', `public, max-age=${Math.floor((KV_CACHE_TTL * 1000 - age) / 1000)}`);
          return c.json({ success: true, ...cached.data, _cached: true });
        }
      }
    } catch (e) {
      // 缓存读取失败，继续查询数据库
    }

    // 从 v_unified_analysis_v2 聚合全站数据（与 country-summary 同口径：SUM 聚合，严禁 .length 计数）
    const queryUrl = new URL(`${env.SUPABASE_URL}/rest/v1/v_unified_analysis_v2`);
    queryUrl.searchParams.set('select', 'total_messages,total_chars,work_days,jiafang_count,ketao_count');
    queryUrl.searchParams.set('limit', '10000');

    const rows = await fetchSupabaseJson<any[]>(
      env,
      queryUrl.toString(),
      { headers: buildSupabaseHeaders(env) },
      SUPABASE_FETCH_TIMEOUT_MS
    ).catch(() => []);

    const data = Array.isArray(rows) ? rows : [];

    // msg_count = 调戏 AI 总次数（用户对话次数，reduce 累加），user_count = 总人数（rows.length）
    const msg_count = data.reduce((sum, r) => sum + (Number(r.total_messages) || 0), 0);
    const user_count = data.length;
    const totalChars = data.reduce((sum, r) => sum + (Number(r.total_chars) || 0), 0);
    const totalDays = data.reduce((sum, r) => sum + (Number(r.work_days) || 0), 0);
    const totalNo = data.reduce((sum, r) => sum + (Number(r.jiafang_count) || 0), 0);
    const totalPlease = data.reduce((sum, r) => sum + (Number(r.ketao_count) || 0), 0);
    const word = msg_count > 0 ? Number((totalChars / msg_count).toFixed(1)) : 0;

    const result = {
      msg_count,
      user_count,
      totalanalysis: msg_count,
      totalchars: totalChars,
      totaldays: totalDays,
      totalno: totalNo,
      totalplease: totalPlease,
      totalAnalysis: msg_count,
      countryTotals: {
        ai: msg_count,
        say: totalChars,
        day: totalDays,
        no: totalNo,
        please: totalPlease,
        word,
      },
      ai: msg_count,
      word,
      day: totalDays,
      no: totalNo,
      say: totalChars,
      please: totalPlease,
      total_messages: msg_count,
      avg_user_message_length: word,
      work_days: totalDays,
      jiafang_count: totalNo,
      total_chars: totalChars,
      ketao_count: totalPlease,
      _meta: {
        rowCount: data.length,
        at: new Date().toISOString(),
      },
    };

    // 写入缓存
    try {
      await env.STATS_STORE?.put(
        cacheKey,
        JSON.stringify({ data: result, ts: Date.now() }),
        { expirationTtl: KV_CACHE_TTL }
      );
    } catch (e) {
      // 缓存写入失败不影响响应
    }

    c.header('Cache-Control', `public, max-age=${KV_CACHE_TTL}`);
    return c.json({ success: true, ...result });
  } catch (e: any) {
    console.error('[Worker] /api/global-aggregate 错误:', e);
    return c.json({ success: false, error: e.message || '服务器错误' }, 500);
  }
});

/**
 * 【方案 B 代理查询】GET /api/country-top-metrics?country=CN&topN=10
 * 目的：
 * - 让前端/调试可以直接通过 Worker 域名拿到“某国家 6 个指标 TopN 榜单”原始数据
 * - 内部调用 Supabase RPC：/rest/v1/rpc/get_country_top_metrics_v1
 *
 * 返回：
 * - success: true/false
 * - data: RPC 返回的 6 项数组（每项含 leaders[]）
 */
app.get('/api/country-top-metrics', async (c) => {
  try {
    const env = c.env;
    if (!env.SUPABASE_URL || !env.SUPABASE_KEY) {
      return c.json({ success: false, error: 'Supabase 未配置' }, 500);
    }

    const countryRaw = String(c.req.query('country') || '').trim();
    const cc = countryRaw.toUpperCase();
    if (!/^[A-Z]{2}$/.test(cc)) {
      return c.json({ success: false, error: 'country 必填且为 2 位国家代码' }, 400);
    }

    const topNRaw = String(c.req.query('topN') || '').trim();
    const topN = (() => {
      const n = parseInt(topNRaw, 10);
      if (Number.isFinite(n) && n > 0) return Math.max(3, Math.min(20, n));
      return 10;
    })();

    const langRaw = String(c.req.query('lang') || '').trim().toLowerCase();
    const lang = langRaw === 'en' ? 'en' : 'zh';

    const rpcUrl = `${env.SUPABASE_URL}/rest/v1/rpc/get_country_top_metrics_v1`;
    const raw = await fetchSupabaseJson<any>(
      env,
      rpcUrl,
      {
        method: 'POST',
        headers: buildSupabaseHeaders(env, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({ country_code: cc, top_n: topN }),
      },
      SUPABASE_FETCH_TIMEOUT_MS
    );

    // 轻量映射：保证 label/字段稳定（并提供英文标签），并对 leaders 做兜底清洗
    const EN_LABELS: Record<string, { labelEn: string; labelZh: string; format?: 'int' | 'float' }> = {
      total_messages: { labelEn: 'AI Interactions', labelZh: '调戏AI次数', format: 'int' },
      total_chars: { labelEn: 'Total Chars', labelZh: '对话字符数', format: 'int' },
      total_user_chars: { labelEn: 'User Chars', labelZh: '废话输出', format: 'int' },
      avg_user_message_length: { labelEn: 'Avg Len', labelZh: '平均长度', format: 'float' },
      jiafang_count: { labelEn: 'Client Mode', labelZh: '甲方上身', format: 'int' },
      ketao_count: { labelEn: 'Humble Mode', labelZh: '磕头', format: 'int' },
    };
    const translateTitle = (s: any) => {
      const rawS = String(s ?? '').trim();
      if (lang !== 'en' || !rawS) return rawS;
      // 最小兜底：常见中文称号 -> 英文（与前端 fallback 保持一致）
      if (rawS.includes('码农')) return 'Code Monkey';
      if (rawS.includes('架构')) return 'Architect';
      return rawS;
    };

    const data = Array.isArray(raw)
      ? raw.map((it: any) => {
          const key = String(it?.key || it?.col || '').trim();
          const meta = EN_LABELS[key] || null;
          const leaders = Array.isArray(it?.leaders) ? it.leaders : [];
          const normLeaders = leaders.map((row: any, idx: number) => {
            const u = row?.user || {};
            // 如果有 title/label 之类字段，英文时做翻译兜底
            if (lang === 'en') {
              if (u && typeof u === 'object') {
                if (u.title != null) u.title = translateTitle(u.title);
                if (u.label != null) u.label = translateTitle(u.label);
                if (u.personality_title != null) u.personality_title = translateTitle(u.personality_title);
              }
            }
            return {
              rank: Number(row?.rank) || (idx + 1),
              score: row?.score ?? null,
              user: u,
            };
          });

          // 确保 total_chars 对应 tc 别名（便于调试定位）
          const outIt: any = { ...it, leaders: normLeaders };
          if (meta) {
            outIt.labelEn = meta.labelEn;
            outIt.labelZh = meta.labelZh;
            outIt.format = outIt.format || meta.format;
          }
          if (key === 'total_chars') outIt.tc = outIt.score ?? null;
          return outIt;
        })
      : raw;

    // 抗抖：短缓存，便于 100 并发查询
    c.header('Cache-Control', 'public, max-age=30');
    return c.json({
      success: true,
      country: cc,
      topN,
      lang,
      data,
    });
  } catch (e: any) {
    // 常见错误：RPC 未部署（404/400），或权限不足（401/403）
    console.error('[Worker] /api/country-top-metrics 错误:', e);
    return c.json({ success: false, error: e?.message || '服务器错误' }, 500);
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

    c.header('Cache-Control', 'public, max-age=600');
    return c.json(result);
  } catch (error: any) {
    console.error('[Worker] ❌ /api/stats/dashboard 错误:', error);
    c.header('Cache-Control', 'public, max-age=600');
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
      // 聚合查询：SUM 结果完整映射到根节点和 countryTotals，供前端消除 0 值
      Promise.all([
        fetchSupabase(env, `${env.SUPABASE_URL}/rest/v1/user_analysis?select=created_at&order=created_at.asc&limit=1`),
        fetchSupabase(env, `${env.SUPABASE_URL}/rest/v1/user_analysis?select=total_chars`, { headers: { 'Prefer': 'count=exact' } }),
        fetchSupabase(env, `${env.SUPABASE_URL}/rest/v1/user_analysis?select=total_messages`),
        fetchSupabase(env, `${env.SUPABASE_URL}/rest/v1/user_analysis?select=work_days,jiafang_count,ketao_count`),
        fetchSupabase(env, `${env.SUPABASE_URL}/rest/v1/user_analysis?select=personality_type`),
        fetchSupabase(env, `${env.SUPABASE_URL}/rest/v1/user_analysis?select=personality_type,ip_location,created_at,user_name,work_days,github_username,user_identity,fingerprint,updated_at&order=updated_at.desc&limit=20`),
      ]),
    ]);

    // 【处理视图 A (v_global_stats_v6)】获取 averages (L, P, D, E, F) 和 total_users
    let globalAverage: { L: number; P: number; D: number; E: number; F: number } = defaultAverage;
    let totalUsers: number = 1;
    let totalRoastWords: number = 0;
    let cityCount: number = 0;
    let totalAnalysis: number = 0; // 总记录数（分析次数）= SUM(total_messages)
    let totalCharsSum: number = 0; // total_chars 的总和（吐槽字数）
    let workDaysSum: number = 0;
    let jiafangSum: number = 0;
    let ketaoSum: number = 0;
    let systemDays: number = 1; // 系统运行天数（从最早记录到现在）
    let avgChars: number = 0; // 平均吐槽字数（AVG(total_chars)）
    let avgPerScan: number = 0; // 【新增】单次平均篇幅（优先使用视图字段）
    let avgCharsPerUser: number = 0; // 【新增】人均平均篇幅（优先使用视图字段）
    let personalityDistribution: Array<{ type: string; count: number }> = []; // 人格分布（前三个）
    let latestRecords: Array<{ personality_type: string; ip_location: string; created_at: string; name: string; type: string; location: string; time: string; work_days?: number; usage_days?: number; github_username?: string | null; user_identity?: string | null; fingerprint?: string | null; user_name?: string | null }> = []; // 最新记录（含 work_days 供 stats2 上岗天数）

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
        
        // 【处理聚合查询】SUM 结果完整映射，所有数值 Number() 防止字符串干扰
        try {
          const [earliestRes, charsRes, messagesRes, dimsRes, personalityRes, latestRes] = await aggregationRes;

          // totalAnalysis 仅来源于 SUM(total_messages)
          if (messagesRes && messagesRes.ok) {
            try {
              const messagesData = await messagesRes.json();
              if (Array.isArray(messagesData)) {
                totalAnalysis = messagesData.reduce((sum: number, item: any) => sum + (Number(item.total_messages) || 0), 0);
                totalAnalysis = Number(totalAnalysis) || 0;
              }
            } catch (_) {
              totalAnalysis = 0;
            }
          }

          // work_days, jiafang_count, ketao_count 求和，供根节点与 countryTotals
          if (dimsRes && dimsRes.ok) {
            try {
              const dimsData = await dimsRes.json();
              if (Array.isArray(dimsData)) {
                workDaysSum = dimsData.reduce((s: number, i: any) => s + (Number(i.work_days) || 0), 0);
                jiafangSum = dimsData.reduce((s: number, i: any) => s + (Number(i.jiafang_count) || 0), 0);
                ketaoSum = dimsData.reduce((s: number, i: any) => s + (Number(i.ketao_count) || 0), 0);
                workDaysSum = Number(workDaysSum) || 0;
                jiafangSum = Number(jiafangSum) || 0;
                ketaoSum = Number(ketaoSum) || 0;
              }
            } catch (_) {}
          }

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
          
          // total_chars 总和（say）：强制 Number() 防止字符串
          if (charsRes && charsRes.ok) {
            const charsData = await charsRes.json();
            if (Array.isArray(charsData)) {
              totalCharsSum = charsData.reduce((sum: number, item: any) => sum + (Number(item.total_chars) || 0), 0);
              totalCharsSum = Number(totalCharsSum) || 0;
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
          
          // 【处理最新记录】获取最近记录（含 work_days，供 stats2 抽屉「上岗天数」正确显示）
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
                  time: item.updated_at || item.created_at || new Date().toISOString(),
                  work_days: item.work_days != null ? Number(item.work_days) : undefined,
                  usage_days: item.work_days != null ? Number(item.work_days) : undefined,
                  github_username: item.github_username || null,
                  user_identity: item.user_identity || null,
                  fingerprint: item.fingerprint || null,
                  user_name: item.user_name || null,
                  jiafang_rank: item.jiafang_rank != null ? Number(item.jiafang_rank) : null,
                  ketao_rank: item.ketao_rank != null ? Number(item.ketao_rank) : null,
                  days_rank: item.days_rank != null ? Number(item.days_rank) : null,
                  country_code: item.country_code != null ? String(item.country_code) : null,
                } as any));
                
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
    // 【止血】采样 5% 触发，避免每次请求都全量更新 KV
    if (updateKV && env.STATS_STORE && Math.random() < 0.05) {
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
        
        // 原子性写入：将所有统计数据打包成一个 JSON 对象存入 KV（脏检查在 secureKVPut 内）
        await secureKVPut(env, KV_KEY_GLOBAL_STATS_CACHE, JSON.stringify(globalStatsCache));
        
        // 兼容旧版本：同时写入 global_average（保持向后兼容）
        const cachePayload = {
          ...globalAverage,
          dimensions: defaultDimensions,
          totalAnalysis: Number(totalAnalysis) || 0,
          totalChars: Number(totalCharsSum) || 0,
        };
        await secureKVPut(env, KV_KEY_GLOBAL_AVERAGE, JSON.stringify(cachePayload));
        await secureKVPut(env, KV_KEY_LAST_UPDATE, now.toString());
        
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
      // 2. 参与人数 (必须有，不然卡片显示 0)；强制数字防字符串
      totalUsers: Number(finalTotalUsers) || 1,
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
      // 5. 其他统计数据；根节点小写命名与 totalanalysis 一致，打通全维度数据链
      totalRoastWords: Number(totalRoastWords) || 0,
      totalChars: Number(totalCharsSum) || 0,
      total_chars: Number(totalCharsSum) || 0,
      totalchars: Number(totalCharsSum) || 0, // 全小写，与 totalanalysis 一致
      totalAnalysis: Number(totalAnalysis) || 0,
      totalanalysis: Number(totalAnalysis) || 0,
      work_days: Number(workDaysSum) || Number(systemDays) || 0,
      totaldays: Number(workDaysSum) || Number(systemDays) || 0, // total_chars -> totalchars, work_days -> totaldays
      jiafang_count: Number(jiafangSum) || 0,
      totalno: Number(jiafangSum) || 0, // jiafang_count -> totalno
      ketao_count: Number(ketaoSum) || 0,
      totalplease: Number(ketaoSum) || 0, // ketao_count -> totalplease
      avgPerScan: Number(avgPerScan) || 0,
      avgCharsPerUser: Number(avgCharsPerUser) || 0,
      avgPerUser: Number(avgCharsPerUser) || 0,
      systemDays: Number(systemDays) || 1,
      cityCount: Number(cityCount) || 0,
      avgChars: Number(avgChars) || 0,
      // countryTotals：SUM 结果完整映射，与前端 normalizeStats 对齐
      countryTotals: {
        ai: Number(totalAnalysis) || 0,
        say: Number(totalCharsSum) || 0,
        day: Number(workDaysSum) || Number(systemDays) || 0,
        no: Number(jiafangSum) || 0,
        please: Number(ketaoSum) || 0,
        word: Number(avgPerScan) || Number(avgChars) || 0,
      },
      locationRank: locationRank,
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
      totalRoastWords: 0,
      totalChars: 0,
      total_chars: 0,
      totalchars: 0,
      totalAnalysis: 0,
      totalanalysis: 0,
      work_days: 0,
      totaldays: 0,
      jiafang_count: 0,
      totalno: 0,
      ketao_count: 0,
      totalplease: 0,
      avgPerScan: 0,
      avgCharsPerUser: 0,
      avgPerUser: 0,
      systemDays: 1,
      avgChars: 0,
      cityCount: 0,
      countryTotals: { ai: 0, say: 0, day: 0, no: 0, please: 0, word: 0 },
      locationRank: [],
      recentVictims: [],
      personalityDistribution: [],
      latestRecords: [],
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
    await secureKVPut(env, KV_KEY_GLOBAL_AVERAGE, JSON.stringify(cachePayload));
    await secureKVPut(env, KV_KEY_LAST_UPDATE, now.toString());

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

      await secureKVPut(env, KV_KEY_GLOBAL_STATS_V6, JSON.stringify(newGlobalStats));
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

      await secureKVPut(env, KV_KEY_GLOBAL_STATS_V6, JSON.stringify(initialStats));
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

    await secureKVPut(env, KV_KEY_GLOBAL_STATS_V6, JSON.stringify(globalStats));
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

/** rank_l..rank_h 映射为大写 L,P,D,E,F,G,H 存入 ranks 对象 */
const RANK_V3_TO_LETTER: Record<string, string> = {
  rank_l: 'L', rank_m: 'P', rank_n: 'D', rank_o: 'E', rank_p: 'F', rank_g: 'G', rank_h: 'H',
};
const RANK_V3_FIELDS = ['rank_l', 'rank_m', 'rank_n', 'rank_o', 'rank_p', 'rank_g', 'rank_h'] as const;

/** 仅限 Cron 调用：计算各国 6 维累积并写入 KV GLOBAL_COUNTRY_STATS，接口只读不写。调用 get_country_ranks_v3，以国家代码为 Top Key 存入 ranks 对象。 */
async function writeGlobalCountryStatsToKV(env: Env): Promise<{ success: boolean; error?: string }> {
  if (!env.STATS_STORE || !env.SUPABASE_URL || !env.SUPABASE_KEY) {
    return { success: false, error: 'STATS_STORE 或 Supabase 未配置' };
  }
  try {
    let rpcList: any[] = [];
    try {
      const rpcUrl = `${env.SUPABASE_URL}/rest/v1/rpc/get_country_ranks_v3`;
      const rpcRows = await fetchSupabaseJson<any>(env, rpcUrl, {
        method: 'POST',
        headers: buildSupabaseHeaders(env, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({}),
      }, SUPABASE_FETCH_TIMEOUT_MS);
      rpcList = Array.isArray(rpcRows) ? rpcRows : (rpcRows ? [rpcRows] : []);
    } catch (v3Err) {
      const fallbackUrl = `${env.SUPABASE_URL}/rest/v1/rpc/get_country_ranks_v2`;
      const fallbackRows = await fetchSupabaseJson<any>(env, fallbackUrl, {
        method: 'POST',
        headers: buildSupabaseHeaders(env, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({}),
      }, SUPABASE_FETCH_TIMEOUT_MS);
      rpcList = Array.isArray(fallbackRows) ? fallbackRows : (fallbackRows ? [fallbackRows] : []);
    }
    const totalCountries = Math.max(1, rpcList.length);
    const n = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : 0);
    const byCountry: Record<string, any> = {};
    const country_level: any[] = [];
    for (const it of rpcList) {
      const cc = String(it?.country_code ?? it?.ip_location ?? '').trim().toUpperCase() || 'XX';
      const total_users = n(it.total_users ?? it.users ?? it.totalUsers);
      const ranks: Record<string, number> = {};
      const v2Map: Record<string, string> = {
        rank_l: 'rank_messages', rank_m: 'rank_total_chars', rank_n: 'rank_total_user_chars',
        rank_o: 'rank_avg_len', rank_p: 'rank_jiafang', rank_g: 'rank_ketao', rank_h: 'rank_work_days',
      };
      for (const v3f of RANK_V3_FIELDS) {
        const rv3 = it[v3f];
        const rv2 = it[v2Map[v3f]];
        const val = n(rv3 ?? rv2 ?? 0);
        const letter = RANK_V3_TO_LETTER[v3f] || v3f;
        ranks[letter] = val > 0 ? val : 0;
      }
      const level = {
        country_code: cc,
        total_messages_sum: n(it.tm ?? it.total_messages ?? it.total_messages_sum),
        total_chars_sum: n(it.tc ?? it.total_chars ?? it.total_chars_sum),
        total_user_chars_sum: n(it.tuc ?? it.total_user_chars ?? it.total_user_chars_sum),
        jiafang_count_sum: n(it.jc ?? it.jiafang_count ?? it.jiafang_count_sum),
        ketao_count_sum: n(it.kc ?? it.ketao_count ?? it.ketao_count_sum),
        work_days_sum: n(it.wd ?? it.work_days_sum),
        avg_user_message_length_sum: n(it.avg_user_message_length ?? it.avg_len) || 0,
        total_users: total_users,
        rank_total_messages: ranks.L || n(it.rank_messages ?? it.rank_total_messages),
        rank_total_chars: ranks.P || n(it.rank_total_chars ?? it.rank_chars),
        rank_total_user_chars: ranks.D || n(it.rank_user_chars ?? it.rank_total_user_chars),
        rank_jiafang: ranks.F || n(it.rank_jiafang ?? it.rank_jiafang_count),
        rank_ketao: ranks.G || n(it.rank_ketao ?? it.rank_ketao_count),
        rank_avg_len: ranks.E || n(it.rank_avg_len ?? it.rank_avg_user_message_length),
        rank_work_days: ranks.H || n(it.rank_h ?? it.rank_work_days),
        total_countries: totalCountries,
        no_competition: total_users <= 1,
      };
      byCountry[cc] = { ranks, total_countries: totalCountries, user_count: total_users, ...level };
      country_level.push(level);
    }
    const payload = {
      ...byCountry,
      _meta: { total_countries: totalCountries, updated_at: new Date().toISOString() },
      country_level,
      updated_at: new Date().toISOString(),
    };
    await env.STATS_STORE.put(KV_KEY_GLOBAL_COUNTRY_STATS, JSON.stringify(payload), { expirationTtl: KV_CACHE_TTL * 2 });
    console.log('[Worker] ✅ GLOBAL_COUNTRY_STATS 已写入 KV，国家数:', country_level.length);
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message || String(e) };
  }
}

/**
 * 天梯榜快照刷新：调用 Supabase RPC refresh_leaderboard_snapshots()
 * 计算 22 维度 x daily/all_time 的 Top10 并写入 leaderboard_snapshots 表；带有限重试以提升 Cron 稳健性
 */
async function refreshLeaderboardSnapshots(env: Env): Promise<{ success: boolean; error?: string }> {
  if (!env.SUPABASE_URL || !env.SUPABASE_KEY) return { success: false, error: 'Supabase 未配置' };
  const rpcUrl = `${env.SUPABASE_URL}/rest/v1/rpc/refresh_leaderboard_snapshots`;
  const maxAttempts = 3;
  const retryDelayMs = 3000;
  const timeoutMs = SUPABASE_FETCH_TIMEOUT_MS * 2;
  let lastError: string | undefined;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetchSupabaseJson<{ ok?: boolean; count?: number }>(env, rpcUrl, {
        method: 'POST',
        headers: buildSupabaseHeaders(env, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({}),
      }, timeoutMs);
      if (res && (res as any).ok) {
        console.log('[Worker] ✅ 天梯榜快照刷新完成');
        return { success: true };
      }
      lastError = 'RPC 返回异常';
    } catch (e: any) {
      lastError = e?.message || String(e);
      if (attempt < maxAttempts) {
        console.warn(`[Worker] ⚠️ 天梯榜快照第 ${attempt} 次失败，${retryDelayMs / 1000}s 后重试:`, lastError);
        await new Promise((r) => setTimeout(r, retryDelayMs));
      }
    }
  }
  return { success: false, error: lastError };
}

/**
 * 【Cron】定期汇总任务（ES Module 格式必须导出，D1 等 binding 才可用）
 * 在 wrangler.toml 的 triggers.crons 中配置
 */
export async function scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
  console.log('[Worker] 开始定期汇总任务（Cron Trigger）...', {
    type: event.type,
    scheduledTime: new Date(event.scheduledTime * 1000).toISOString(),
    cron: event.cron,
  });
  const cron = String(event.cron || '').trim();
  if (cron === '*/10 * * * *') {
    const r = await refreshCountryStatsCurrent(env);
    if (r.success) console.log('[Worker] ✅ 国家累计 rollup 刷新完成');
    else console.warn('[Worker] ⚠️ 国家累计 rollup 刷新失败:', r.error);
    return;
  }
  if (cron === '0 2 * * *') {
    ctx.waitUntil(dailyGitHubAudit(env));
    return;
  }
  if (cron === '0 * * * *') {
    try {
      const lbResult = await refreshLeaderboardSnapshots(env);
      if (!lbResult.success) console.warn('[Worker] ⚠️ 天梯榜快照刷新失败:', lbResult.error);
    } catch (lbErr: any) {
      console.warn('[Worker] ⚠️ 天梯榜快照刷新异常，继续执行后续聚合:', lbErr?.message || lbErr);
    }
  }
  const result = await performAggregation(env);
  const v6Result = await performV6Aggregation(env);
  const countryRollup = await refreshCountryStatsCurrent(env);
  if (result.success && v6Result.success && countryRollup.success) {
    console.log('[Worker] ✅ 定期汇总任务完成（包含 V6 + 国家 rollup）');
  } else {
    console.error('[Worker] ❌ 定期汇总任务失败:', {
      aggregation: result.error,
      v6Aggregation: v6Result.error,
      countryRollup: countryRollup.error,
    });
  }
}

/** ES Module 格式：必须 default 导出 { fetch, scheduled }，D1/KV 等 binding 才可用 */
export default {
  fetch: app.fetch,
  scheduled,
};
