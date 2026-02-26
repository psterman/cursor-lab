-- ============================================
-- 视图：v_user_analysis_extended
-- 功能：
-- 1) 在 v_unified_analysis_v2 基础上增加动态排名字段（jiafang_rank, ketao_rank, days_rank）
--    使用 PERCENT_RANK() 计算百分比（0-100），仅依赖原始分，排名永远实时
-- 2) country_code 与 ip_location 一致：优先 manual_location（用户校准），否则 ip_location（ISO2）
--    确保全局聚合按同一口径
-- ============================================

-- 依赖：public.v_unified_analysis_v2 已存在（见 create_unified_view_v2.sql）

CREATE OR REPLACE VIEW public.v_user_analysis_extended AS
WITH base AS (
  SELECT
    id, user_name, fingerprint, user_identity,
    l_score, p_score, d_score, e_score, f_score,
    stats, dimensions, personality,
    total_messages, total_user_chars, total_chars, avg_user_message_length,
    work_days, jiafang_count, ketao_count,
    vibe_index_str, lpdef,
    ip_location, lat, lng,
    manual_location, manual_lat, manual_lng,
    -- 一致性：country_code 仅来自 manual_location 或 ip_location（均为 ISO2）
    country_code,
    created_at, updated_at,
    vibe_index, vibe_rank, vibe_percentile,
    github_stars, github_forks, github_watchers, github_followers, github_score, github_synced_at, github_login, github_stats
  FROM public.v_unified_analysis_v2
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

COMMENT ON VIEW public.v_user_analysis_extended IS
'用户分析扩展视图：含动态排名百分比（jiafang_rank/ketao_rank/days_rank 0-100）。
country_code 与 ip_location 口径一致，供国家累计与抽屉排名使用。';

-- ============================================
-- 一致性修复：country_code 从 ip_location 补全
-- 若 v_unified_analysis_v2 中 country_code 已按 manual_location | ip_location 计算，此处无需改动。
-- 若需在基表层面补全，可对 user_analysis 做 UPDATE（仅当 country_code 列存在时）：
-- UPDATE public.user_analysis u
-- SET country_code = UPPER(TRIM(u.ip_location))
-- WHERE (u.country_code IS NULL OR u.country_code = '')
--   AND u.ip_location ~ '^[A-Za-z]{2}$';
-- ============================================
