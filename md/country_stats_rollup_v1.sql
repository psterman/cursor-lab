-- ============================================
-- 国家级聚合（长期方案）V1
-- 目标：
-- 1) 将 “国家累计（Totals）” 从实时扫描降为预聚合表读取
-- 2) 由定时任务（Cloudflare Cron / 其他外部 Cron）触发 RPC 刷新
-- 3) stats2.html 的 “国家累计 & 我的排名” 能稳定返回真实数值
--
-- 依赖：
-- - public.v_unified_analysis_v2（建议已按本仓库 create_unified_view_v2.sql 创建）
-- - 建议同时把 create_unified_view_v2.sql 升级为：规范 country_code=ISO2 + 提供 avg_user_message_length/total_user_chars
-- ============================================

-- 1) 国家累计预聚合表（当前快照）
CREATE TABLE IF NOT EXISTS public.country_stats_current (
  country_code TEXT PRIMARY KEY,
  total_users BIGINT NOT NULL DEFAULT 0,
  total_messages_sum BIGINT NOT NULL DEFAULT 0,
  total_user_chars_sum BIGINT NOT NULL DEFAULT 0,
  total_chars_sum BIGINT NOT NULL DEFAULT 0,
  jiafang_count_sum BIGINT NOT NULL DEFAULT 0,
  ketao_count_sum BIGINT NOT NULL DEFAULT 0,
  avg_user_message_length NUMERIC NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.country_stats_current IS '国家级累计快照（由 refresh_country_stats_current 定时刷新）';

-- 2) 刷新函数：全量重算（V1：分钟级刷新也可接受；后续可做增量）
CREATE OR REPLACE FUNCTION public.refresh_country_stats_current()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- 用 CTE 聚合所有 ISO2 国家（避免把 IP/未知/全名混进来）
  WITH src AS (
    SELECT
      UPPER(country_code) AS country_code,
      COUNT(*)::BIGINT AS total_users,
      COALESCE(SUM(total_messages), 0)::BIGINT AS total_messages_sum,
      COALESCE(SUM(total_user_chars), 0)::BIGINT AS total_user_chars_sum,
      COALESCE(SUM(total_chars), 0)::BIGINT AS total_chars_sum,
      COALESCE(SUM(jiafang_count), 0)::BIGINT AS jiafang_count_sum,
      COALESCE(SUM(ketao_count), 0)::BIGINT AS ketao_count_sum,
      -- 平均长度：用总量口径更稳定（避免单用户极端值拉偏）
      COALESCE(
        (COALESCE(SUM(total_user_chars), 0)::NUMERIC / NULLIF(COALESCE(SUM(total_messages), 0), 0)),
        0
      ) AS avg_user_message_length
    FROM public.v_unified_analysis_v2
    WHERE country_code ~ '^[A-Za-z]{2}$'
    GROUP BY 1
  )
  INSERT INTO public.country_stats_current (
    country_code,
    total_users,
    total_messages_sum,
    total_user_chars_sum,
    total_chars_sum,
    jiafang_count_sum,
    ketao_count_sum,
    avg_user_message_length,
    updated_at
  )
  SELECT
    country_code,
    total_users,
    total_messages_sum,
    total_user_chars_sum,
    total_chars_sum,
    jiafang_count_sum,
    ketao_count_sum,
    avg_user_message_length,
    NOW()
  FROM src
  ON CONFLICT (country_code) DO UPDATE SET
    total_users = EXCLUDED.total_users,
    total_messages_sum = EXCLUDED.total_messages_sum,
    total_user_chars_sum = EXCLUDED.total_user_chars_sum,
    total_chars_sum = EXCLUDED.total_chars_sum,
    jiafang_count_sum = EXCLUDED.jiafang_count_sum,
    ketao_count_sum = EXCLUDED.ketao_count_sum,
    avg_user_message_length = EXCLUDED.avg_user_message_length,
    updated_at = NOW();

  -- 删除已不再出现的国家
  DELETE FROM public.country_stats_current c
  WHERE NOT EXISTS (
    SELECT 1 FROM public.v_unified_analysis_v2 u
    WHERE u.country_code ~ '^[A-Za-z]{2}$'
      AND UPPER(u.country_code) = c.country_code
  );
END;
$$;

COMMENT ON FUNCTION public.refresh_country_stats_current IS '刷新 country_stats_current（国家级累计快照）';

-- 3) 访问授权（可选：若仅 Worker 用 service key，可不授 anon）
GRANT SELECT ON public.country_stats_current TO anon;
GRANT SELECT ON public.country_stats_current TO authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_country_stats_current() TO anon;
GRANT EXECUTE ON FUNCTION public.refresh_country_stats_current() TO authenticated;

-- 4) 索引建议（排名查询性能关键：country_code + metric）
-- 如果你已经按“升级版 v_unified_analysis_v2”把 country_code 写回 base table，可把索引建在 user_analysis.country_code 上。
-- 这里先按现有表字段给最小建议（manual_location/ip_location 必须存 ISO2 才有效）。
CREATE INDEX IF NOT EXISTS idx_user_analysis_manual_location ON public.user_analysis (manual_location) WHERE manual_location IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_analysis_ip_location ON public.user_analysis (ip_location) WHERE ip_location IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_analysis_manual_location_total_messages ON public.user_analysis (manual_location, total_messages DESC) WHERE manual_location IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_analysis_manual_location_total_chars ON public.user_analysis (manual_location, total_chars DESC) WHERE manual_location IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_analysis_manual_location_jiafang ON public.user_analysis (manual_location, jiafang_count DESC) WHERE manual_location IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_analysis_manual_location_ketao ON public.user_analysis (manual_location, ketao_count DESC) WHERE manual_location IS NOT NULL;

-- 5) 一次手动刷新（执行脚本后可跑一次）
-- SELECT public.refresh_country_stats_current();

