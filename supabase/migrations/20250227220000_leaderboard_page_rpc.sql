-- ============================================================
-- 天梯榜分页与「我的排名」RPC
-- 版本：20250227220000
-- 用途：get_leaderboard_page（分页）、get_leaderboard_my_rank（定位到我）
-- ============================================================

-- 排序表达式与 daily 筛选（与 refresh_leaderboard_snapshots 一致）
CREATE OR REPLACE FUNCTION public._leaderboard_ordering_expr(dim_key TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE dim_key
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
    WHEN 'forks' THEN 'COALESCE((u.github_stats->>''totalForks'')::numeric, 0)'
    WHEN 'total_code_size' THEN 'COALESCE((u.github_stats->>''totalCodeSize'')::numeric, 0)'
    WHEN 'active_days' THEN 'COALESCE((u.github_stats->>''activeDays'')::numeric, 0)'
    WHEN 'latest_repo_updated_at' THEN 'COALESCE(CASE WHEN u.github_stats->>''latest_repo_updated_at'' IS NOT NULL AND (u.github_stats->>''latest_repo_updated_at'') <> '''' THEN EXTRACT(EPOCH FROM (u.github_stats->>''latest_repo_updated_at'')::timestamptz) ELSE 0 END, 0)'
    ELSE '0'
  END;
$$;

-- 分页查询：返回 rank, id, user_name, github_login, value
CREATE OR REPLACE FUNCTION public.get_leaderboard_page(
  p_metric_name TEXT,
  p_ranking_type TEXT DEFAULT 'all_time',
  p_start_index INT DEFAULT 0,
  p_limit INT DEFAULT 50
)
RETURNS TABLE(rank BIGINT, id UUID, user_name TEXT, github_login TEXT, value NUMERIC)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ordering_expr TEXT;
  daily_filter TEXT;
  q TEXT;
BEGIN
  ordering_expr := public._leaderboard_ordering_expr(p_metric_name);
  daily_filter := CASE WHEN p_ranking_type = 'daily' THEN ' AND u.updated_at > NOW() - INTERVAL ''24 hours''' ELSE '' END;
  q := format(
    'WITH ordered AS ('
    ' SELECT u.id, u.user_name, u.github_login, (%s) AS val,'
    '        row_number() OVER (ORDER BY (%s) DESC NULLS LAST, u.id) AS rn'
    ' FROM user_analysis u'
    ' WHERE 1=1 %s'
    ')'
    ' SELECT rn::bigint AS rank, o.id, o.user_name, o.github_login, o.val AS value'
    ' FROM ordered o'
    ' ORDER BY o.rn'
    ' OFFSET $1 LIMIT $2',
    ordering_expr, ordering_expr, daily_filter
  );
  RETURN QUERY EXECUTE q USING p_start_index, p_limit;
END;
$$;

COMMENT ON FUNCTION public.get_leaderboard_page(TEXT, TEXT, INT, INT) IS '天梯榜分页：metric_name, ranking_type(daily|all_time), start_index, limit';

-- 当前用户在该维度下的排名与总数（用于「定位到我」）
CREATE OR REPLACE FUNCTION public.get_leaderboard_my_rank(
  p_metric_name TEXT,
  p_user_id TEXT,
  p_ranking_type TEXT DEFAULT 'all_time'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ordering_expr TEXT;
  daily_filter TEXT;
  q TEXT;
  res JSONB;
  my_rank BIGINT;
  total BIGINT;
BEGIN
  ordering_expr := public._leaderboard_ordering_expr(p_metric_name);
  daily_filter := CASE WHEN p_ranking_type = 'daily' THEN ' AND u.updated_at > NOW() - INTERVAL ''24 hours''' ELSE '' END;
  q := format(
    'WITH ordered AS ('
    ' SELECT u.id, u.user_name, row_number() OVER (ORDER BY (%s) DESC NULLS LAST, u.id) AS rn'
    ' FROM user_analysis u'
    ' WHERE 1=1 %s'
    '), tot AS (SELECT count(*) AS c FROM ordered)'
    'SELECT (SELECT o.rn::bigint FROM ordered o WHERE o.id::text = $1 OR o.user_name = $1 LIMIT 1), (SELECT t.c::bigint FROM tot t LIMIT 1)',
    ordering_expr, daily_filter
  );
  EXECUTE q INTO my_rank, total USING p_user_id;
  res := jsonb_build_object('rank', my_rank, 'total', COALESCE(total, 0));
  RETURN res;
END;
$$;

COMMENT ON FUNCTION public.get_leaderboard_my_rank(TEXT, TEXT, TEXT) IS '天梯榜当前用户排名与总人数，用于定位到我';
