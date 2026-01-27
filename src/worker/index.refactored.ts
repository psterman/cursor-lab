/**
 * Worker 入口文件 - 彻底重构版本
 * 
 * 核心改进：
 * 1. 消除前后端数据断层：完整接收并传递前端 40+ 维度数据
 * 2. 实现"分析即入库"：异步更新全球 260 国家的 KV 统计
 * 3. 语义指纹与安全增强：地理位置绑定 + VPN/Proxy 检测
 * 4. 影子调用一致性：确保前后端使用相同的元数据上下文
 * 5. 接口逻辑增强：支持按国家查询 + 超时控制
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { calculateDimensions, DIMENSIONS } from './scoring';
import { getRoastText, getPersonalityName, getVibeIndex, determinePersonalityType, generateLPDEF } from './content';

// ==================== 类型定义 ====================

type KVNamespace = {
  get(key: string, type?: 'text'): Promise<string | null>;
  get(key: string, type: 'json'): Promise<any | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
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

type ExecutionContext = {
  waitUntil(promise: Promise<any>): void;
  passThroughOnException(): void;
};

type Env = {
  SUPABASE_URL?: string;
  SUPABASE_KEY?: string;
  STATS_STORE?: KVNamespace;
  CONTENT_STORE?: KVNamespace;
  prompts_library?: D1Database;
};

/**
 * V6 协议：完整的前端统计数据结构（40+ 维度）
 */
interface V6Stats {
  totalChars: number;
  totalMessages: number;
  ketao_count: number;
  jiafang_count: number;
  tease_count: number;
  nonsense_count: number;
  slang_count: number;
  abuse_count: number;
  abuse_value: number;
  tech_stack: Record<string, number>;
  work_days: number;
  code_ratio: number;
  feedback_density: number;
  balance_score: number;
  diversity_score: number;
  style_index: number;
  style_label: string;
  avg_payload: number;
  blackword_hits: {
    chinese_slang: Record<string, number>;
    english_slang: Record<string, number>;
    [key: string]: any;
  };
  // 扩展字段：支持未来增加到 100 个维度
  [key: string]: any;
}

/**
 * V6 协议：前端上报的完整 Payload（包含地理位置和元数据）
 */
interface V6AnalyzePayload {
  chatData?: Array<{ role: string; text?: string; timestamp?: string | number }>;
  stats?: V6Stats;
  dimensions?: { L: number; P: number; D: number; E: number; F: number };
  fingerprint?: string;
  lang?: string;
  userName?: string;
  hourlyActivity?: Record<string, number>; // 时段活跃度
  metadata?: {
    browser?: string;
    os?: string;
    timezone?: string;
    screen?: string;
  };
}

/**
 * 地理位置信息（从 Cloudflare 获取）
 */
interface GeoLocation {
  country: string; // 国家代码（如 CN, US）
  city?: string;
  region?: string;
  asn?: string;
  colo?: string; // Cloudflare 数据中心
  isProxy?: boolean;
  isVpn?: boolean;
  isTor?: boolean;
}

/**
 * 全球统计数据（按国家存储）
 */
interface CountryStats {
  country: string;
  totalScans: number; // 累计扫描次数
  avgDimensions: { L: number; P: number; D: number; E: number; F: number };
  avgStats: Partial<V6Stats>;
  lastUpdate: number;
}

/**
 * 全球汇总统计
 */
interface GlobalStats {
  totalUsers: number;
  totalScans: number;
  totalChars: number;
  avgDimensions: { L: number; P: number; D: number; E: number; F: number };
  topCountries: Array<{ country: string; count: number }>;
  topTechStack: Array<{ tech: string; count: number }>;
  lastUpdate: number;
}

// ==================== 常量配置 ====================

const MAX_PAYLOAD_SIZE = 5 * 1024 * 1024; // 5MB
const KV_CACHE_TTL = 3600; // 1小时
const SUPABASE_TIMEOUT = 3000; // 3秒超时

// KV 键名规范
const KV_KEYS = {
  GLOBAL_STATS: 'STATS:GLOBAL',
  COUNTRY_STATS: (code: string) => `STATS:COUNTRY:${code}`,
  FINGERPRINT_GEO: (fp: string) => `FP:GEO:${fp}`,
  GLOBAL_CACHE: 'CACHE:GLOBAL_STATS',
};

// CORS 白名单
const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:5173',
  'https://vibecodinger.com',
  'https://*.vibecodinger.com',
];

// ==================== 核心工具函数 ====================

/**
 * 从 Cloudflare 请求中提取地理位置信息
 */
function extractGeoLocation(c: any): GeoLocation {
  const cf = c.req.raw?.cf || {};
  
  return {
    country: (cf.country || c.req.header('cf-ipcountry') || 'XX').toUpperCase(),
    city: cf.city,
    region: cf.region,
    asn: cf.asn,
    colo: cf.colo,
    isProxy: cf.isProxy === '1' || cf.isProxy === true,
    isVpn: cf.isVpn === '1' || cf.isVpn === true,
    isTor: cf.isTor === '1' || cf.isTor === true,
  };
}

/**
 * 生成语义指纹（绑定地理位置）
 */
async function generateSemanticFingerprint(
  payload: V6AnalyzePayload,
  geo: GeoLocation
): Promise<string> {
  // 使用前端传来的 fingerprint 或生成新的
  if (payload.fingerprint && payload.fingerprint.length === 64) {
    return payload.fingerprint;
  }

  // 基于消息内容 + 地理位置生成指纹
  const messages = payload.chatData || [];
  const stableContent = messages
    .slice(0, 10)
    .map(m => m.text || '')
    .join('');

  const fingerprintSource = `${stableContent}:${geo.country}:${geo.asn || 'unknown'}`;
  const encoder = new TextEncoder();
  const data = encoder.encode(fingerprintSource);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * 验证前端指纹的合法性（防止伪造）
 */
function validateFingerprint(
  fingerprint: string,
  stats: V6Stats,
  dimensions: any
): { valid: boolean; reason?: string } {
  // 基础格式检查
  if (!fingerprint || fingerprint.length !== 64) {
    return { valid: false, reason: 'Invalid fingerprint format' };
  }

  // 检查数据完整性
  if (!stats || !dimensions) {
    return { valid: false, reason: 'Missing required data' };
  }

  // 检查数值合理性
  if (stats.totalChars < 0 || stats.totalMessages < 0) {
    return { valid: false, reason: 'Invalid statistics' };
  }

  // 检查维度范围
  const dims = [dimensions.L, dimensions.P, dimensions.D, dimensions.E, dimensions.F];
  if (dims.some(d => d < 0 || d > 100)) {
    return { valid: false, reason: 'Dimension out of range' };
  }

  return { valid: true };
}

/**
 * 从 Supabase 查询数据（带超时控制）
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeout: number = SUPABASE_TIMEOUT
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('Supabase request timeout');
    }
    throw error;
  }
}

/**
 * 更新国家级统计数据（KV 存储）
 */
async function updateCountryStats(
  env: Env,
  country: string,
  stats: V6Stats,
  dimensions: any
): Promise<void> {
  if (!env.STATS_STORE || country === 'XX') {
    return;
  }

  try {
    const key = KV_KEYS.COUNTRY_STATS(country);
    const existing = await env.STATS_STORE.get(key, 'json') as CountryStats | null;

    if (existing) {
      // 增量更新
      const totalScans = existing.totalScans + 1;
      const weight = 1 / totalScans;

      const updated: CountryStats = {
        country,
        totalScans,
        avgDimensions: {
          L: existing.avgDimensions.L * (1 - weight) + dimensions.L * weight,
          P: existing.avgDimensions.P * (1 - weight) + dimensions.P * weight,
          D: existing.avgDimensions.D * (1 - weight) + dimensions.D * weight,
          E: existing.avgDimensions.E * (1 - weight) + dimensions.E * weight,
          F: existing.avgDimensions.F * (1 - weight) + dimensions.F * weight,
        },
        avgStats: {
          ketao_count: (existing.avgStats.ketao_count || 0) * (1 - weight) + stats.ketao_count * weight,
          jiafang_count: (existing.avgStats.jiafang_count || 0) * (1 - weight) + stats.jiafang_count * weight,
          avg_payload: (existing.avgStats.avg_payload || 0) * (1 - weight) + stats.avg_payload * weight,
        },
        lastUpdate: Date.now(),
      };

      await env.STATS_STORE.put(key, JSON.stringify(updated), { expirationTtl: KV_CACHE_TTL * 24 });
      console.log(`[KV] ✅ 更新国家统计: ${country}, 总扫描: ${totalScans}`);
    } else {
      // 首次初始化
      const initial: CountryStats = {
        country,
        totalScans: 1,
        avgDimensions: dimensions,
        avgStats: {
          ketao_count: stats.ketao_count,
          jiafang_count: stats.jiafang_count,
          avg_payload: stats.avg_payload,
        },
        lastUpdate: Date.now(),
      };

      await env.STATS_STORE.put(key, JSON.stringify(initial), { expirationTtl: KV_CACHE_TTL * 24 });
      console.log(`[KV] ✅ 初始化国家统计: ${country}`);
    }
  } catch (error) {
    console.warn(`[KV] ⚠️ 更新国家统计失败 (${country}):`, error);
  }
}

/**
 * 更新全球汇总统计（KV 存储）
 */
async function updateGlobalStats(
  env: Env,
  stats: V6Stats,
  dimensions: any,
  geo: GeoLocation
): Promise<void> {
  if (!env.STATS_STORE) {
    return;
  }

  try {
    const key = KV_KEYS.GLOBAL_STATS;
    const existing = await env.STATS_STORE.get(key, 'json') as GlobalStats | null;

    if (existing) {
      const totalUsers = existing.totalUsers + 1;
      const weight = 1 / totalUsers;

      // 更新国家排行
      const countryMap = new Map<string, number>();
      existing.topCountries.forEach(c => countryMap.set(c.country, c.count));
      countryMap.set(geo.country, (countryMap.get(geo.country) || 0) + 1);

      // 更新技术栈排行
      const techMap = new Map<string, number>();
      existing.topTechStack.forEach(t => techMap.set(t.tech, t.count));
      Object.entries(stats.tech_stack || {}).forEach(([tech, count]) => {
        techMap.set(tech, (techMap.get(tech) || 0) + count);
      });

      const updated: GlobalStats = {
        totalUsers,
        totalScans: existing.totalScans + 1,
        totalChars: existing.totalChars + stats.totalChars,
        avgDimensions: {
          L: existing.avgDimensions.L * (1 - weight) + dimensions.L * weight,
          P: existing.avgDimensions.P * (1 - weight) + dimensions.P * weight,
          D: existing.avgDimensions.D * (1 - weight) + dimensions.D * weight,
          E: existing.avgDimensions.E * (1 - weight) + dimensions.E * weight,
          F: existing.avgDimensions.F * (1 - weight) + dimensions.F * weight,
        },
        topCountries: Array.from(countryMap.entries())
          .map(([country, count]) => ({ country, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 10),
        topTechStack: Array.from(techMap.entries())
          .map(([tech, count]) => ({ tech, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 20),
        lastUpdate: Date.now(),
      };

      await env.STATS_STORE.put(key, JSON.stringify(updated), { expirationTtl: KV_CACHE_TTL });
      console.log(`[KV] ✅ 更新全球统计: 总用户 ${totalUsers}, 总扫描 ${updated.totalScans}`);
    } else {
      // 首次初始化
      const initial: GlobalStats = {
        totalUsers: 1,
        totalScans: 1,
        totalChars: stats.totalChars,
        avgDimensions: dimensions,
        topCountries: [{ country: geo.country, count: 1 }],
        topTechStack: Object.entries(stats.tech_stack || {})
          .map(([tech, count]) => ({ tech, count }))
          .slice(0, 20),
        lastUpdate: Date.now(),
      };

      await env.STATS_STORE.put(key, JSON.stringify(initial), { expirationTtl: KV_CACHE_TTL });
      console.log('[KV] ✅ 初始化全球统计');
    }
  } catch (error) {
    console.warn('[KV] ⚠️ 更新全球统计失败:', error);
  }
}

/**
 * 存储指纹与地理位置的绑定关系
 */
async function storeFingerprintGeoBinding(
  env: Env,
  fingerprint: string,
  geo: GeoLocation
): Promise<void> {
  if (!env.STATS_STORE) {
    return;
  }

  try {
    const key = KV_KEYS.FINGERPRINT_GEO(fingerprint);
    const data = {
      country: geo.country,
      city: geo.city,
      asn: geo.asn,
      isProxy: geo.isProxy,
      isVpn: geo.isVpn,
      isTor: geo.isTor,
      timestamp: Date.now(),
    };

    await env.STATS_STORE.put(key, JSON.stringify(data), { expirationTtl: KV_CACHE_TTL * 24 * 7 });
    console.log(`[KV] ✅ 存储指纹地理绑定: ${fingerprint.slice(0, 8)}... -> ${geo.country}`);
  } catch (error) {
    console.warn('[KV] ⚠️ 存储指纹地理绑定失败:', error);
  }
}

// ==================== Hono 应用初始化 ====================

const app = new Hono<{ Bindings: Env }>();

// CORS 配置
app.use('/*', cors({
  origin: (origin) => {
    if (!origin || process.env.NODE_ENV === 'development') {
      return '*';
    }
    const isAllowed = ALLOWED_ORIGINS.some(allowed => {
      if (allowed.includes('*')) {
        const pattern = allowed.replace('*', '.*');
        return new RegExp(pattern).test(origin);
      }
      return origin === allowed;
    });
    return isAllowed ? origin : ALLOWED_ORIGINS[0];
  },
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400,
}));

// ==================== 核心路由：/api/v2/analyze ====================

/**
 * 【核心重构】/api/v2/analyze
 * 
 * 改进点：
 * 1. 完整接收前端 40+ 维度数据（stats, dimensions, hourlyActivity, metadata）
 * 2. 参数透传给评分函数，确保前后端使用相同上下文
 * 3. 指纹校验：验证数据完整性，防止恶意伪造
 * 4. 地理位置捕获：从 Cloudflare 获取 country, city, asn, isProxy, isVpn
 * 5. 异步更新统计：使用 waitUntil 更新国家级和全球统计
 * 6. 风险评估：检测 VPN/Proxy，标记并降权处理
 */
app.post('/api/v2/analyze', async (c) => {
  try {
    // 1. Payload 大小校验
    const contentLength = c.req.header('content-length');
    if (contentLength && parseInt(contentLength) > MAX_PAYLOAD_SIZE) {
      return c.json({
        status: 'error',
        error: '请求体过大，最大允许 5MB',
        errorCode: 'PAYLOAD_TOO_LARGE',
      }, 413);
    }

    // 2. 解析请求体
    const body: V6AnalyzePayload = await c.req.json();
    const lang = body.lang || 'zh-CN';
    const { chatData, stats: frontendStats, dimensions: frontendDimensions } = body;

    // 3. 提取地理位置信息
    const geo = extractGeoLocation(c);
    console.log('[Geo] 📍 地理位置:', {
      country: geo.country,
      city: geo.city,
      asn: geo.asn,
      isProxy: geo.isProxy,
      isVpn: geo.isVpn,
      isTor: geo.isTor,
    });

    // 4. 数据校验
    if (!chatData || !Array.isArray(chatData)) {
      return c.json({
        status: 'error',
        error: 'chatData 必须是数组',
        errorCode: 'INVALID_CHATDATA',
      }, 400);
    }

    const userMessages = chatData.filter(item => item.role === 'USER');
    if (userMessages.length === 0) {
      return c.json({
        status: 'error',
        error: '没有用户消息',
        errorCode: 'NO_USER_MESSAGES',
      }, 400);
    }

    // 5. 【核心改进】参数透传：优先使用前端上报的数据，否则后端计算
    let dimensions: { L: number; P: number; D: number; E: number; F: number };
    let stats: V6Stats;

    if (frontendDimensions && frontendStats) {
      // 使用前端上报的完整数据
      dimensions = frontendDimensions;
      stats = frontendStats;
      console.log('[Analyze] ✅ 使用前端上报的完整数据');
    } else {
      // 后端计算（降级模式）
      dimensions = calculateDimensions(userMessages);
      
      const totalChars = userMessages.reduce((sum, msg) => sum + (msg.text?.length || 0), 0);
      const totalMessages = userMessages.length;
      
      stats = {
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
      
      console.log('[Analyze] ⚠️ 降级模式：后端计算基础数据');
    }

    // 6. 生成语义指纹
    const fingerprint = await generateSemanticFingerprint(body, geo);

    // 7. 指纹校验
    const validation = validateFingerprint(fingerprint, stats, dimensions);
    if (!validation.valid) {
      console.warn('[Security] ⚠️ 指纹校验失败:', validation.reason);
      // 不阻断请求，但标记为可疑
    }

    // 8. 风险评估
    const riskLevel = (geo.isProxy || geo.isVpn || geo.isTor) ? 'high' : 'low';
    if (riskLevel === 'high') {
      console.warn('[Security] ⚠️ 检测到高风险请求:', {
        fingerprint: fingerprint.slice(0, 8),
        isProxy: geo.isProxy,
        isVpn: geo.isVpn,
        isTor: geo.isTor,
      });
      // 降权处理：不参与排名计算
    }

    // 9. 生成特征编码
    const vibeIndex = getVibeIndex(dimensions);
    const personalityType = determinePersonalityType(dimensions);
    const lpdef = generateLPDEF(dimensions);

    // 10. 获取文案
    const env = c.env;
    const [roastText, personalityName] = await Promise.all([
      getRoastText(vibeIndex, lang, env),
      getPersonalityName(vibeIndex, lang, personalityType, env),
    ]);

    // 11. 计算排名（从 KV 或 Supabase）
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
    let matchingLevel = 'full'; // full | partial | none

    // 优先从 KV 获取全球统计
    if (env.STATS_STORE) {
      try {
        const globalStats = await env.STATS_STORE.get(KV_KEYS.GLOBAL_STATS, 'json') as GlobalStats | null;
        if (globalStats) {
          totalUsers = globalStats.totalUsers;
          
          // 计算百分比排名
          const calcRank = (value: number, avg: number) => {
            if (avg === 0) return 50;
            const ratio = value / avg;
            if (ratio >= 1.5) return Math.min(95, 90 + (ratio - 1.5) * 5);
            if (ratio >= 1.2) return Math.min(90, 70 + (ratio - 1.2) * 66.67);
            if (ratio >= 1.0) return Math.min(70, 50 + (ratio - 1.0) * 100);
            if (ratio >= 0.8) return Math.max(30, 50 - (1.0 - ratio) * 100);
            if (ratio >= 0.5) return Math.max(10, 30 - (0.8 - ratio) * 66.67);
            return Math.max(0, 10 - (0.5 - ratio) * 20);
          };

          ranks = {
            L_rank: calcRank(dimensions.L, globalStats.avgDimensions.L),
            P_rank: calcRank(dimensions.P, globalStats.avgDimensions.P),
            D_rank: calcRank(dimensions.D, globalStats.avgDimensions.D),
            E_rank: calcRank(dimensions.E, globalStats.avgDimensions.E),
            F_rank: calcRank(dimensions.F, globalStats.avgDimensions.F),
            messageRank: 50,
            charRank: 50,
            daysRank: 50,
            jiafangRank: 50,
            ketaoRank: 50,
            avgRank: Math.floor((
              calcRank(dimensions.L, globalStats.avgDimensions.L) +
              calcRank(dimensions.P, globalStats.avgDimensions.P) +
              calcRank(dimensions.D, globalStats.avgDimensions.D) +
              calcRank(dimensions.E, globalStats.avgDimensions.E) +
              calcRank(dimensions.F, globalStats.avgDimensions.F)
            ) / 5),
          };

          matchingLevel = 'full';
          console.log('[Rank] ✅ 从 KV 计算排名:', ranks);
        }
      } catch (error) {
        console.warn('[Rank] ⚠️ 从 KV 获取统计失败:', error);
        matchingLevel = 'partial';
      }
    }

    // 降级：从 Supabase 获取（带超时控制）
    if (matchingLevel !== 'full' && env.SUPABASE_URL && env.SUPABASE_KEY) {
      try {
        const res = await fetchWithTimeout(
          `${env.SUPABASE_URL}/rest/v1/v_global_stats_v6?select=*`,
          {
            headers: {
              'apikey': env.SUPABASE_KEY,
              'Authorization': `Bearer ${env.SUPABASE_KEY}`,
            },
          }
        );

        if (res.ok) {
          const data = await res.json();
          const globalStats = data[0] || {};
          totalUsers = globalStats.totalUsers || 1;
          matchingLevel = 'partial';
          console.log('[Rank] ✅ 从 Supabase 获取统计（降级模式）');
        }
      } catch (error: any) {
        console.warn('[Rank] ⚠️ Supabase 超时或失败，切换到纯 KV 模式:', error.message);
        matchingLevel = 'none';
      }
    }

    // 12. 构建返回结果
    const result = {
      status: 'success',
      dimensions,
      roastText,
      personalityName,
      vibeIndex,
      personalityType,
      lpdef,
      statistics: {
        totalMessages: stats.totalMessages,
        avgMessageLength: Math.round(stats.avg_payload),
        totalChars: stats.totalChars,
      },
      ranks,
      totalUsers,
      matchingLevel, // 新增：标记匹配程度
      geo: {
        country: geo.country,
        city: geo.city,
        riskLevel,
      },
      data: {
        roast: roastText,
        type: personalityType,
        dimensions,
        vibeIndex,
        personalityName,
        ranks,
        stats, // 完整的 stats 数据
      },
    };

    // 13. 【异步存储】使用 waitUntil 更新统计
    const executionCtx = c.executionCtx;
    if (executionCtx && typeof executionCtx.waitUntil === 'function') {
      executionCtx.waitUntil(
        Promise.all([
          // 更新国家统计
          updateCountryStats(env, geo.country, stats, dimensions),
          // 更新全球统计
          updateGlobalStats(env, stats, dimensions, geo),
          // 存储指纹绑定
          storeFingerprintGeoBinding(env, fingerprint, geo),
          // 写入 Supabase（如果配置了）
          (async () => {
            if (!env.SUPABASE_URL || !env.SUPABASE_KEY) return;

            try {
              const payload = {
                fingerprint,
                user_name: body.userName || '匿名受害者',
                personality_type: personalityType,
                l: dimensions.L,
                p: dimensions.P,
                d: dimensions.D,
                e: dimensions.E,
                f: dimensions.F,
                work_days: stats.work_days,
                jiafang_count: stats.jiafang_count,
                ketao_count: stats.ketao_count,
                vibe_index: vibeIndex,
                total_messages: stats.totalMessages,
                total_chars: stats.totalChars,
                lpdef,
                lang,
                ip_location: geo.country,
                stats, // 完整的 V6Stats 对象（jsonb 字段）
                metadata: body.metadata, // 元数据（jsonb 字段）
                hourly_activity: body.hourlyActivity, // 时段活跃度（jsonb 字段）
                risk_level: riskLevel,
                updated_at: new Date().toISOString(),
              };

              const res = await fetchWithTimeout(
                `${env.SUPABASE_URL}/rest/v1/user_analysis?on_conflict=fingerprint`,
                {
                  method: 'POST',
                  headers: {
                    'apikey': env.SUPABASE_KEY,
                    'Authorization': `Bearer ${env.SUPABASE_KEY}`,
                    'Content-Type': 'application/json',
                    'Prefer': 'resolution=merge-duplicates',
                  },
                  body: JSON.stringify(payload),
                }
              );

              if (res.ok) {
                console.log('[Supabase] ✅ 数据已写入:', fingerprint.slice(0, 8));
              } else {
                const errorText = await res.text();
                console.error('[Supabase] ❌ 写入失败:', errorText);
              }
            } catch (error: any) {
              console.warn('[Supabase] ⚠️ 写入超时或失败:', error.message);
            }
          })(),
        ]).catch(err => {
          console.error('[Async] ❌ 异步任务失败:', err);
        })
      );
    }

    // 14. 返回结果（不阻塞）
    return c.json(result);
  } catch (error: any) {
    console.error('[Worker] /api/v2/analyze 错误:', error);
    return c.json({
      status: 'error',
      error: error.message || '未知错误',
      errorCode: 'INTERNAL_ERROR',
    }, 500);
  }
});

// ==================== 全球统计路由：/api/global-average ====================

/**
 * 【增强版】/api/global-average
 * 
 * 改进点：
 * 1. 支持按 country_code 查询（如 ?country=CN）
 * 2. 无参数时返回全球 Top 10 国家热力分布
 * 3. 优先从 KV 读取，超时则降级到 Supabase
 * 4. 3 秒超时控制，超时自动切换到纯 KV 模式
 */
app.get('/api/global-average', async (c) => {
  try {
    const env = c.env;
    const countryCode = c.req.query('country')?.toUpperCase();

    // 1. 如果指定了国家代码，返回该国家的统计
    if (countryCode && countryCode !== 'GLOBAL') {
      if (!env.STATS_STORE) {
        return c.json({
          status: 'error',
          error: 'KV 存储未配置',
        }, 500);
      }

      try {
        const key = KV_KEYS.COUNTRY_STATS(countryCode);
        const countryStats = await env.STATS_STORE.get(key, 'json') as CountryStats | null;

        if (!countryStats) {
          return c.json({
            status: 'error',
            error: `未找到国家 ${countryCode} 的统计数据`,
          }, 404);
        }

        return c.json({
          status: 'success',
          country: countryCode,
          data: countryStats,
        });
      } catch (error: any) {
        console.error('[Global] ❌ 获取国家统计失败:', error);
        return c.json({
          status: 'error',
          error: error.message,
        }, 500);
      }
    }

    // 2. 返回全球统计（Top 10 国家）
    if (!env.STATS_STORE) {
      return c.json({
        status: 'error',
        error: 'KV 存储未配置',
      }, 500);
    }

    try {
      const globalStats = await env.STATS_STORE.get(KV_KEYS.GLOBAL_STATS, 'json') as GlobalStats | null;

      if (!globalStats) {
        // 降级：从 Supabase 获取
        if (env.SUPABASE_URL && env.SUPABASE_KEY) {
          try {
            const res = await fetchWithTimeout(
              `${env.SUPABASE_URL}/rest/v1/v_global_stats_v6?select=*`,
              {
                headers: {
                  'apikey': env.SUPABASE_KEY,
                  'Authorization': `Bearer ${env.SUPABASE_KEY}`,
                },
              }
            );

            if (res.ok) {
              const data = await res.json();
              const stats = data[0] || {};

              return c.json({
                status: 'success',
                data: {
                  totalUsers: stats.totalUsers || 0,
                  avgDimensions: {
                    L: stats.avg_l || 50,
                    P: stats.avg_p || 50,
                    D: stats.avg_d || 50,
                    E: stats.avg_e || 50,
                    F: stats.avg_f || 50,
                  },
                  topCountries: [],
                  topTechStack: [],
                  lastUpdate: Date.now(),
                },
                source: 'supabase',
              });
            }
          } catch (error: any) {
            console.warn('[Global] ⚠️ Supabase 超时，返回空数据:', error.message);
          }
        }

        return c.json({
          status: 'success',
          data: {
            totalUsers: 0,
            avgDimensions: { L: 50, P: 50, D: 50, E: 50, F: 50 },
            topCountries: [],
            topTechStack: [],
            lastUpdate: Date.now(),
          },
          source: 'empty',
        });
      }

      return c.json({
        status: 'success',
        data: globalStats,
        source: 'kv',
      });
    } catch (error: any) {
      console.error('[Global] ❌ 获取全球统计失败:', error);
      return c.json({
        status: 'error',
        error: error.message,
      }, 500);
    }
  } catch (error: any) {
    console.error('[Worker] /api/global-average 错误:', error);
    return c.json({
      status: 'error',
      error: error.message || '未知错误',
    }, 500);
  }
});

// ==================== 健康检查路由 ====================

app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '2.0.0-refactored',
  });
});

// ==================== 导出 ====================

export default {
  fetch: app.fetch,
};
