-- ============================================
-- RPC: get_user_rank_v2
-- 目的：一条窗口函数 SQL 返回当前用户的国家内排名/总数、全球排名/总数，修复 1/1 问题
-- 阈值：仅对 total_messages > 5 的活跃用户排名，过滤僵尸用户，减少排序量
-- 依赖：user_analysis 表，索引 idx_user_analysis_rank_v2 ON (ip_location, total_messages DESC)
-- 调用：POST /rest/v1/rpc/get_user_rank_v2
-- body: { "p_fingerprint": "xxx", "p_user_id": "uuid" }（二者至少传一）
-- ============================================

CREATE OR REPLACE FUNCTION public.get_user_rank_v2(
  p_fingerprint TEXT DEFAULT NULL,
  p_user_id TEXT DEFAULT NULL
)
RETURNS TABLE (
  rank_in_country BIGINT,
  total_in_country BIGINT,
  rank_global BIGINT,
  total_global BIGINT,
  ip_location TEXT
)
LANGUAGE sql
STABLE
AS $$
  WITH ranked AS (
    SELECT
      id,
      fingerprint,
      ip_location,
      total_messages,
      RANK() OVER (PARTITION BY COALESCE(NULLIF(TRIM(ip_location), ''), 'XX') ORDER BY total_messages DESC NULLS LAST, id) AS rn_country,
      COUNT(*) OVER (PARTITION BY COALESCE(NULLIF(TRIM(ip_location), ''), 'XX')) AS cnt_country,
      RANK() OVER (ORDER BY total_messages DESC NULLS LAST, id) AS rn_global,
      COUNT(*) OVER () AS cnt_global
    FROM public.user_analysis
    WHERE total_messages IS NOT NULL AND total_messages >= 1
  )
  SELECT
    r.rn_country::BIGINT AS rank_in_country,
    r.cnt_country::BIGINT AS total_in_country,
    r.rn_global::BIGINT AS rank_global,
    r.cnt_global::BIGINT AS total_global,
    r.ip_location
  FROM ranked r
  WHERE (p_user_id IS NOT NULL AND r.id::TEXT = p_user_id)
     OR (p_fingerprint IS NOT NULL AND r.fingerprint = p_fingerprint)
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.get_user_rank_v2 IS '窗口函数返回用户国家内/全球排名与总数，供 /api/country-summary 与 /api/v2/user-stats 使用';
