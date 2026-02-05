-- ============================================
-- RPC: get_country_top_metrics_v1
-- 目的：
-- - 一次 RPC 返回“某国家 6 个指标 TopN 榜单”，用于 stats2.html 的“高分图谱”卡片
-- - 相比前端/Worker 每次做 6 次查询：更省连接、更低延迟、更稳定（适合 Supabase 免费档）
--
-- 依赖：
-- - public.v_unified_analysis_v2（国家口径、avg_user_message_length 等）
-- - public.user_analysis（补齐 github_username；若你已在 v_unified_analysis_v2 暴露该列，可移除 join）
--
-- 调用方式（PostgREST RPC）：
-- POST /rest/v1/rpc/get_country_top_metrics_v1
-- body: { "country_code": "CN", "top_n": 10 }
-- ============================================

CREATE OR REPLACE FUNCTION public.get_country_top_metrics_v1(country_code TEXT, top_n INT DEFAULT 10)
RETURNS JSONB
LANGUAGE sql
STABLE
AS $$
WITH params AS (
  SELECT
    UPPER(TRIM(country_code)) AS cc,
    GREATEST(3, LEAST(COALESCE(top_n, 10), 20)) AS topn
),
base AS (
  SELECT
    u.id,
    u.user_name,
    u.fingerprint,
    u.user_identity,
    u.lpdef,
    -- 真实 GitHub 用户名优先来自 user_analysis.github_username（避免 user_name 不是 GitHub handle）
    NULLIF(ua.github_username, '') AS github_username,
    u.total_messages,
    u.total_chars,
    u.total_user_chars,
    u.avg_user_message_length,
    u.jiafang_count,
    u.ketao_count
  FROM public.v_unified_analysis_v2 u
  LEFT JOIN public.user_analysis ua
    ON ua.id = u.id
  WHERE u.country_code = (SELECT cc FROM params)
),
-- 为每个指标构造 leaders[]（TopN）
tm_rows AS (
  SELECT * FROM base
  WHERE total_messages IS NOT NULL AND total_messages > 0
  ORDER BY total_messages DESC, id
  LIMIT (SELECT topn FROM params)
),
tc_rows AS (
  SELECT * FROM base
  WHERE total_chars IS NOT NULL AND total_chars > 0
  ORDER BY total_chars DESC, id
  LIMIT (SELECT topn FROM params)
),
tuc_rows AS (
  SELECT * FROM base
  WHERE total_user_chars IS NOT NULL AND total_user_chars > 0
  ORDER BY total_user_chars DESC, id
  LIMIT (SELECT topn FROM params)
),
avg_rows AS (
  SELECT * FROM base
  WHERE avg_user_message_length IS NOT NULL AND avg_user_message_length > 0
  ORDER BY avg_user_message_length DESC, id
  LIMIT (SELECT topn FROM params)
),
jf_rows AS (
  SELECT * FROM base
  WHERE jiafang_count IS NOT NULL AND jiafang_count > 0
  ORDER BY jiafang_count DESC, id
  LIMIT (SELECT topn FROM params)
),
kt_rows AS (
  SELECT * FROM base
  WHERE ketao_count IS NOT NULL AND ketao_count > 0
  ORDER BY ketao_count DESC, id
  LIMIT (SELECT topn FROM params)
),
-- JSON 组装：leaders 数组（带 rank/score/user）
tm_leaders AS (
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'rank', rn,
        'score', total_messages,
        'user', jsonb_build_object(
          'id', id,
          'user_name', user_name,
          'github_username', github_username,
          'fingerprint', fingerprint,
          'user_identity', user_identity,
          'lpdef', lpdef
        )
      )
      ORDER BY rn
    ),
    '[]'::jsonb
  ) AS leaders
  FROM (
    SELECT row_number() OVER (ORDER BY total_messages DESC, id) AS rn, *
    FROM tm_rows
  ) t
),
tc_leaders AS (
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'rank', rn,
        'score', total_chars,
        'user', jsonb_build_object(
          'id', id,
          'user_name', user_name,
          'github_username', github_username,
          'fingerprint', fingerprint,
          'user_identity', user_identity,
          'lpdef', lpdef
        )
      )
      ORDER BY rn
    ),
    '[]'::jsonb
  ) AS leaders
  FROM (
    SELECT row_number() OVER (ORDER BY total_chars DESC, id) AS rn, *
    FROM tc_rows
  ) t
),
tuc_leaders AS (
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'rank', rn,
        'score', total_user_chars,
        'user', jsonb_build_object(
          'id', id,
          'user_name', user_name,
          'github_username', github_username,
          'fingerprint', fingerprint,
          'user_identity', user_identity,
          'lpdef', lpdef
        )
      )
      ORDER BY rn
    ),
    '[]'::jsonb
  ) AS leaders
  FROM (
    SELECT row_number() OVER (ORDER BY total_user_chars DESC, id) AS rn, *
    FROM tuc_rows
  ) t
),
avg_leaders AS (
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'rank', rn,
        'score', avg_user_message_length,
        'user', jsonb_build_object(
          'id', id,
          'user_name', user_name,
          'github_username', github_username,
          'fingerprint', fingerprint,
          'user_identity', user_identity,
          'lpdef', lpdef
        )
      )
      ORDER BY rn
    ),
    '[]'::jsonb
  ) AS leaders
  FROM (
    SELECT row_number() OVER (ORDER BY avg_user_message_length DESC, id) AS rn, *
    FROM avg_rows
  ) t
),
jf_leaders AS (
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'rank', rn,
        'score', jiafang_count,
        'user', jsonb_build_object(
          'id', id,
          'user_name', user_name,
          'github_username', github_username,
          'fingerprint', fingerprint,
          'user_identity', user_identity,
          'lpdef', lpdef
        )
      )
      ORDER BY rn
    ),
    '[]'::jsonb
  ) AS leaders
  FROM (
    SELECT row_number() OVER (ORDER BY jiafang_count DESC, id) AS rn, *
    FROM jf_rows
  ) t
),
kt_leaders AS (
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'rank', rn,
        'score', ketao_count,
        'user', jsonb_build_object(
          'id', id,
          'user_name', user_name,
          'github_username', github_username,
          'fingerprint', fingerprint,
          'user_identity', user_identity,
          'lpdef', lpdef
        )
      )
      ORDER BY rn
    ),
    '[]'::jsonb
  ) AS leaders
  FROM (
    SELECT row_number() OVER (ORDER BY ketao_count DESC, id) AS rn, *
    FROM kt_rows
  ) t
),
-- top1：兼容旧字段 score/user
tm_top1 AS (
  SELECT
    total_messages AS score,
    jsonb_build_object(
      'id', id,
      'user_name', user_name,
      'github_username', github_username,
      'fingerprint', fingerprint,
      'user_identity', user_identity,
      'lpdef', lpdef
    ) AS "user"
  FROM base
  WHERE total_messages IS NOT NULL AND total_messages > 0
  ORDER BY total_messages DESC, id
  LIMIT 1
),
tc_top1 AS (
  SELECT
    total_chars AS score,
    jsonb_build_object(
      'id', id,
      'user_name', user_name,
      'github_username', github_username,
      'fingerprint', fingerprint,
      'user_identity', user_identity,
      'lpdef', lpdef
    ) AS "user"
  FROM base
  WHERE total_chars IS NOT NULL AND total_chars > 0
  ORDER BY total_chars DESC, id
  LIMIT 1
),
tuc_top1 AS (
  SELECT
    total_user_chars AS score,
    jsonb_build_object(
      'id', id,
      'user_name', user_name,
      'github_username', github_username,
      'fingerprint', fingerprint,
      'user_identity', user_identity,
      'lpdef', lpdef
    ) AS "user"
  FROM base
  WHERE total_user_chars IS NOT NULL AND total_user_chars > 0
  ORDER BY total_user_chars DESC, id
  LIMIT 1
),
avg_top1 AS (
  SELECT
    avg_user_message_length AS score,
    jsonb_build_object(
      'id', id,
      'user_name', user_name,
      'github_username', github_username,
      'fingerprint', fingerprint,
      'user_identity', user_identity,
      'lpdef', lpdef
    ) AS "user"
  FROM base
  WHERE avg_user_message_length IS NOT NULL AND avg_user_message_length > 0
  ORDER BY avg_user_message_length DESC, id
  LIMIT 1
),
jf_top1 AS (
  SELECT
    jiafang_count AS score,
    jsonb_build_object(
      'id', id,
      'user_name', user_name,
      'github_username', github_username,
      'fingerprint', fingerprint,
      'user_identity', user_identity,
      'lpdef', lpdef
    ) AS "user"
  FROM base
  WHERE jiafang_count IS NOT NULL AND jiafang_count > 0
  ORDER BY jiafang_count DESC, id
  LIMIT 1
),
kt_top1 AS (
  SELECT
    ketao_count AS score,
    jsonb_build_object(
      'id', id,
      'user_name', user_name,
      'github_username', github_username,
      'fingerprint', fingerprint,
      'user_identity', user_identity,
      'lpdef', lpdef
    ) AS "user"
  FROM base
  WHERE ketao_count IS NOT NULL AND ketao_count > 0
  ORDER BY ketao_count DESC, id
  LIMIT 1
)
SELECT jsonb_build_array(
  jsonb_build_object(
    'key', 'total_messages',
    'col', 'total_messages',
    'labelZh', '调戏AI次数',
    'labelEn', 'Messages',
    'format', 'int',
    'topN', (SELECT topn FROM params),
    'leaders', (SELECT leaders FROM tm_leaders),
    'score', (SELECT score FROM tm_top1),
    'user', (SELECT "user" FROM tm_top1)
  ),
  jsonb_build_object(
    'key', 'total_chars',
    'col', 'total_chars',
    'labelZh', '对话字符数',
    'labelEn', 'Total Chars',
    'format', 'int',
    'topN', (SELECT topn FROM params),
    'leaders', (SELECT leaders FROM tc_leaders),
    'score', (SELECT score FROM tc_top1),
    'user', (SELECT "user" FROM tc_top1)
  ),
  jsonb_build_object(
    'key', 'total_user_chars',
    'col', 'total_user_chars',
    'labelZh', '废话输出',
    'labelEn', 'User Chars',
    'format', 'int',
    'topN', (SELECT topn FROM params),
    'leaders', (SELECT leaders FROM tuc_leaders),
    'score', (SELECT score FROM tuc_top1),
    'user', (SELECT "user" FROM tuc_top1)
  ),
  jsonb_build_object(
    'key', 'avg_user_message_length',
    'col', 'avg_user_message_length',
    'labelZh', '平均长度',
    'labelEn', 'Avg Len',
    'format', 'float',
    'topN', (SELECT topn FROM params),
    'leaders', (SELECT leaders FROM avg_leaders),
    'score', (SELECT score FROM avg_top1),
    'user', (SELECT "user" FROM avg_top1)
  ),
  jsonb_build_object(
    'key', 'jiafang_count',
    'col', 'jiafang_count',
    'labelZh', '甲方上身',
    'labelEn', 'Jiafang',
    'format', 'int',
    'topN', (SELECT topn FROM params),
    'leaders', (SELECT leaders FROM jf_leaders),
    'score', (SELECT score FROM jf_top1),
    'user', (SELECT "user" FROM jf_top1)
  ),
  jsonb_build_object(
    'key', 'ketao_count',
    'col', 'ketao_count',
    'labelZh', '磕头',
    'labelEn', 'Ketao',
    'format', 'int',
    'topN', (SELECT topn FROM params),
    'leaders', (SELECT leaders FROM kt_leaders),
    'score', (SELECT score FROM kt_top1),
    'user', (SELECT "user" FROM kt_top1)
  )
);
$$;

COMMENT ON FUNCTION public.get_country_top_metrics_v1(TEXT, INT) IS
'一次 RPC 返回某国家 6 个指标 TopN 榜单（用于 stats2 高分图谱）。';

-- 访问授权（可选：如果仅 Worker 用 service role key，也可以不授 anon）
GRANT EXECUTE ON FUNCTION public.get_country_top_metrics_v1(TEXT, INT) TO anon;
GRANT EXECUTE ON FUNCTION public.get_country_top_metrics_v1(TEXT, INT) TO authenticated;

