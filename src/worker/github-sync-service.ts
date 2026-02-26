/**
 * GitHub Combat Stats 同步服务
 * 通过 GitHub GraphQL API 抓取 22 项用户数据，轻量计算后写入 Supabase user_analysis 表
 * 支持 8 小时刷新冷却，处理逻辑目标 <20ms
 */

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
}

/** GraphQL 查询：viewer 下 22 项 1–2 星数据 */
const GITHUB_VIEWER_QUERY = `
query ViewerCombatStats {
  viewer {
    login
    avatarUrl(size: 80)
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
    organizations(first: 5) {
      nodes {
        name
        avatarUrl(size: 40)
      }
    }
    repositories(first: 100, orderBy: { field: STARGAZERS, direction: DESC }, ownerAffiliations: [OWNER, COLLABORATOR, ORGANIZATION_MEMBER]) {
      nodes {
        stargazerCount
        forkCount
        watchers { totalCount }
        isPrivate
        primaryLanguage { name }
        createdAt
        languages(first: 5) {
          edges {
            size
            node { name }
          }
        }
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
  const avatarUrl = viewer?.avatarUrl ?? '';
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
  }));

  const globalRanking = calculateGlobalRanking(totalRepoStars);

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
  };
}

/** 写入 user_analysis：单次 PATCH 同时更新所有 GitHub 相关字段
 *  - github_stats: JSONB 格式（ProcessedGitHubStats 对象，PostgREST 自动序列化）
 *  - github_login: GitHub 用户名（用于天梯榜查询）
 *  - github_score: 综合战力分
 *  - github_stars: 总仓库星数
 *  - last_sync_at: 同步时间（冷却判断依据）
 *  查询策略：优先按 user_name 更新；若影响行数为 0（Prefer: return=representation 时检查），
 *  说明用户记录不存在或 user_name 字段不匹配——记录日志便于排查。
 */
/**
 * 将数据持久化到 Supabase。
 * 主键优先使用 id (UUID)；强制使用 SUPABASE_SERVICE_ROLE_KEY 以绕过 RLS。
 */
async function persistToSupabase(
  githubLogin: string,
  stats: ProcessedGitHubStats,
  env: Env,
  identifiers: { id?: string; fingerprint?: string } = {}
): Promise<void> {
  const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!env.SUPABASE_URL || !supabaseKey) {
    console.warn('[GitHub Sync] 持久化跳过：缺少 SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY');
    return;
  }

  const syncedAt = new Date().toISOString();
  const githubScore = calculateGithubScore(stats);
  const normalizedLogin = githubLogin.trim().toLowerCase();

  // 必须包含 github_login，确保同步成功后数据库 null 被填补
  const payload = {
    github_login: githubLogin,
    github_stats: stats,
    github_stars: stats.totalRepoStars ?? 0,
    github_forks: stats.totalForks ?? 0,
    github_watchers: stats.totalWatchers ?? 0,
    github_followers: stats.followers ?? 0,
    github_score: githubScore,
    last_sync_at: syncedAt,
    github_synced_at: syncedAt,
  };

  const headers = {
    'apikey': supabaseKey,
    'Authorization': `Bearer ${supabaseKey}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation',
  };

  const tryUpdate = async (filter: string) => {
    try {
      const url = `${env.SUPABASE_URL}/rest/v1/user_analysis?${filter}`;
      const res = await fetch(url, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(payload),
      });
      if (!res.ok) return null;
      const data = await res.json();
      return Array.isArray(data) && data.length > 0 ? data[0] : null;
    } catch {
      return null;
    }
  };

  let updatedRow: any = null;

  // 数据库定位：必须用 id (UUID)，因 github_login 常为 null
  // 1. 主键：仅按 id (UUID) 定位记录
  if (identifiers.id && /^[0-9a-f-]{36}$/i.test(identifiers.id)) {
    updatedRow = await tryUpdate(`id=eq.${encodeURIComponent(identifiers.id)}`);
  }

  // 2. 退路：按 fingerprint
  if (!updatedRow && identifiers.fingerprint) {
    updatedRow = await tryUpdate(`fingerprint=eq.${encodeURIComponent(identifiers.fingerprint)}`);
  }

  // 3. 退路：按 user_name（不依赖 github_login）
  if (!updatedRow && githubLogin) {
    updatedRow = await tryUpdate(`user_name=ilike.${encodeURIComponent(githubLogin)}`);
  }
  if (!updatedRow && normalizedLogin) {
    updatedRow = await tryUpdate(`user_name=eq.${encodeURIComponent(normalizedLogin)}`);
  }

  // --- 新增：如果仍未找到匹配记录，则执行 INSERT ---
  if (!updatedRow) {
    console.log('[GitHub Sync] ℹ️ 找不到匹配记录，尝试执行插入...');
    
    // 构造插入的完整 payload
    const insertPayload: any = { ...payload };
    
    // 优先设置主键 ID
    if (identifiers.id && /^[0-9a-f-]{36}$/i.test(identifiers.id)) {
      insertPayload.id = identifiers.id;
    }
    
    // 设置 fingerprint
    if (identifiers.fingerprint) {
      insertPayload.fingerprint = identifiers.fingerprint;
    }
    
    // 确保有 user_name（通常是必填字段或极重要的关联字段）
    if (!insertPayload.user_name) {
      insertPayload.user_name = githubLogin;
    }

    try {
      const url = `${env.SUPABASE_URL}/rest/v1/user_analysis`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { ...headers, 'Prefer': 'return=representation' },
        body: JSON.stringify(insertPayload),
      });
      
      if (res.ok) {
        const data = await res.json();
        updatedRow = Array.isArray(data) && data.length > 0 ? data[0] : null;
      } else {
        const errText = await res.text();
        console.error('[GitHub Sync] ❌ 插入记录失败:', errText);
      }
    } catch (e) {
      console.error('[GitHub Sync] ❌ 插入记录出现异常:', e);
    }
  }

  if (!updatedRow) {
    console.warn('[GitHub Sync] ⚠️ 最终无法找到或创建匹配记录进行同步:', { githubLogin, ...identifiers });
    throw new Error('RECORD_SET_FAILED');
  }

  console.log('[GitHub Sync] ✅ Supabase 写入成功:', {
    id: updatedRow.id,
    user_name: updatedRow.user_name,
    github_login: updatedRow.github_login,
    score: payload.github_score,
  });
}

/**
 * 同步 GitHub Combat 统计：冷却内返回缓存，否则拉取并写入
 * @param accessToken - GitHub OAuth access token
 * @param userId - GitHub login（与 user_analysis.user_name 对应）
 * @param env - Worker 环境（SUPABASE_URL, SUPABASE_KEY）
 */
export async function syncGithubCombatStats(
  accessToken: string,
  userId: string, // github login
  env: Env,
  identifiers: { id?: string; fingerprint?: string } = {}
): Promise<{ success: boolean; data?: ProcessedGitHubStats; error?: string; cached?: boolean }> {
  try {
    if (!accessToken?.trim()) {
      return { success: false, error: 'Missing accessToken' };
    }
    if (!userId?.trim() && !identifiers?.id && !identifiers?.fingerprint) {
      return { success: false, error: 'Missing userId or identifiers (id/fingerprint)' };
    }
    const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_KEY;
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
      return { success: true, data: cooldown.data, cached: true };
    }

    const start = performance.now();
    const processedStats = processGitHubData(rawViewer);
    const elapsed = performance.now() - start;
    if (elapsed > 20) {
      console.warn('[GitHub Sync] Processing exceeded 20ms:', elapsed.toFixed(2), 'ms');
    }

    await persistToSupabase(githubLogin, processedStats, env, identifiers);

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
      if (cooldown.cached && cooldown.data) {
        return { success: true, data: cooldown.data, cached: true };
      }
      return { success: false, error: 'GitHub API timeout' };
    }

    return { success: false, error: msg };
  }
}
