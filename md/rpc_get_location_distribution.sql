-- ============================================
-- RPC: get_location_distribution
-- 目的：地理分布统计，按 current_location 分组，供 api/country-summary 的 locationRank 使用
-- 逻辑：SELECT current_location AS name, count(*) AS value FROM user_analysis GROUP BY current_location
-- ============================================

CREATE OR REPLACE FUNCTION public.get_location_distribution()
RETURNS JSONB
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'name',  name,
        'value', value
      )
      ORDER BY value DESC
    ),
    '[]'::jsonb
  )
  FROM (
    SELECT
      COALESCE(NULLIF(TRIM(current_location), ''), 'XX') AS name,
      count(*)::int AS value
    FROM public.user_analysis
    WHERE total_messages IS NOT NULL AND total_messages >= 1
    GROUP BY 1
  ) t;
$$;

COMMENT ON FUNCTION public.get_location_distribution() IS '地理分布：按 current_location 分组计数，供 country-summary locationRank';
