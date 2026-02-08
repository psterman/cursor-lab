-- ============================================
-- RPC: get_country_ranks_v3
-- 目的：返回各国 6 维度累积与全球排名（rank_l..rank_g）
-- 6 维度：total_messages(l), total_chars(m), total_user_chars(n), avg_user_message_length(o), jiafang_count(p), ketao_count(g)
-- 调用：POST /rest/v1/rpc/get_country_ranks_v3
-- 返回：Array<{ country_code, ip_location, total_users, tm, tc, tuc, jc, kc, avg_len, rank_l, rank_m, rank_n, rank_o, rank_p, rank_g }>
-- ============================================

CREATE OR REPLACE FUNCTION public.get_country_ranks_v3()
RETURNS TABLE (
  country_code TEXT,
  ip_location TEXT,
  total_users BIGINT,
  tm BIGINT,
  tc BIGINT,
  tuc BIGINT,
  jc BIGINT,
  kc BIGINT,
  avg_len NUMERIC,
  rank_l BIGINT,
  rank_m BIGINT,
  rank_n BIGINT,
  rank_o BIGINT,
  rank_p BIGINT,
  rank_g BIGINT
)
LANGUAGE sql
STABLE
AS $$
  WITH base AS (
    SELECT
      UPPER(COALESCE(NULLIF(TRIM(country_code), ''), NULLIF(TRIM(ip_location), ''), 'XX')) AS cc,
      COUNT(*)::BIGINT AS users,
      COALESCE(SUM(total_messages), 0)::BIGINT AS tm,
      COALESCE(SUM(total_chars), 0)::BIGINT AS tc,
      COALESCE(SUM(total_user_chars), 0)::BIGINT AS tuc,
      COALESCE(SUM(jiafang_count), 0)::BIGINT AS jc,
      COALESCE(SUM(ketao_count), 0)::BIGINT AS kc,
      COALESCE(
        (COALESCE(SUM(total_user_chars), 0)::NUMERIC / NULLIF(COALESCE(SUM(total_messages), 0), 0)),
        0
      ) AS avg_len
    FROM public.v_unified_analysis_v2
    WHERE (country_code ~ '^[A-Za-z]{2}$' OR ip_location ~ '^[A-Za-z]{2}$')
    GROUP BY 1
  ),
  ranked AS (
    SELECT
      cc,
      users,
      tm, tc, tuc, jc, kc, avg_len,
      RANK() OVER (ORDER BY tm DESC NULLS LAST) AS rl,
      RANK() OVER (ORDER BY tc DESC NULLS LAST) AS rm,
      RANK() OVER (ORDER BY tuc DESC NULLS LAST) AS rn,
      RANK() OVER (ORDER BY avg_len DESC NULLS LAST) AS ro,
      RANK() OVER (ORDER BY jc DESC NULLS LAST) AS rp,
      RANK() OVER (ORDER BY kc DESC NULLS LAST) AS rg
    FROM base
  )
  SELECT
    cc::TEXT AS country_code,
    cc::TEXT AS ip_location,
    users AS total_users,
    tm, tc, tuc, jc, kc, avg_len,
    rl::BIGINT AS rank_l,
    rm::BIGINT AS rank_m,
    rn::BIGINT AS rank_n,
    ro::BIGINT AS rank_o,
    rp::BIGINT AS rank_p,
    rg::BIGINT AS rank_g
  FROM ranked
  ORDER BY tm DESC;
$$;

COMMENT ON FUNCTION public.get_country_ranks_v3 IS '各国 6 维度累积与全球排名（rank_l..rank_g），供 writeGlobalCountryStatsToKV 使用';
