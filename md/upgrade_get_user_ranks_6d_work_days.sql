-- ============================================
-- 升级：get_user_ranks_6d 用 work_days 替代 total_user_chars
-- 6 维度：total_messages, total_chars, avg_user_message_length, jiafang_count, ketao_count, work_days
-- ============================================

CREATE OR REPLACE FUNCTION public.get_user_ranks_6d(
  p_fingerprint TEXT DEFAULT NULL,
  p_user_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE sql
STABLE
AS $$
  WITH base AS (
    SELECT id, fingerprint,
      COALESCE(NULLIF(TRIM(ip_location), ''), 'XX') AS loc,
      total_messages,
      total_chars,
      CASE WHEN total_messages > 0 THEN (total_chars::numeric / total_messages) ELSE 0 END AS avg_len,
      COALESCE(jiafang_count, 0) AS jf,
      COALESCE(ketao_count, 0) AS kt,
      COALESCE(work_days, 0) AS wd
    FROM public.user_analysis
    WHERE total_messages IS NOT NULL AND total_messages >= 1
  ),
  me AS (
    SELECT * FROM base
    WHERE (p_user_id IS NOT NULL AND id::TEXT = p_user_id)
       OR (p_fingerprint IS NOT NULL AND fingerprint = p_fingerprint)
    LIMIT 1
  ),
  r_tm AS (
    SELECT rn_global, cnt_global, rn_country, cnt_country
    FROM (
      SELECT
        RANK() OVER (ORDER BY total_messages DESC NULLS LAST, id) AS rn_global,
        COUNT(*) OVER () AS cnt_global,
        RANK() OVER (PARTITION BY loc ORDER BY total_messages DESC NULLS LAST, id) AS rn_country,
        COUNT(*) OVER (PARTITION BY loc) AS cnt_country,
        id
      FROM base
    ) x
    WHERE id = (SELECT id FROM me LIMIT 1)
    LIMIT 1
  ),
  r_tc AS (
    SELECT rn_global, cnt_global, rn_country, cnt_country
    FROM (
      SELECT
        RANK() OVER (ORDER BY total_chars DESC NULLS LAST, id) AS rn_global,
        COUNT(*) OVER () AS cnt_global,
        RANK() OVER (PARTITION BY loc ORDER BY total_chars DESC NULLS LAST, id) AS rn_country,
        COUNT(*) OVER (PARTITION BY loc) AS cnt_country,
        id
      FROM base
    ) x
    WHERE id = (SELECT id FROM me LIMIT 1)
    LIMIT 1
  ),
  r_avg AS (
    SELECT rn_global, cnt_global, rn_country, cnt_country
    FROM (
      SELECT
        RANK() OVER (ORDER BY avg_len DESC NULLS LAST, id) AS rn_global,
        COUNT(*) OVER () AS cnt_global,
        RANK() OVER (PARTITION BY loc ORDER BY avg_len DESC NULLS LAST, id) AS rn_country,
        COUNT(*) OVER (PARTITION BY loc) AS cnt_country,
        id
      FROM base
    ) x
    WHERE id = (SELECT id FROM me LIMIT 1)
    LIMIT 1
  ),
  r_jf AS (
    SELECT rn_global, cnt_global, rn_country, cnt_country
    FROM (
      SELECT
        RANK() OVER (ORDER BY jf DESC NULLS LAST, id) AS rn_global,
        COUNT(*) OVER () AS cnt_global,
        RANK() OVER (PARTITION BY loc ORDER BY jf DESC NULLS LAST, id) AS rn_country,
        COUNT(*) OVER (PARTITION BY loc) AS cnt_country,
        id
      FROM base
    ) x
    WHERE id = (SELECT id FROM me LIMIT 1)
    LIMIT 1
  ),
  r_kt AS (
    SELECT rn_global, cnt_global, rn_country, cnt_country
    FROM (
      SELECT
        RANK() OVER (ORDER BY kt DESC NULLS LAST, id) AS rn_global,
        COUNT(*) OVER () AS cnt_global,
        RANK() OVER (PARTITION BY loc ORDER BY kt DESC NULLS LAST, id) AS rn_country,
        COUNT(*) OVER (PARTITION BY loc) AS cnt_country,
        id
      FROM base
    ) x
    WHERE id = (SELECT id FROM me LIMIT 1)
    LIMIT 1
  ),
  r_wd AS (
    SELECT rn_global, cnt_global, rn_country, cnt_country
    FROM (
      SELECT
        RANK() OVER (ORDER BY wd DESC NULLS LAST, id) AS rn_global,
        COUNT(*) OVER () AS cnt_global,
        RANK() OVER (PARTITION BY loc ORDER BY wd DESC NULLS LAST, id) AS rn_country,
        COUNT(*) OVER (PARTITION BY loc) AS cnt_country,
        id
      FROM base
    ) x
    WHERE id = (SELECT id FROM me LIMIT 1)
    LIMIT 1
  )
  SELECT jsonb_build_object(
    'total_messages', jsonb_build_object(
      'rank_global', (SELECT rn_global FROM r_tm LIMIT 1), 'total_global', (SELECT cnt_global FROM r_tm LIMIT 1),
      'rank_country', (SELECT rn_country FROM r_tm LIMIT 1), 'total_country', (SELECT cnt_country FROM r_tm LIMIT 1)
    ),
    'total_chars', jsonb_build_object(
      'rank_global', (SELECT rn_global FROM r_tc LIMIT 1), 'total_global', (SELECT cnt_global FROM r_tc LIMIT 1),
      'rank_country', (SELECT rn_country FROM r_tc LIMIT 1), 'total_country', (SELECT cnt_country FROM r_tc LIMIT 1)
    ),
    'avg_user_message_length', jsonb_build_object(
      'rank_global', (SELECT rn_global FROM r_avg LIMIT 1), 'total_global', (SELECT cnt_global FROM r_avg LIMIT 1),
      'rank_country', (SELECT rn_country FROM r_avg LIMIT 1), 'total_country', (SELECT cnt_country FROM r_avg LIMIT 1)
    ),
    'jiafang_count', jsonb_build_object(
      'rank_global', (SELECT rn_global FROM r_jf LIMIT 1), 'total_global', (SELECT cnt_global FROM r_jf LIMIT 1),
      'rank_country', (SELECT rn_country FROM r_jf LIMIT 1), 'total_country', (SELECT cnt_country FROM r_jf LIMIT 1)
    ),
    'ketao_count', jsonb_build_object(
      'rank_global', (SELECT rn_global FROM r_kt LIMIT 1), 'total_global', (SELECT cnt_global FROM r_kt LIMIT 1),
      'rank_country', (SELECT rn_country FROM r_kt LIMIT 1), 'total_country', (SELECT cnt_country FROM r_kt LIMIT 1)
    ),
    'work_days', jsonb_build_object(
      'rank_global', (SELECT rn_global FROM r_wd LIMIT 1), 'total_global', (SELECT cnt_global FROM r_wd LIMIT 1),
      'rank_country', (SELECT rn_country FROM r_wd LIMIT 1), 'total_country', (SELECT cnt_country FROM r_wd LIMIT 1)
    )
  )
  FROM (SELECT 1) AS one;
$$;

COMMENT ON FUNCTION public.get_user_ranks_6d IS '返回 6 维度双排名（含 work_days，移除 total_user_chars 冗余），供 /api/country-summary 使用';
