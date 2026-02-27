-- ============================================================
-- 天梯榜快照表与 RPC
-- 版本：20250227210000
-- 用途：leaderboard_snapshots 表、user_analysis.updated_at 保障、get_all_leaderboard_snapshots()
-- 执行位置：Supabase Dashboard → SQL Editor 或 supabase db push
--
-- 22 维度 key 与中文榜单名（供前端展示参考）：
--   stars -> 🌌 星标总量榜   l_score -> 🧠 逻辑鬼才榜
--   commits -> 🧱 代码高产榜  p_score -> 🧘 抗压生存榜
--   prs -> 🤝 协作专家榜     d_score -> 🔍 细节控制榜
--   work_days -> 📅 卷王打卡榜 e_score -> 🎭 情绪稳定榜
--   vibe_index -> 🔥 灵性指数榜 f_score -> 🎯 极速专注榜
--   jiafang_count -> 🏢 甲方克星榜 languages -> 💻 技术广度榜
--   ketao_count -> 💬 客套大师榜 chars_avg -> ✍️ 文档战神榜
--  其余：total_messages, total_chars, github_score, closed_issues,
--   public_repos, followers, commit_velocity, pr_reviews 等
-- ============================================================

-- -------------------------------------------------------
-- 1. 确保 user_analysis 有 updated_at（用于 daily 昨日最强筛选）
-- -------------------------------------------------------
ALTER TABLE public.user_analysis
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- 若表已有数据且 updated_at 为 NULL，用 created_at 回填
UPDATE public.user_analysis
SET updated_at = COALESCE(updated_at, created_at)
WHERE updated_at IS NULL;

COMMENT ON COLUMN public.user_analysis.updated_at IS '记录最后更新时间，用于天梯榜昨日最强(daily)筛选';

-- -------------------------------------------------------
-- 2. 创建天梯榜快照表
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.leaderboard_snapshots (
  id BIGSERIAL PRIMARY KEY,
  metric_key TEXT NOT NULL,
  ranking_type TEXT NOT NULL CHECK (ranking_type IN ('daily', 'all_time')),
  top_data JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (metric_key, ranking_type)
);

CREATE INDEX IF NOT EXISTS idx_leaderboard_snapshots_lookup
  ON public.leaderboard_snapshots (metric_key, ranking_type);

COMMENT ON TABLE public.leaderboard_snapshots IS '天梯榜维度快照：22 维度 x daily/all_time，由 Worker 定时写入';
COMMENT ON COLUMN public.leaderboard_snapshots.metric_key IS '维度 key，如 stars, commits, l_score 等';
COMMENT ON COLUMN public.leaderboard_snapshots.ranking_type IS 'daily=昨日最强, all_time=全网最强';
COMMENT ON COLUMN public.leaderboard_snapshots.top_data IS 'Top 10 数组，每项含 id, user_name, value 等';

-- -------------------------------------------------------
-- 3. RPC：一次性返回最新 44 条快照并聚合为大 JSON
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_all_leaderboard_snapshots()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSONB := '{}'::jsonb;
  rec RECORD;
  key TEXT;
  rtype TEXT;
BEGIN
  -- 每个 (metric_key, ranking_type) 只取最新一条（按 updated_at DESC）
  FOR rec IN
    SELECT DISTINCT ON (metric_key, ranking_type)
      metric_key,
      ranking_type,
      top_data,
      updated_at
    FROM public.leaderboard_snapshots
    ORDER BY metric_key, ranking_type, updated_at DESC
  LOOP
    key := rec.metric_key || '_' || rec.ranking_type;
    result := result || jsonb_build_object(
      key,
      jsonb_build_object(
        'metric_key', rec.metric_key,
        'ranking_type', rec.ranking_type,
        'top_data', rec.top_data,
        'updated_at', rec.updated_at
      )
    );
  END LOOP;
  RETURN result;
END;
$$;

COMMENT ON FUNCTION public.get_all_leaderboard_snapshots() IS '返回所有天梯榜快照聚合 JSON：22 维度 x 2 类型，供前端一次拉取';

-- -------------------------------------------------------
-- 4. RPC：按维度+类型计算 Top10 并写入快照（Worker 定时调用）
--    维度与排序字段映射：顶层列直接排序，github_stats 用 (github_stats->>'field')::numeric
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.refresh_leaderboard_snapshots()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  dim_key TEXT;
  rtype TEXT;
  q TEXT;
  top_json JSONB;
  dim_keys TEXT[] := ARRAY[
    'stars', 'commits', 'prs', 'languages', 'vibe_index', 'l_score', 'p_score', 'd_score', 'e_score', 'f_score',
    'work_days', 'jiafang_count', 'ketao_count', 'chars_avg', 'total_messages', 'total_chars', 'github_score',
    'closed_issues', 'public_repos', 'followers', 'commit_velocity', 'pr_reviews'
  ];
  ordering_expr TEXT;
  daily_filter TEXT;
BEGIN
  FOREACH dim_key IN ARRAY dim_keys
  LOOP
    FOREACH rtype IN ARRAY ARRAY['all_time', 'daily']
    LOOP
      daily_filter := CASE WHEN rtype = 'daily' THEN ' AND u.updated_at > NOW() - INTERVAL ''24 hours''' ELSE '' END;

      ordering_expr := CASE dim_key
        WHEN 'stars' THEN 'COALESCE((u.github_stats->>''totalRepoStars'')::numeric, u.github_stars, 0)'
        WHEN 'commits' THEN 'COALESCE((u.github_stats->>''totalCommits'')::numeric, 0)'
        WHEN 'prs' THEN 'COALESCE((u.github_stats->>''mergedPRs'')::numeric, 0)'
        WHEN 'languages' THEN 'COALESCE(jsonb_array_length(COALESCE(u.github_stats->''languageDistribution'', ''[]''::jsonb)), 0)'
        WHEN 'vibe_index' THEN 'COALESCE((u.l_score*0.25 + u.p_score*0.2 + u.d_score*0.25 + u.e_score*0.15 + u.f_score*0.15), 0)'
        WHEN 'l_score' THEN 'COALESCE(u.l_score, 0)'
        WHEN 'p_score' THEN 'COALESCE(u.p_score, 0)'
        WHEN 'd_score' THEN 'COALESCE(u.d_score, 0)'
        WHEN 'e_score' THEN 'COALESCE(u.e_score, 0)'
        WHEN 'f_score' THEN 'COALESCE(u.f_score, 0)'
        WHEN 'work_days' THEN 'COALESCE(u.work_days, 0)'
        WHEN 'jiafang_count' THEN 'COALESCE(u.jiafang_count, 0)'
        WHEN 'ketao_count' THEN 'COALESCE(u.ketao_count, 0)'
        WHEN 'chars_avg' THEN 'COALESCE(CASE WHEN u.total_messages > 0 THEN u.total_chars::numeric / u.total_messages ELSE 0 END, 0)'
        WHEN 'total_messages' THEN 'COALESCE(u.total_messages, 0)'
        WHEN 'total_chars' THEN 'COALESCE(u.total_chars, 0)'
        WHEN 'github_score' THEN 'COALESCE(u.github_score, 0)'
        WHEN 'closed_issues' THEN 'COALESCE((u.github_stats->>''closedIssues'')::numeric, 0)'
        WHEN 'public_repos' THEN 'COALESCE((u.github_stats->>''publicRepos'')::numeric, 0)'
        WHEN 'followers' THEN 'COALESCE((u.github_stats->>''followers'')::numeric, u.github_followers, 0)'
        WHEN 'commit_velocity' THEN 'COALESCE((u.github_stats->>''commitVelocity'')::numeric, 0)'
        WHEN 'pr_reviews' THEN 'COALESCE((u.github_stats->>''prReviews'')::numeric, 0)'
        ELSE '0'
      END;

      q := format(
        'SELECT COALESCE(jsonb_agg(row_to_json(t)), ''[]''::jsonb) FROM ('
        ' SELECT u.id, u.user_name, u.github_login, (%s) AS value'
        ' FROM user_analysis u'
        ' WHERE 1=1 %s'
        ' ORDER BY (%s) DESC NULLS LAST'
        ' LIMIT 10'
        ') t',
        ordering_expr, daily_filter, ordering_expr
      );

      EXECUTE q INTO top_json;

      INSERT INTO public.leaderboard_snapshots (metric_key, ranking_type, top_data, updated_at)
      VALUES (dim_key, rtype, COALESCE(top_json, '[]'::jsonb), NOW())
      ON CONFLICT (metric_key, ranking_type)
      DO UPDATE SET top_data = EXCLUDED.top_data, updated_at = EXCLUDED.updated_at;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'count', array_length(dim_keys, 1) * 2);
END;
$$;

COMMENT ON FUNCTION public.refresh_leaderboard_snapshots() IS '计算 22 维度 x daily/all_time Top10 并写入 leaderboard_snapshots，由 Worker 定时调用';

-- -------------------------------------------------------
-- 5. 可选：允许 anon/authenticated 只读调用 RPC（按需放开）
-- -------------------------------------------------------
-- GRANT EXECUTE ON FUNCTION public.get_all_leaderboard_snapshots() TO anon;
-- GRANT EXECUTE ON FUNCTION public.get_all_leaderboard_snapshots() TO authenticated;
