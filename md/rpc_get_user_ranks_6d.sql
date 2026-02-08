-- ============================================
-- RPC: get_user_ranks_6d
-- 目的：返回当前用户在 6 个维度上的全球排名 + 本国排名（双排名系统）
-- 6 维度：total_messages, total_chars, total_user_chars, avg_user_message_length, jiafang_count, ketao_count
-- 依赖：user_analysis 表（total_chars 兼作 total_user_chars；avg = total_chars/nullif(total_messages,0)）
-- 调用：POST /rest/v1/rpc/get_user_ranks_6d
-- body: { "p_fingerprint": "xxx", "p_user_id": "uuid" }（二者至少传一）
-- 返回：JSONB { total_messages: { rank_global, total_global, rank_country, total_country }, ... }
--
-- 数据一致性：个人排名与全球概览共用 base CTE，统一 WHERE total_messages >= 1；
-- 各维度排序均为 DESC（高到低）
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
      total_chars AS total_user_chars,
      CASE WHEN total_messages > 0 THEN (total_chars::numeric / total_messages) ELSE 0 END AS avg_len,
      COALESCE(jiafang_count, 0) AS jf,
      COALESCE(ketao_count, 0) AS kt
    FROM public.user_analysis
    WHERE total_messages IS NOT NULL AND total_messages >= 1
  ),
  me AS (
    SELECT * FROM base
    WHERE (p_user_id IS NOT NULL AND id::TEXT = p_user_id)
       OR (p_fingerprint IS NOT NULL AND fingerprint = p_fingerprint)
    LIMIT 1
  ),
  -- 每个维度的全球/本国排名（窗口函数）
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
    'total_user_chars', jsonb_build_object(
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
    )
  )
  FROM (SELECT 1) AS one;
$$;

COMMENT ON FUNCTION public.get_user_ranks_6d IS '返回 6 维度双排名（全球+本国），供 /api/v2/analyze 使用';
