-- ============================================
-- 升级：get_country_top_metrics_v1 用 work_days 替代 total_user_chars
-- 6 指标：total_messages, total_chars, avg_user_message_length, jiafang_count, ketao_count, work_days
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
    NULLIF(ua.github_username, '') AS github_username,
    u.total_messages,
    u.total_chars,
    u.avg_user_message_length,
    u.jiafang_count,
    u.ketao_count,
    u.work_days
  FROM public.v_unified_analysis_v2 u
  LEFT JOIN public.user_analysis ua ON ua.id = u.id
  WHERE u.country_code = (SELECT cc FROM params)
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
  SELECT COALESCE(jsonb_agg(jsonb_build_object('rank', rn, 'score', total_messages, 'user', jsonb_build_object('id', id, 'user_name', user_name, 'github_username', github_username, 'fingerprint', fingerprint, 'user_identity', user_identity, 'lpdef', lpdef)) ORDER BY rn), '[]'::jsonb) AS leaders
  FROM (SELECT row_number() OVER (ORDER BY total_messages DESC, id) AS rn, * FROM tm_rows) t
),
tc_leaders AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object('rank', rn, 'score', total_chars, 'user', jsonb_build_object('id', id, 'user_name', user_name, 'github_username', github_username, 'fingerprint', fingerprint, 'user_identity', user_identity, 'lpdef', lpdef)) ORDER BY rn), '[]'::jsonb) AS leaders
  FROM (SELECT row_number() OVER (ORDER BY total_chars DESC, id) AS rn, * FROM tc_rows) t
),
avg_leaders AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object('rank', rn, 'score', avg_user_message_length, 'user', jsonb_build_object('id', id, 'user_name', user_name, 'github_username', github_username, 'fingerprint', fingerprint, 'user_identity', user_identity, 'lpdef', lpdef)) ORDER BY rn), '[]'::jsonb) AS leaders
  FROM (SELECT row_number() OVER (ORDER BY avg_user_message_length DESC, id) AS rn, * FROM avg_rows) t
),
jf_leaders AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object('rank', rn, 'score', jiafang_count, 'user', jsonb_build_object('id', id, 'user_name', user_name, 'github_username', github_username, 'fingerprint', fingerprint, 'user_identity', user_identity, 'lpdef', lpdef)) ORDER BY rn), '[]'::jsonb) AS leaders
  FROM (SELECT row_number() OVER (ORDER BY jiafang_count DESC, id) AS rn, * FROM jf_rows) t
),
kt_leaders AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object('rank', rn, 'score', ketao_count, 'user', jsonb_build_object('id', id, 'user_name', user_name, 'github_username', github_username, 'fingerprint', fingerprint, 'user_identity', user_identity, 'lpdef', lpdef)) ORDER BY rn), '[]'::jsonb) AS leaders
  FROM (SELECT row_number() OVER (ORDER BY ketao_count DESC, id) AS rn, * FROM kt_rows) t
),
wd_leaders AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object('rank', rn, 'score', work_days, 'user', jsonb_build_object('id', id, 'user_name', user_name, 'github_username', github_username, 'fingerprint', fingerprint, 'user_identity', user_identity, 'lpdef', lpdef)) ORDER BY rn), '[]'::jsonb) AS leaders
  FROM (SELECT row_number() OVER (ORDER BY work_days DESC, id) AS rn, * FROM wd_rows) t
),
tm_top1 AS (SELECT total_messages AS score, jsonb_build_object('id', id, 'user_name', user_name, 'github_username', github_username, 'fingerprint', fingerprint, 'user_identity', user_identity, 'lpdef', lpdef) AS "user" FROM tm_rows LIMIT 1),
tc_top1 AS (SELECT total_chars AS score, jsonb_build_object('id', id, 'user_name', user_name, 'github_username', github_username, 'fingerprint', fingerprint, 'user_identity', user_identity, 'lpdef', lpdef) AS "user" FROM tc_rows LIMIT 1),
avg_top1 AS (SELECT avg_user_message_length AS score, jsonb_build_object('id', id, 'user_name', user_name, 'github_username', github_username, 'fingerprint', fingerprint, 'user_identity', user_identity, 'lpdef', lpdef) AS "user" FROM avg_rows LIMIT 1),
jf_top1 AS (SELECT jiafang_count AS score, jsonb_build_object('id', id, 'user_name', user_name, 'github_username', github_username, 'fingerprint', fingerprint, 'user_identity', user_identity, 'lpdef', lpdef) AS "user" FROM jf_rows LIMIT 1),
kt_top1 AS (SELECT ketao_count AS score, jsonb_build_object('id', id, 'user_name', user_name, 'github_username', github_username, 'fingerprint', fingerprint, 'user_identity', user_identity, 'lpdef', lpdef) AS "user" FROM kt_rows LIMIT 1),
wd_top1 AS (SELECT work_days AS score, jsonb_build_object('id', id, 'user_name', user_name, 'github_username', github_username, 'fingerprint', fingerprint, 'user_identity', user_identity, 'lpdef', lpdef) AS "user" FROM wd_rows LIMIT 1)
SELECT jsonb_build_array(
  jsonb_build_object('key', 'total_messages', 'col', 'total_messages', 'labelZh', '调戏AI次数', 'labelEn', 'Messages', 'format', 'int', 'topN', (SELECT topn FROM params), 'leaders', (SELECT leaders FROM tm_leaders), 'score', (SELECT score FROM tm_top1), 'user', (SELECT "user" FROM tm_top1)),
  jsonb_build_object('key', 'total_chars', 'col', 'total_chars', 'labelZh', '对话字符数', 'labelEn', 'Total Chars', 'format', 'int', 'topN', (SELECT topn FROM params), 'leaders', (SELECT leaders FROM tc_leaders), 'score', (SELECT score FROM tc_top1), 'user', (SELECT "user" FROM tc_top1)),
  jsonb_build_object('key', 'avg_user_message_length', 'col', 'avg_user_message_length', 'labelZh', '平均长度', 'labelEn', 'Avg Len', 'format', 'float', 'topN', (SELECT topn FROM params), 'leaders', (SELECT leaders FROM avg_leaders), 'score', (SELECT score FROM avg_top1), 'user', (SELECT "user" FROM avg_top1)),
  jsonb_build_object('key', 'jiafang_count', 'col', 'jiafang_count', 'labelZh', '甲方上身', 'labelEn', 'Jiafang', 'format', 'int', 'topN', (SELECT topn FROM params), 'leaders', (SELECT leaders FROM jf_leaders), 'score', (SELECT score FROM jf_top1), 'user', (SELECT "user" FROM jf_top1)),
  jsonb_build_object('key', 'ketao_count', 'col', 'ketao_count', 'labelZh', '磕头', 'labelEn', 'Ketao', 'format', 'int', 'topN', (SELECT topn FROM params), 'leaders', (SELECT leaders FROM kt_leaders), 'score', (SELECT score FROM kt_top1), 'user', (SELECT "user" FROM kt_top1)),
  jsonb_build_object('key', 'work_days', 'col', 'work_days', 'labelZh', '上岗天数', 'labelEn', 'Work Days', 'format', 'int', 'topN', (SELECT topn FROM params), 'leaders', (SELECT leaders FROM wd_leaders), 'score', (SELECT score FROM wd_top1), 'user', (SELECT "user" FROM wd_top1))
);
$$;

COMMENT ON FUNCTION public.get_country_top_metrics_v1(TEXT, INT) IS '某国家 6 指标 TopN 榜单（含 work_days，用于 stats2 高分图谱）';
