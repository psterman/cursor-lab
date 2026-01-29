-- ============================================
-- 创建统一数据视图 v_unified_analysis_v2
-- 功能：去重处理、数据补全（vibe_index）、统一统计口径
-- ============================================

-- 步骤 1: 创建统一视图
-- 去重处理：如果同一个用户既有指纹记录又有 GitHub 记录，通过视图逻辑进行合并展示
-- 数据补全：为所有记录计算 vibe_index（如果缺失）
-- 统计口径统一：lat/lng 优先用手动校准，与自动定位和谐相处

CREATE OR REPLACE VIEW public.v_unified_analysis_v2 AS
WITH base_data AS (
    -- 1. 去重逻辑：确保每个指纹只有一条记录，且 GitHub 身份优先
    SELECT DISTINCT ON (COALESCE(fingerprint, id::text))
        id, user_name, fingerprint, user_identity,
        l_score, p_score, d_score, e_score, f_score,
        stats, dimensions, personality,
        total_messages, total_chars, work_days,
        ip_location,
        lat AS raw_lat,
        lng AS raw_lng,
        manual_location, manual_lat, manual_lng,
        created_at, updated_at
    FROM public.user_analysis
    ORDER BY COALESCE(fingerprint, id::text), user_identity DESC, created_at DESC
),
unified AS (
    SELECT
        id, user_name, fingerprint, user_identity,
        l_score, p_score, d_score, e_score, f_score,
        stats, dimensions, personality,
        total_messages, total_chars, work_days,
        ip_location,
        COALESCE(manual_lat, raw_lat) AS lat,
        COALESCE(manual_lng, raw_lng) AS lng,
        manual_location, manual_lat, manual_lng,
        COALESCE(manual_location, ip_location) AS country_code,
        created_at, updated_at,
        ROUND((COALESCE(l_score,0)*0.25 + COALESCE(p_score,0)*0.20 + COALESCE(d_score,0)*0.25 + COALESCE(e_score,0)*0.15 + COALESCE(f_score,0)*0.15)::numeric, 2) AS vibe_index
    FROM base_data
)
SELECT
    id, user_name, fingerprint, user_identity,
    l_score, p_score, d_score, e_score, f_score,
    stats, dimensions, personality,
    total_messages, total_chars, work_days,
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

-- 步骤 2: 添加注释说明
COMMENT ON VIEW public.v_unified_analysis_v2 IS 
'统一用户分析视图 V2 - 地图与排行榜
功能：
1. 去重：DISTINCT ON (fingerprint/id)，GitHub 身份优先，再按 created_at DESC
2. 光标位置：lat/lng 对外统一为 COALESCE(manual_lat, raw_lat)、COALESCE(manual_lng, raw_lng)，手动校准与自动定位和谐相处
3. country_code：COALESCE(manual_location, ip_location)
4. vibe_index / vibe_rank / vibe_percentile 供前端排名展示';

-- 步骤 3: 创建索引（提升查询性能）
-- 注意：视图本身不能创建索引，但可以在基础表上创建索引

-- 为 user_analysis 表创建复合索引（如果不存在）
CREATE INDEX IF NOT EXISTS idx_user_analysis_unified_lookup 
ON public.user_analysis(user_name, user_identity, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_analysis_fingerprint_lookup 
ON public.user_analysis(fingerprint) 
WHERE fingerprint IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_user_analysis_github_lookup 
ON public.user_analysis(user_identity, id) 
WHERE user_identity = 'github';

-- 步骤 4: 验证视图已创建
SELECT 
    table_name,
    table_type,
    view_definition
FROM information_schema.views
WHERE table_schema = 'public' 
AND table_name = 'v_unified_analysis_v2';

-- 步骤 5: 测试查询（可选）
-- SELECT COUNT(*) as total_users FROM public.v_unified_analysis_v2;
-- SELECT * FROM public.v_unified_analysis_v2 WHERE vibe_index IS NOT NULL ORDER BY vibe_index DESC LIMIT 10;

-- ============================================
-- 使用说明：
-- 1. 在 Supabase SQL Editor 中执行此脚本
-- 2. 验证视图创建成功：SELECT * FROM v_unified_analysis_v2 LIMIT 5;
-- 3. 更新前端代码，将数据查询从 user_analysis 切换到 v_unified_analysis_v2
-- 4. 地图和排行榜的数据源应统一使用此视图
-- ============================================
