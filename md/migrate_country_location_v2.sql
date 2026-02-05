-- ============================================
-- 迁移：国家切换影响聚合 v2
-- 功能：使「切换国家」后用户数据能正确进入该国统计（右侧抽屉）
-- 依赖：add_manual_location_columns.sql 已执行
-- ============================================

-- 步骤 1: 确保 user_analysis 有 current_location 列（若 API 已在使用，通常已存在）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_analysis' AND column_name = 'current_location'
  ) THEN
    ALTER TABLE public.user_analysis ADD COLUMN current_location TEXT;
    COMMENT ON COLUMN public.user_analysis.current_location IS '用户切换国籍后的国家代码（ISO2），供视图兜底';
  END IF;
END $$;

-- 步骤 2: 更新视图 v_unified_analysis_v2
-- 方案 2: 加入 current_location 兜底
-- 方案 3: 全名映射（China->CN, United States->US 等）
CREATE OR REPLACE VIEW public.v_unified_analysis_v2 AS
WITH base_data AS (
    SELECT DISTINCT ON (COALESCE(fingerprint, id::text))
        id, user_name, fingerprint, user_identity,
        l_score, p_score, d_score, e_score, f_score,
        stats, dimensions, personality,
        total_messages,
        total_chars,
        total_chars AS total_user_chars,
        work_days,
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
        -- country_code: manual_location 优先 > current_location 兜底 > ip_location > 全名映射
        CASE
          WHEN manual_location ~ '^[A-Za-z]{2}$' THEN UPPER(manual_location)
          WHEN current_location ~ '^[A-Za-z]{2}$' THEN UPPER(current_location)
          WHEN ip_location ~ '^[A-Za-z]{2}$' THEN UPPER(ip_location)
          -- 全名映射（方案 3）：常见 IP 返回格式
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
'统一用户分析视图 V2 - 地图与排行榜
country_code 优先级：manual_location > current_location > ip_location > 全名映射';
