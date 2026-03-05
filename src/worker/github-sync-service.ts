/**
 * GitHub Combat Stats 同步服务
 * 通过 GitHub GraphQL API 抓取 22 项用户数据，轻量计算后写入 Supabase user_analysis 表
 * 支持 8 小时刷新冷却，处理逻辑目标 <20ms
 * 写库必须使用 SUPABASE_SERVICE_ROLE_KEY 以绕过 RLS。
 */

import { createClient } from '@supabase/supabase-js';
import type { Env } from './index';

const GITHUB_API_TIMEOUT_MS = 15000;
const SYNC_COOLDOWN_MS = 8 * 60 * 60 * 1000; // 8 小时
const THREE_MONTHS_MS = 90 * 24 * 60 * 60 * 1000;

/** 处理后的扁平化 GitHub 统计（存入 github_stats JSONB） */
export interface ProcessedGitHubStats {
  login: string;
  avatarUrl: string;
  accountAge: number;
  followers: number;
  following: number;
  totalStars: number;
  sponsorships: number;
  totalCommits: number;
  restrictedContributions: number;
  prReviews: number;
  activeDays: number;
  commitVelocity: number;
  totalRepoStars: number;
  totalForks: number;
  totalWatchers: number;
  totalCodeSize: number;
  publicRepos: number;
  privateRepos: number;
  languageDistribution: { name: string; percentage: number }[];
  primaryLanguage: string | null;
  newestLanguage: string | null;
  mergedPRs: number;
  closedIssues: number;
  organizations: { name: string; avatarUrl: string }[];
  globalRanking: string;
  syncedAt: string;
  /** 最近一次推送的仓库时间（ISO 字符串），来自 orderBy: PUSHED_AT 的第一条 */
  latest_repo_updated_at: string | null;
}

/** GraphQL 查询：仅 read:user + user:email，不请求 name/avatarUrl/organizations（否则需 read:org） */
const GITHUB_VIEWER_QUERY = `
query ViewerCombatStats {
  viewer {
    login
    createdAt
    followers { totalCount }
    following { totalCount }
    starredRepositories { totalCount }
    sponsorshipsAsMaintainer { totalCount }
    contributionsCollection(from: "%from%", to: "%to%") {
      totalCommitContributions
      restrictedContributionsCount
      totalPullRequestReviewContributions
      contributionCalendar {
        totalContributions
        weeks {
          contributionDays {
            date
            contributionCount
          }
        }
      }
    }
    repositories(first: 100, orderBy: { field: STARGAZERS, direction: DESC }, ownerAffiliations: [OWNER, COLLABORATOR, ORGANIZATION_MEMBER]) {
      nodes {
        stargazerCount
        forkCount
        watchers { totalCount }
        isPrivate
        createdAt
        primaryLanguage { name }
        languages(first: 10, orderBy: { field: SIZE, direction: DESC }) {
          edges {
            size
            node { name }
          }
        }
      }
    }
    latestPushedRepos: repositories(first: 1, orderBy: { field: PUSHED_AT, direction: DESC }, ownerAffiliations: [OWNER, COLLABORATOR, ORGANIZATION_MEMBER]) {
      nodes {
        pushedAt
      }
    }
    pullRequests(states: [MERGED]) { totalCount }
    issues(states: [CLOSED]) { totalCount }
  }
}
`;

function buildQuery(): string {
  const now = new Date();
  const to = now.toISOString();
  const from = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString();
  return GITHUB_VIEWER_QUERY.replace('%from%', from).replace('%to%', to);
}

/** 判断记录是否应击穿冷却：github_stats 为空/缺失 或 github_login 为 null 时强制重新同步 */
function shouldBypassCooldown(record: { github_stats?: any; github_login?: string | null } | null): boolean {
  if (!record) return true;
  const stats = record.github_stats;
  if (stats === undefined || stats === null) return true;
  if (typeof stats !== 'object' || Object.keys(stats).length === 0) return true;
  if (!record.github_login || String(record.github_login).trim() === '') return true;
  
  // 检查关键字段是否存在，若缺失（旧版本产生的缓存）则强制绕过冷却重刷
  if (stats.totalForks === undefined || stats.followers === undefined) return true;
  
  return false;
}

/** 检查 8 小时冷却，未过期则返回缓存
 *  - 【已禁用严格限流】函数开头直接返回 cached: false，8 小时与 429 频率限制全部失效，始终拉取最新数据
 */
async function checkSyncCooldown(
  env: Env,
  options: { userId?: string; githubLogin?: string }
): Promise<{ cached: boolean; data?: ProcessedGitHubStats }> {
  return { cached: false };
  // --- 以下逻辑在启用冷却时可恢复 ---
  const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_KEY;
  if (!env.SUPABASE_URL || !supabaseKey) return { cached: false };

  const headers = {
    'apikey': supabaseKey,
    'Authorization': `Bearer ${supabaseKey}`,
    'Content-Type': 'application/json',
  };

  const selectFields = 'github_login,github_stats,last_sync_at';

  const tryQuery = async (url: string): Promise<{ cached: boolean; data?: ProcessedGitHubStats }> => {
    try {
      const response = await fetch(url, { method: 'GET', headers });
      if (!response.ok) return { cached: false };

      const rows = await response.json();
      if (!Array.isArray(rows) || rows.length === 0) return { cached: false };

      const record = rows[0];
      if (shouldBypassCooldown(record)) return { cached: false };

      const lastSync = record?.last_sync_at ? new Date(record.last_sync_at) : null;
      if (!lastSync || isNaN(lastSync.getTime())) return { cached: false };

      if (Date.now() - lastSync.getTime() < SYNC_COOLDOWN_MS) {
        const stats = record?.github_stats;
        if (!stats || typeof stats !== 'object' || Object.keys(stats).length === 0 || !stats.login) {
          return { cached: false };
        }
        return { cached: true, data: stats as ProcessedGitHubStats };
      }
    } catch (e) {
      console.error('[GitHub Sync] checkSyncCooldown 内部错误:', e);
    }
    return { cached: false };
  };

  // 优先按 userId (UUID) 查询
  if (options.userId && /^[0-9a-f-]{36}$/i.test(options.userId.trim())) {
    const url = `${env.SUPABASE_URL}/rest/v1/user_analysis?id=eq.${encodeURIComponent(options.userId.trim())}&select=${selectFields}&limit=1`;
    const res = await tryQuery(url);
    if (res.cached) return res;
  }

  const githubLogin = (options.githubLogin ?? '').trim();
  if (!githubLogin) return { cached: false };

  const normalizedLogin = githubLogin.toLowerCase();
  const result1 = await tryQuery(`${env.SUPABASE_URL}/rest/v1/user_analysis?user_name=eq.${encodeURIComponent(normalizedLogin)}&select=${selectFields}&limit=1`);
  if (result1.cached) return result1;
  const result2 = await tryQuery(`${env.SUPABASE_URL}/rest/v1/user_analysis?github_login=eq.${encodeURIComponent(githubLogin)}&select=${selectFields}&limit=1`);
  if (result2.cached) return result2;
  const result3 = await tryQuery(`${env.SUPABASE_URL}/rest/v1/user_analysis?user_name=ilike.${encodeURIComponent(githubLogin)}&select=${selectFields}&limit=1`);
  return result3;
}

/** 调用 GitHub GraphQL API（带超时与限流处理） */
async function fetchGitHubData(accessToken: string): Promise<any> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), GITHUB_API_TIMEOUT_MS);

  try {
    const response = await fetch('https://api.github.com/graphql', {
      signal: controller.signal,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
        'User-Agent': 'Antigravity-App-Sync-Service',
      },
      body: JSON.stringify({ query: buildQuery() }),
    });

    clearTimeout(timeoutId);

    const text = await response.text();
    if (!response.ok) {
      if (response.status === 403 || text.includes('rate limit')) {
        console.warn('[GitHub Sync] GitHub API 限流（已记录，不阻断）:', { status: response.status, body: text.slice(0, 300) });
        throw new Error(`GitHub API rate limit: ${response.status} ${text.slice(0, 200)}`);
      }
      throw new Error(`GitHub API ${response.status}: ${text.slice(0, 200)}`);
    }

    const json = JSON.parse(text);
    if (json.errors?.length) {
      const msg = json.errors.map((e: any) => e.message).join('; ');
      console.error('[GitHub Sync] GraphQL errors:', msg);
      if (msg.includes('rate limit')) {
        console.warn('[GitHub Sync] GraphQL 返回限流（已记录，不阻断）:', msg);
      }
      throw new Error(msg);
    }

    const viewer = json?.data?.viewer;
    if (!viewer) {
      console.warn('[GitHub Sync] GraphQL returned no viewer data. JSON:', JSON.stringify(json).slice(0, 500));
    } else {
      console.log('[GitHub Sync] GraphQL fetch success for:', viewer.login);
    }
    return viewer ?? null;
  } catch (e: any) {
    clearTimeout(timeoutId);
    if (e?.name === 'AbortError') {
      const err: any = new Error('GitHub API timeout');
      err.code = 'TIMEOUT';
      throw err;
    }
    throw e;
  }
}

function calculateGlobalRanking(totalStars: number): string {
  if (totalStars > 1000) return 'Top 1%';
  if (totalStars > 500) return 'Top 5%';
  if (totalStars > 100) return 'Top 10%';
  if (totalStars > 50) return 'Top 25%';
  return '普通';
}

/** 兼容旧字段：根据 22 项数据计算 github_score（与 Edge Function 公式一致） */
function calculateGithubScore(stats: ProcessedGitHubStats): number {
  return (
    (stats.totalRepoStars ?? 0) * 10 +
    (stats.totalForks ?? 0) * 5 +
    (stats.totalWatchers ?? 0) * 2 +
    (stats.followers ?? 0) * 1
  );
}

/** 单次遍历完成：总星/代码量/语言汇总/公私仓/最近 3 个月仓库与 Newest Language */
function processGitHubData(viewer: any): ProcessedGitHubStats {
  const now = new Date();
  const syncedAt = now.toISOString();

  const login = viewer?.login ?? '';
  const avatarUrl = viewer?.avatarUrl || (login ? `https://github.com/${login}.png` : '');
  const createdAt = viewer?.createdAt ? new Date(viewer.createdAt) : null;
  const accountAge = createdAt ? Math.floor((now.getTime() - createdAt.getTime()) / (24 * 60 * 60 * 1000)) : 0;
  const followers = viewer?.followers?.totalCount ?? 0;
  const following = viewer?.following?.totalCount ?? 0;
  const totalStars = viewer?.starredRepositories?.totalCount ?? 0;
  const sponsorships = viewer?.sponsorshipsAsMaintainer?.totalCount ?? 0;

  const coll = viewer?.contributionsCollection;
  const totalCommits = coll?.totalCommitContributions ?? 0;
  const restrictedContributions = coll?.restrictedContributionsCount ?? 0;
  const prReviews = coll?.totalPullRequestReviewContributions ?? 0;

  const weeks = coll?.contributionCalendar?.weeks ?? [];
  let activeDays = 0;
  let commitVelocity = 0;
  const cutoff30 = now.getTime() - 30 * 24 * 60 * 60 * 1000;

  for (let w = 0; w < weeks.length; w++) {
    const days = weeks[w].contributionDays ?? [];
    for (let d = 0; d < days.length; d++) {
      const day = days[d];
      const count = day?.contributionCount ?? 0;
      if (count > 0) activeDays++;
      const dateStr = day?.date;
      if (dateStr) {
        const t = new Date(dateStr).getTime();
        if (t >= cutoff30) commitVelocity += count;
      }
    }
  }

  const repos = viewer?.repositories?.nodes ?? [];
  let totalRepoStars = 0;
  let totalForks = 0;
  let totalWatchers = 0;
  let totalCodeSize = 0;
  let publicRepos = 0;
  let privateRepos = 0;
  const langBytes = new Map<string, number>();
  const threeMonthsAgo = now.getTime() - THREE_MONTHS_MS;
  const recentRepoLangCount = new Map<string, number>();

  for (let i = 0; i < repos.length; i++) {
    const r = repos[i];
    const stars = r?.stargazerCount ?? 0;
    const forks = r?.forkCount ?? 0;
    const watchers = r?.watchers?.totalCount ?? 0;
    const isPrivate = r?.isPrivate === true;
    if (isPrivate) privateRepos++; else publicRepos++;

    totalRepoStars += stars;
    totalForks += forks;
    totalWatchers += watchers;

    const edges = r?.languages?.edges ?? [];
    const primaryName = r?.primaryLanguage?.name ?? null;
    for (let j = 0; j < edges.length; j++) {
      const size = edges[j]?.size ?? 0;
      const name = edges[j]?.node?.name;
      if (name) {
        totalCodeSize += size;
        langBytes.set(name, (langBytes.get(name) ?? 0) + size);
        if (r?.createdAt && new Date(r.createdAt).getTime() >= threeMonthsAgo && name !== primaryName) {
          recentRepoLangCount.set(name, (recentRepoLangCount.get(name) ?? 0) + 1);
        }
      }
    }
  }

  let primaryLanguage: string | null = null;
  const primary = viewer?.repositories?.nodes?.[0]?.primaryLanguage?.name;
  if (primary) primaryLanguage = primary;

  const langEntries = Array.from(langBytes.entries());
  langEntries.sort((a, b) => b[1] - a[1]);
  const top5 = langEntries.slice(0, 5);
  const languageDistribution = totalCodeSize > 0
    ? top5.map(([name, size]) => ({ name, percentage: Math.round((size / totalCodeSize) * 10000) / 100 }))
    : [];

  let newestLanguage: string | null = null;
  if (recentRepoLangCount.size > 0) {
    const sorted = Array.from(recentRepoLangCount.entries()).sort((a, b) => b[1] - a[1]);
    newestLanguage = sorted[0][0];
  }

  const mergedPRs = viewer?.pullRequests?.totalCount ?? 0;
  const closedIssues = viewer?.issues?.totalCount ?? 0;

  const orgNodes = viewer?.organizations?.nodes ?? [];
  const organizations = orgNodes.slice(0, 5).map((o: any) => ({
    name: o?.name ?? '',
    avatarUrl: o?.avatarUrl ?? '',
  })); // 未请求 read:org 时 orgNodes 为空，organizations 为 []

  const globalRanking = calculateGlobalRanking(totalRepoStars);
  const latestRepoUpdatedAt = viewer?.latestPushedRepos?.nodes?.[0]?.pushedAt ?? null;

  return {
    login,
    avatarUrl,
    accountAge,
    followers,
    following,
    totalStars,
    sponsorships,
    totalCommits,
    restrictedContributions,
    prReviews,
    activeDays,
    commitVelocity,
    totalRepoStars,
    totalForks,
    totalWatchers,
    totalCodeSize,
    publicRepos,
    privateRepos,
    languageDistribution,
    primaryLanguage,
    newestLanguage,
    mergedPRs,
    closedIssues,
    organizations,
    globalRanking,
    syncedAt,
    latest_repo_updated_at: latestRepoUpdatedAt,
  };
}

/**
 * 将数据持久化到 Supabase。github_stats 为 JSONB，写入对象必须明确包含 github_stats 字段。
 * 优先使用 SUPABASE_SERVICE_ROLE_KEY 以绕过 RLS；使用 supabase-js upsert，错误时返回 { success: false, error }，不 throw。
 * 当 countryCode 存在时，会写入 manual_location、country_code，用于「选籍+登录」一体化回调注入。
 */
async function persistToSupabase(
  githubLogin: string,
  stats: ProcessedGitHubStats,
  env: Env,
  identifiers: { id?: string; fingerprint?: string } = {},
  countryCode?: string
): Promise<{ success: boolean; error?: string; uniqueViolation?: boolean }> {
  const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_KEY || env.SUPABASE_ANON_KEY;
  if (!env.SUPABASE_URL || !supabaseKey) {
    const errMsg = '缺少 SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY/SUPABASE_KEY/SUPABASE_ANON_KEY';
    console.error('[GitHub Sync]', errMsg);
    return { success: false, error: errMsg };
  }

  const syncedAt = new Date().toISOString();
  const data: Record<string, unknown> = {
    github_stats: stats,
    github_login: githubLogin,
    github_synced_at: syncedAt,
    github_stars: stats.totalRepoStars ?? 0,
    github_forks: stats.totalForks ?? 0,
  };
  if (identifiers.id != null && identifiers.id !== '' && /^[0-9a-f-]{36}$/i.test(identifiers.id)) {
    data.id = identifiers.id;
  }
  if (identifiers.fingerprint) {
    data.fingerprint = identifiers.fingerprint;
  }
  if (!(data as any).user_name) {
    (data as any).user_name = githubLogin;
  }
  if (countryCode && /^[A-Z]{2}$/.test(countryCode)) {
    (data as any).manual_location = countryCode;
    (data as any).country_code = countryCode;
  }
  console.log('[GitHub Sync] 准备写入的 payload:', JSON.stringify(data).length > 2000 ? JSON.stringify(data).slice(0, 2000) + '...[truncated]' : JSON.stringify(data));

  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_KEY || env.SUPABASE_ANON_KEY);
  const onConflict = identifiers.id != null && identifiers.id !== '' && /^[0-9a-f-]{36}$/i.test(identifiers.id)
    ? 'id'
    : identifiers.fingerprint
      ? 'fingerprint'
      : null;
  if (!onConflict) {
    console.error('[GitHub Sync] 无法 upsert：缺少 id 或 fingerprint');
    return { success: false, error: '缺少 id 或 fingerprint' };
  }

  const doUpsert = async (): Promise<{ success: boolean; error?: string; uniqueViolation?: boolean }> => {
    const { data: rows, error } = await supabase
      .from('user_analysis')
      .upsert(data, { onConflict: onConflict as 'id' | 'fingerprint', ignoreDuplicates: false });
    if (error) {
      console.error('[Supabase Error]', error.message, error.details);
      const msg = error.message || '';
      const isDuplicateFingerprint = /duplicate key|unique constraint|violates unique constraint/i.test(msg) && /fingerprint/i.test(msg);
      return { success: false, error: `Database error: ${error.message}`, uniqueViolation: !!isDuplicateFingerprint };
    }
    console.log('[GitHub Sync] ✅ Supabase 写入成功:', rows ? (Array.isArray(rows) && rows[0] ? { id: (rows[0] as any).id, github_login: (rows[0] as any).github_login } : 'no representation') : 'no representation');
    return { success: true };
  };

  try {
    let result = await doUpsert();
    if (result.success) return result;
    if (result.uniqueViolation && identifiers.fingerprint) {
      const { data: anonymousRows } = await supabase
        .from('user_analysis')
        .select('id')
        .eq('fingerprint', identifiers.fingerprint)
        .or('user_identity.is.null,user_identity.neq.github')
        .limit(1);
      const toDelete = Array.isArray(anonymousRows) && anonymousRows.length > 0 ? anonymousRows[0] : null;
      if (toDelete && (toDelete as any).id) {
        const delId = (toDelete as any).id;
        console.log('[GitHub Sync] 指纹冲突：删除匿名行后重试', delId);
        await supabase.from('user_analysis').delete().eq('id', delId);
        result = await doUpsert();
        if (result.success) return result;
      }
      return { success: false, error: 'UNIQUE_VIOLATION_FINGERPRINT', uniqueViolation: true };
    }
    return { success: false, error: result.error };
  } catch (err: any) {
    console.error('[GitHub Sync Error]', err);
    const msg = err?.message ?? String(err);
    const uniqueViolation = /duplicate key|unique constraint|violates unique constraint/i.test(msg);
    return { success: false, error: msg, uniqueViolation };
  }
}

/**
 * 同步 GitHub Combat 统计：冷却内返回缓存，否则拉取并写入
 * @param accessToken - GitHub OAuth access token
 * @param userId - GitHub login（与 user_analysis.user_name 对应）
 * @param env - Worker 环境（SUPABASE_URL, SUPABASE_KEY）
 * @param countryCode - 可选，选籍+登录一体化时传入，会写入 manual_location/country_code
 */
export async function syncGithubCombatStats(
  accessToken: string,
  userId: string, // github login
  env: Env,
  identifiers: { id?: string; fingerprint?: string } = {},
  countryCode?: string
): Promise<{ success: boolean; data?: ProcessedGitHubStats; error?: string; cached?: boolean }> {
  try {
    console.log('[GitHub Sync] 开始同步任务，目标用户 ID:', identifiers.id);
    if (!accessToken?.trim()) {
      return { success: false, error: 'Missing accessToken' };
    }
    if (!userId?.trim() && !identifiers?.id && !identifiers?.fingerprint) {
      return { success: false, error: 'Missing userId or identifiers (id/fingerprint)' };
    }
    const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_KEY || env.SUPABASE_ANON_KEY;
    if (!env.SUPABASE_URL || !supabaseKey) {
      return { success: false, error: 'Supabase not configured' };
    }

    const rawViewer = await fetchGitHubData(accessToken.trim());
    if (!rawViewer) {
      return { success: false, error: 'Empty viewer data' };
    }

    // 必须从 GraphQL 返回的 rawViewer.login 获取用户名，避免数据库 github_login 为 NULL
    const githubLogin = (rawViewer.login ?? userId).trim() || String(userId).trim();
    if (!githubLogin) {
      return { success: false, error: 'Could not resolve GitHub login' };
    }

    const cooldown = await checkSyncCooldown(env, {
      userId: identifiers?.id,
      githubLogin,
    });
    if (cooldown.cached && cooldown.data) {
      const data = cooldown.data;
      if (typeof data === 'object' && data !== null && Object.keys(data).length > 0) {
        return { success: true, data, cached: true };
      }
      // 数据为空，无视冷却时间，强制重新抓取
    }

    const start = performance.now();
    const processedStats = processGitHubData(rawViewer);
    const elapsed = performance.now() - start;
    if (elapsed > 20) {
      console.warn('[GitHub Sync] Processing exceeded 20ms:', elapsed.toFixed(2), 'ms');
    }

    if (!processedStats?.login || String(processedStats.login).trim() === '') {
      return { success: false, error: 'Processed stats missing login field, skip write' };
    }

    console.log('[GitHub Sync] 准备写入 ID:', identifiers.id, countryCode ? ', country_code: ' + countryCode : '');
    const persistResult = await persistToSupabase(githubLogin, processedStats, env, identifiers, countryCode);
    if (!persistResult.success) {
      return { success: false, error: persistResult.error ?? '写入失败' };
    }

    return { success: true, data: processedStats };
  } catch (e: any) {
    const msg = e?.message ?? String(e);
    console.error('[GitHub Sync] Error:', msg);

    if (msg.includes('rate limit') || msg.includes('RATE_LIMIT')) {
      console.error('[GitHub Sync] 限流详情:', msg);
      return { success: false, error: msg, cached: false };
    }
    if (e?.code === 'TIMEOUT' || msg.includes('timeout')) {
      const cooldown = await checkSyncCooldown(env, { userId: identifiers?.id, githubLogin: String(userId).trim() });
      const fallbackData = cooldown.data;
      if (cooldown.cached && fallbackData && typeof fallbackData === 'object' && Object.keys(fallbackData).length > 0) {
        return { success: true, data: fallbackData, cached: true };
      }
      return { success: false, error: 'GitHub API timeout' };
    }

    return { success: false, error: msg };
  }
}
