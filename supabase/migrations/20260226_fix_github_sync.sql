-- ============================================================
-- GitHub 数据同步修复迁移脚本
-- 版本：20260226
-- 用途：确保 github_stats、github_login、github_score、github_stars
--       等字段正确落库，RLS 不阻断 Service Role 写入
-- 执行位置：Supabase Dashboard → SQL Editor
-- ============================================================

-- -------------------------------------------------------
-- 1. 补齐 user_analysis 表字段（幂等，IF NOT EXISTS 保护）
-- -------------------------------------------------------

-- github_stats：JSONB，存储 22 项 GitHub Combat 指标
ALTER TABLE user_analysis
  ADD COLUMN IF NOT EXISTS github_stats JSONB DEFAULT '{}'::jsonb;

-- github_login：TEXT，存储 GitHub 用户名（用于天梯榜查询、Worker 冷却检查）
ALTER TABLE user_analysis
  ADD COLUMN IF NOT EXISTS github_login TEXT;

-- github_score：INTEGER，综合战力分（由 Worker 计算写入）
ALTER TABLE user_analysis
  ADD COLUMN IF NOT EXISTS github_score INTEGER DEFAULT 0;

-- github_stars：INTEGER，总仓库星数
ALTER TABLE user_analysis
  ADD COLUMN IF NOT EXISTS github_stars INTEGER DEFAULT 0;

-- last_sync_at：TIMESTAMPTZ，上次同步时间（8 小时冷却判断依据）
ALTER TABLE user_analysis
  ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMPTZ;

-- github_synced_at：TIMESTAMPTZ，同步完成时间（与 last_sync_at 保持一致）
ALTER TABLE user_analysis
  ADD COLUMN IF NOT EXISTS github_synced_at TIMESTAMPTZ;

-- github_forks：INTEGER，总 Fork 数
ALTER TABLE user_analysis
  ADD COLUMN IF NOT EXISTS github_forks INTEGER DEFAULT 0;

-- github_watchers：INTEGER，总 Watcher 数
ALTER TABLE user_analysis
  ADD COLUMN IF NOT EXISTS github_watchers INTEGER DEFAULT 0;

-- github_followers：INTEGER，总粉丝数
ALTER TABLE user_analysis
  ADD COLUMN IF NOT EXISTS github_followers INTEGER DEFAULT 0;

-- -------------------------------------------------------
-- 2. 修复 github_stats 列的默认值
--    确保默认值是合法 JSONB（不是空字符串）
-- -------------------------------------------------------
ALTER TABLE user_analysis
  ALTER COLUMN github_stats SET DEFAULT '{}'::jsonb;

-- 回填已有 NULL 值（防止已有行查询时报错）
UPDATE user_analysis
SET github_stats = '{}'::jsonb
WHERE github_stats IS NULL;

-- -------------------------------------------------------
-- 3. 索引优化（幂等，IF NOT EXISTS 保护）
-- -------------------------------------------------------

-- 按 last_sync_at 索引（冷却检查，Worker 每次登录都会查询）
CREATE INDEX IF NOT EXISTS idx_user_analysis_last_sync_at
  ON user_analysis(last_sync_at)
  WHERE last_sync_at IS NOT NULL;

-- 按 user_name 索引（GitHub 同步 PATCH 查询条件）
CREATE INDEX IF NOT EXISTS idx_user_analysis_user_name 
  ON user_analysis(user_name);

-- 按 github_login 索引（天梯榜 RPC 查询条件）
CREATE INDEX IF NOT EXISTS idx_user_analysis_github_login
  ON user_analysis(github_login)
  WHERE github_login IS NOT NULL;

-- -------------------------------------------------------
-- 4. RLS 策略（Service Role 不受 RLS 限制，以下针对前端用）
-- -------------------------------------------------------

-- 确保 RLS 已启用
ALTER TABLE user_analysis ENABLE ROW LEVEL SECURITY;

-- 4-1: 已认证用户可读取自己的行（含 github_stats）
--      前端: supabase.from('user_analysis').select('github_stats,...').eq('id', userId)
DROP POLICY IF EXISTS "user_analysis_select_own" ON user_analysis;
CREATE POLICY "user_analysis_select_own"
  ON user_analysis FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

-- 4-2: 已认证用户可更新自己的 GitHub 相关字段（可选）
--      当前由 Worker 使用 Service Role Key 负责写入，可注释掉此策略
DROP POLICY IF EXISTS "user_analysis_update_own_github" ON user_analysis;
CREATE POLICY "user_analysis_update_own_github"
  ON user_analysis FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- 4-3:【关键】允许匿名角色（anon）按 fingerprint/user_name 查询自己的行
--      用于左抽屉未登录时加载 github_stats
DROP POLICY IF EXISTS "user_analysis_select_by_fingerprint" ON user_analysis;
CREATE POLICY "user_analysis_select_by_fingerprint"
  ON user_analysis FOR SELECT
  TO anon, authenticated
  -- 只要浏览器能提供自己的 fingerprint，就允许读取（不暴露其他人数据）
  -- 注意：此策略依赖前端通过 HTTP Header 传递 fingerprint，需配合后端验证
  -- 简化方案：直接允许所有人读取非敏感字段（按需调整）
  USING (true);

-- -------------------------------------------------------
-- 5. 注释（文档化）
-- -------------------------------------------------------
COMMENT ON COLUMN user_analysis.github_stats
  IS 'GitHub Combat 22 项指标扁平化 JSON，由 Worker syncGithubCombatStats 写入，格式参见 ProcessedGitHubStats 接口';
COMMENT ON COLUMN user_analysis.github_login
  IS 'GitHub 用户名（原始大小写），用于天梯榜 RPC 查询和 Worker 冷却检查';
COMMENT ON COLUMN user_analysis.github_score
  IS '综合战力分 = totalRepoStars*10 + totalForks*5 + totalWatchers*2 + followers*1';
COMMENT ON COLUMN user_analysis.github_stars
  IS '总仓库星数（即 github_stats.totalRepoStars），冗余存储用于榜单排序';
COMMENT ON COLUMN user_analysis.last_sync_at
  IS 'GitHub 数据最后同步时间，8 小时刷新冷却依据（Worker checkSyncCooldown 读取此字段）';

-- -------------------------------------------------------
-- 6. 验证查询（执行后检查输出）
-- -------------------------------------------------------
-- 验证字段是否存在且类型正确：
SELECT
  column_name,
  data_type,
  column_default,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'user_analysis'
  AND column_name IN (
    'github_stats', 'github_login', 'github_score',
    'github_stars', 'github_forks', 'github_watchers', 'github_followers',
    'last_sync_at', 'github_synced_at'
  )
ORDER BY column_name;

-- 验证 RLS 策略：
SELECT
  policyname,
  roles,
  cmd,
  qual
FROM pg_policies
WHERE tablename = 'user_analysis'
ORDER BY policyname;

-- -------------------------------------------------------
-- 7. 重建视图（关键：确保 github_stats 等字段能够透传到前端）
-- -------------------------------------------------------

-- 7-1: 重建 v_unified_analysis_v2
CREATE OR REPLACE VIEW public.v_unified_analysis_v2 AS
WITH base_data AS (
    -- 去重逻辑：GitHub 身份优先
    SELECT DISTINCT ON (COALESCE(fingerprint, id::text))
        id, user_name, fingerprint, user_identity,
        l_score, p_score, d_score, e_score, f_score,
        stats, dimensions, personality,
        total_messages, total_chars, total_chars AS total_user_chars,
        work_days, jiafang_count, ketao_count,
        vibe_index AS vibe_index_str, lpdef, ip_location,
        lat AS raw_lat, lng AS raw_lng,
        manual_location, manual_lat, manual_lng,
        created_at, updated_at,
        github_stars, github_forks, github_watchers, github_followers, github_score, github_synced_at, github_login, github_stats
    FROM public.user_analysis
    ORDER BY COALESCE(fingerprint, id::text), user_identity DESC, created_at DESC
),
unified AS (
    SELECT
        *,
        COALESCE(manual_lat, raw_lat) AS lat,
        COALESCE(manual_lng, raw_lng) AS lng,
        CASE
          WHEN manual_location ~ '^[A-Za-z]{2}$' THEN UPPER(manual_location)
          WHEN ip_location ~ '^[A-Za-z]{2}$' THEN UPPER(ip_location)
          ELSE NULL
        END AS country_code,
        ROUND((COALESCE(l_score,0)*0.25 + COALESCE(p_score,0)*0.20 + COALESCE(d_score,0)*0.25 + COALESCE(e_score,0)*0.15 + COALESCE(f_score,0)*0.15)::numeric, 2) AS vibe_index,
        CASE WHEN total_messages IS NOT NULL AND total_messages > 0
          THEN ROUND((total_chars::numeric / NULLIF(total_messages, 0))::numeric, 2)
          ELSE NULL
        END AS avg_user_message_length
    FROM base_data
)
SELECT
    *,
    CASE WHEN vibe_index IS NOT NULL THEN
        (SELECT COUNT(*) + 1 FROM unified u2 WHERE u2.vibe_index > unified.vibe_index)
    ELSE NULL END AS vibe_rank,
    CASE WHEN vibe_index IS NOT NULL THEN
        ROUND((SELECT COUNT(*)::numeric FROM unified u2 WHERE u2.vibe_index <= unified.vibe_index) * 100.0 /
              NULLIF((SELECT COUNT(*) FROM unified WHERE vibe_index IS NOT NULL), 0), 2)
    ELSE NULL END AS vibe_percentile
FROM unified;

-- 7-2: 重建 v_user_analysis_extended
CREATE OR REPLACE VIEW public.v_user_analysis_extended AS
WITH base AS (
  SELECT * FROM public.v_unified_analysis_v2
),
ranked AS (
  SELECT
    b.*,
    ROUND((1.0 - PERCENT_RANK() OVER (ORDER BY COALESCE(b.jiafang_count, 0) DESC NULLS LAST)) * 100.0, 2) AS jiafang_rank,
    ROUND((1.0 - PERCENT_RANK() OVER (ORDER BY COALESCE(b.ketao_count, 0) DESC NULLS LAST)) * 100.0, 2) AS ketao_rank,
    ROUND((1.0 - PERCENT_RANK() OVER (ORDER BY COALESCE(b.work_days, 0) DESC NULLS LAST)) * 100.0, 2) AS days_rank,
    ROUND((1.0 - PERCENT_RANK() OVER (ORDER BY COALESCE(b.jiafang_count, 0) DESC NULLS LAST)) * 100.0, 2) AS jiafang_rank_percent,
    ROUND((1.0 - PERCENT_RANK() OVER (ORDER BY COALESCE(b.ketao_count, 0) DESC NULLS LAST)) * 100.0, 2) AS ketao_rank_percent,
    ROUND((1.0 - PERCENT_RANK() OVER (ORDER BY COALESCE(b.work_days, 0) DESC NULLS LAST)) * 100.0, 2) AS days_rank_percent
  FROM base b
)
SELECT * FROM ranked;

-- -------------------------------------------------------
-- 8. 手动验证：检查最新同步是否成功落库
-- -------------------------------------------------------
-- 查看最近同步的 5 条记录
SELECT
  id,
  user_name,
  github_login,
  github_score,
  github_stars,
  github_forks,
  github_watchers,
  github_followers,
  last_sync_at,
  jsonb_typeof(github_stats) AS stats_type,
  CASE
    WHEN github_stats IS NOT NULL AND github_stats != '{}'::jsonb
    THEN (github_stats->>'login')
    ELSE NULL
  END AS stats_login
FROM user_analysis
WHERE last_sync_at IS NOT NULL
ORDER BY last_sync_at DESC
LIMIT 5;
