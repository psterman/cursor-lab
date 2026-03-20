-- 国家口径与 Worker / get_country_dimension_averages 一致：按 current_location、manual_location、country_code、ip_location 任一匹配
-- 解决「高分图谱」该国 Tab 下显示「暂无数据」而实际该国有用户的问题（视图 country_code 仅来自 manual/ip，不含 current_location）

CREATE OR REPLACE FUNCTION public.get_country_top_metrics_v1(country_code TEXT, top_n INT DEFAULT 10)
RETURNS JSONB
LANGUAGE sql
STABLE
AS $$
WITH params AS (
  SELECT
    NULLIF(TRIM(country_code), '')::TEXT AS cc_raw,
    GREATEST(3, LEAST(COALESCE(top_n, 10), 20)) AS topn
),
base AS (
  SELECT
    u.id,
    u.user_name,
    u.fingerprint,
    u.user_identity,
    ua.lpdef,
    COALESCE(
      NULLIF(ua.github_login, ''),
      NULLIF(u.user_name, '')
    ) AS github_username,
    u.total_messages,
    u.total_chars,
    u.total_chars AS total_user_chars,
    (CASE WHEN COALESCE(u.total_messages, 0) > 0 THEN ROUND((u.total_chars::numeric / NULLIF(u.total_messages, 0))::numeric, 2) ELSE NULL END) AS avg_user_message_length,
    u.jiafang_count,
    u.ketao_count,
    ua.work_days AS work_days
  FROM public.v_unified_analysis_v2 u
  LEFT JOIN public.user_analysis ua ON ua.id = u.id
  WHERE (SELECT cc_raw FROM params) IS NULL
     OR UPPER(TRIM(ua.current_location)) = UPPER(TRIM((SELECT cc_raw FROM params)))
     OR UPPER(TRIM(ua.manual_location)) = UPPER(TRIM((SELECT cc_raw FROM params)))
     OR UPPER(TRIM(ua.country_code)) = UPPER(TRIM((SELECT cc_raw FROM params)))
     OR UPPER(TRIM(ua.ip_location)) = UPPER(TRIM((SELECT cc_raw FROM params)))
),
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
wd_rows AS (
  SELECT * FROM base
  WHERE work_days IS NOT NULL AND work_days > 0
  ORDER BY work_days DESC, id
  LIMIT (SELECT topn FROM params)
),
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
wd_leaders AS (
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'rank', rn,
        'score', work_days,
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
    SELECT row_number() OVER (ORDER BY work_days DESC, id) AS rn, *
    FROM wd_rows
  ) t
),
tm_top1 AS (SELECT (SELECT jsonb_array_elements(leaders) FROM tm_leaders LIMIT 1) AS j LIMIT 1),
tc_top1 AS (SELECT (SELECT jsonb_array_elements(leaders) FROM tc_leaders LIMIT 1) AS j LIMIT 1),
tuc_top1 AS (SELECT (SELECT jsonb_array_elements(leaders) FROM tuc_leaders LIMIT 1) AS j LIMIT 1),
avg_top1 AS (SELECT (SELECT jsonb_array_elements(leaders) FROM avg_leaders LIMIT 1) AS j LIMIT 1),
jf_top1 AS (SELECT (SELECT jsonb_array_elements(leaders) FROM jf_leaders LIMIT 1) AS j LIMIT 1),
kt_top1 AS (SELECT (SELECT jsonb_array_elements(leaders) FROM kt_leaders LIMIT 1) AS j LIMIT 1),
wd_top1 AS (SELECT (SELECT jsonb_array_elements(leaders) FROM wd_leaders LIMIT 1) AS j LIMIT 1),
score_tm AS (SELECT (j->>'score')::numeric AS score, j->'user' AS "user" FROM tm_top1 WHERE j IS NOT NULL LIMIT 1),
score_tc AS (SELECT (j->>'score')::numeric AS score, j->'user' AS "user" FROM tc_top1 WHERE j IS NOT NULL LIMIT 1),
score_tuc AS (SELECT (j->>'score')::numeric AS score, j->'user' AS "user" FROM tuc_top1 WHERE j IS NOT NULL LIMIT 1),
score_avg AS (SELECT (j->>'score')::numeric AS score, j->'user' AS "user" FROM avg_top1 WHERE j IS NOT NULL LIMIT 1),
score_jf AS (SELECT (j->>'score')::numeric AS score, j->'user' AS "user" FROM jf_top1 WHERE j IS NOT NULL LIMIT 1),
score_kt AS (SELECT (j->>'score')::numeric AS score, j->'user' AS "user" FROM kt_top1 WHERE j IS NOT NULL LIMIT 1),
score_wd AS (SELECT (j->>'score')::numeric AS score, j->'user' AS "user" FROM wd_top1 WHERE j IS NOT NULL LIMIT 1)
SELECT jsonb_build_array(
  jsonb_build_object('key', 'total_messages', 'col', 'total_messages', 'labelZh', '调戏AI次数', 'labelEn', 'Messages', 'format', 'int', 'topN', (SELECT topn FROM params), 'leaders', (SELECT leaders FROM tm_leaders), 'score', (SELECT score FROM score_tm), 'user', (SELECT "user" FROM score_tm)),
  jsonb_build_object('key', 'total_chars', 'col', 'total_chars', 'labelZh', '对话字符数', 'labelEn', 'Chars', 'format', 'int', 'topN', (SELECT topn FROM params), 'leaders', (SELECT leaders FROM tc_leaders), 'score', (SELECT score FROM score_tc), 'user', (SELECT "user" FROM score_tc)),
  jsonb_build_object('key', 'total_user_chars', 'col', 'total_user_chars', 'labelZh', '废话输出', 'labelEn', 'User Chars', 'format', 'int', 'topN', (SELECT topn FROM params), 'leaders', (SELECT leaders FROM tuc_leaders), 'score', (SELECT score FROM score_tuc), 'user', (SELECT "user" FROM score_tuc)),
  jsonb_build_object('key', 'avg_user_message_length', 'col', 'avg_user_message_length', 'labelZh', '平均句长', 'labelEn', 'Avg Len', 'format', 'float', 'topN', (SELECT topn FROM params), 'leaders', (SELECT leaders FROM avg_leaders), 'score', (SELECT score FROM score_avg), 'user', (SELECT "user" FROM score_avg)),
  jsonb_build_object('key', 'jiafang_count', 'col', 'jiafang_count', 'labelZh', '甲方上身', 'labelEn', 'Jiafang', 'format', 'int', 'topN', (SELECT topn FROM params), 'leaders', (SELECT leaders FROM jf_leaders), 'score', (SELECT score FROM score_jf), 'user', (SELECT "user" FROM score_jf)),
  jsonb_build_object('key', 'ketao_count', 'col', 'ketao_count', 'labelZh', '磕头', 'labelEn', 'Ketao', 'format', 'int', 'topN', (SELECT topn FROM params), 'leaders', (SELECT leaders FROM kt_leaders), 'score', (SELECT score FROM score_kt), 'user', (SELECT "user" FROM score_kt)),
  jsonb_build_object('key', 'work_days', 'col', 'work_days', 'labelZh', '上岗天数', 'labelEn', 'Work Days', 'format', 'int', 'topN', (SELECT topn FROM params), 'leaders', (SELECT leaders FROM wd_leaders), 'score', (SELECT score FROM score_wd), 'user', (SELECT "user" FROM score_wd))
);
$$;

COMMENT ON FUNCTION public.get_country_top_metrics_v1(TEXT, INT) IS
'某国家或全球 6 指标 TopN 榜单；国家口径与 Worker 一致：current_location / manual_location / country_code / ip_location 任一匹配；country_code 为 null 或空时返回全球榜。';
