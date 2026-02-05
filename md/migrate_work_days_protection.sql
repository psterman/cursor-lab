-- ============================================
-- 迁移：work_days / 上岗天数 保护
-- 1) 触发器：UPDATE 时保持 created_at 不变
-- 2) 视图：work_days = COALESCE(manual_work_days, 动态计算)
-- ============================================

-- 步骤 1: 创建触发器函数，确保 UPDATE 时不覆盖 created_at
CREATE OR REPLACE FUNCTION public.trg_user_analysis_preserve_created_at()
RETURNS TRIGGER AS $$
BEGIN
  -- 仅当 OLD 行已存在且 NEW.created_at 与 OLD 不同时，恢复 OLD.created_at
  IF OLD IS NOT NULL AND NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    NEW.created_at := OLD.created_at;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 步骤 2: 创建触发器（若已存在则先删除）
DROP TRIGGER IF EXISTS trg_user_analysis_preserve_created_at ON public.user_analysis;
CREATE TRIGGER trg_user_analysis_preserve_created_at
  BEFORE UPDATE ON public.user_analysis
  FOR EACH ROW
  EXECUTE PROCEDURE public.trg_user_analysis_preserve_created_at();

COMMENT ON FUNCTION public.trg_user_analysis_preserve_created_at() IS 
'保护 user_analysis 首次创建时间：upsert/UPDATE 时不允许覆盖 created_at';

-- 步骤 3: 若 user_analysis 表有 manual_work_days 列则使用；否则用 work_days
-- 注意：若 manual_work_days 列不存在，可先执行：
-- ALTER TABLE public.user_analysis ADD COLUMN IF NOT EXISTS manual_work_days INTEGER;
-- 这里假定使用现有 work_days 列作为「从前端同步的真实天数」，created_at 作为兜底

-- 步骤 4: 重构视图 v_unified_analysis_v2
-- work_days 逻辑：COALESCE(work_days, GREATEST(1, (now() - created_at)::int / 86400))
-- 即：优先使用前端同步的 work_days，若无则根据 created_at 动态计算
CREATE OR REPLACE VIEW public.v_unified_analysis_v2 AS
WITH base_data AS (
    SELECT DISTINCT ON (COALESCE(fingerprint, id::text))
        id, user_name, fingerprint, user_identity,
        l_score, p_score, d_score, e_score, f_score,
        stats, dimensions, personality,
        total_messages,
        total_chars,
        total_chars AS total_user_chars,
        -- work_days: 优先前端同步值，否则按 created_at 动态计算
        COALESCE(
          NULLIF(work_days, 0),
          GREATEST(1, EXTRACT(EPOCH FROM (now() - created_at))::bigint / 86400)
        )::int AS work_days,
        jiafang_count, ketao_count,
        vibe_index AS vibe_index_str,
        lpdef,
        ip_location,
        lat AS raw_lat,
        lng AS raw_lng,
        manual_location, manual_lat, manual_lng,
        current_location,
        created_at, updated_at
    FROM public.user_analysis
    ORDER BY COALESCE(fingerprint, id::text), user_identity DESC, created_at DESC
),
unified AS (
    SELECT
        id, user_name, fingerprint, user_identity,
        l_score, p_score, d_score, e_score, f_score,
        stats, dimensions, personality,
        total_messages,
        total_chars,
        total_user_chars,
        work_days,
        jiafang_count, ketao_count,
        vibe_index_str, lpdef,
        ip_location,
        COALESCE(manual_lat, raw_lat) AS lat,
        COALESCE(manual_lng, raw_lng) AS lng,
        manual_location, manual_lat, manual_lng,
        CASE
          WHEN manual_location ~ '^[A-Za-z]{2}$' THEN UPPER(manual_location)
          WHEN current_location ~ '^[A-Za-z]{2}$' THEN UPPER(current_location)
          WHEN ip_location ~ '^[A-Za-z]{2}$' THEN UPPER(ip_location)
          WHEN UPPER(TRIM(ip_location)) IN ('CHINA', 'CN', 'ZH') THEN 'CN'
          WHEN UPPER(TRIM(ip_location)) IN ('UNITED STATES', 'USA', 'US', 'UNITED STATES OF AMERICA') THEN 'US'
          WHEN UPPER(TRIM(ip_location)) IN ('JAPAN', 'JP') THEN 'JP'
          WHEN UPPER(TRIM(ip_location)) IN ('SOUTH KOREA', 'KOREA', 'KR') THEN 'KR'
          WHEN UPPER(TRIM(ip_location)) IN ('UNITED KINGDOM', 'UK', 'GB') THEN 'GB'
          WHEN UPPER(TRIM(ip_location)) IN ('GERMANY', 'DE') THEN 'DE'
          WHEN UPPER(TRIM(ip_location)) IN ('FRANCE', 'FR') THEN 'FR'
          WHEN UPPER(TRIM(ip_location)) IN ('INDIA', 'IN') THEN 'IN'
          WHEN UPPER(TRIM(ip_location)) IN ('CANADA', 'CA') THEN 'CA'
          WHEN UPPER(TRIM(ip_location)) IN ('AUSTRALIA', 'AU') THEN 'AU'
          WHEN UPPER(TRIM(manual_location)) IN ('CHINA', 'CN') THEN 'CN'
          WHEN UPPER(TRIM(manual_location)) IN ('UNITED STATES', 'USA', 'US') THEN 'US'
          ELSE NULL
        END AS country_code,
        created_at, updated_at,
        ROUND((COALESCE(l_score,0)*0.25 + COALESCE(p_score,0)*0.20 + COALESCE(d_score,0)*0.25 + COALESCE(e_score,0)*0.15 + COALESCE(f_score,0)*0.15)::numeric, 2) AS vibe_index,
        CASE WHEN total_messages IS NOT NULL AND total_messages > 0
          THEN ROUND((total_user_chars::numeric / NULLIF(total_messages, 0))::numeric, 2)
          ELSE NULL
        END AS avg_user_message_length
    FROM base_data
)
SELECT
    id, user_name, fingerprint, user_identity,
    l_score, p_score, d_score, e_score, f_score,
    stats, dimensions, personality,
    total_messages,
    total_user_chars,
    total_chars,
    avg_user_message_length,
    work_days,
    jiafang_count, ketao_count,
    vibe_index_str, lpdef,
    ip_location, lat, lng,
    manual_location, manual_lat, manual_lng,
    country_code, created_at, updated_at,
    vibe_index,
    CASE WHEN vibe_index IS NOT NULL THEN
        (SELECT COUNT(*) + 1 FROM unified u2 WHERE u2.vibe_index > unified.vibe_index)
    ELSE NULL END AS vibe_rank,
    CASE WHEN vibe_index IS NOT NULL THEN
        ROUND((SELECT COUNT(*)::numeric FROM unified u2 WHERE u2.vibe_index <= unified.vibe_index) * 100.0 /
              NULLIF((SELECT COUNT(*) FROM unified WHERE vibe_index IS NOT NULL), 0), 2)
    ELSE NULL END AS vibe_percentile
FROM unified;

COMMENT ON VIEW public.v_unified_analysis_v2 IS 
'统一用户分析视图 V2 - work_days 优先使用前端同步值，否则按 created_at 动态计算';
