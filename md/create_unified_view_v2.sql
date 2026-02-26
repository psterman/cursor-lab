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
        total_messages,
        total_chars,
        -- 兼容口径：若未来区分“用户输出字符数”，可改为真实列；当前先与 total_chars 同口径
        total_chars AS total_user_chars,
        work_days,
        jiafang_count, ketao_count,
        vibe_index AS vibe_index_str,
        lpdef,
        ip_location,
        lat AS raw_lat,
        lng AS raw_lng,
        manual_location, manual_lat, manual_lng,
        created_at, updated_at,
        github_stars, github_forks, github_watchers, github_followers, github_score, github_synced_at, github_login
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
        github_stars, github_forks, github_watchers, github_followers, github_score, github_synced_at, github_login, github_stats,
        COALESCE(manual_lat, raw_lat) AS lat,
        COALESCE(manual_lng, raw_lng) AS lng,
        manual_location, manual_lat, manual_lng,
        -- 国家口径：ISO2 或全名映射（manual_location 优先 > ip_location；支持 United States/China 等全名）
        CASE
          WHEN manual_location ~ '^[A-Za-z]{2}$' THEN UPPER(manual_location)
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
          WHEN UPPER(TRIM(ip_location)) IN ('BRAZIL', 'BR') THEN 'BR'
          WHEN UPPER(TRIM(ip_location)) IN ('RUSSIAN FEDERATION', 'RUSSIA', 'RU') THEN 'RU'
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
    github_stars, github_forks, github_watchers, github_followers, github_score, github_synced_at, github_login, github_stats,
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
3. country_code：严格 ISO2（manual_location 优先，否则 ip_location；非 ISO2 则为 NULL）
4. total_user_chars / avg_user_message_length：国家累计 & 排名用（当前与 total_chars 同口径）
5. vibe_index / vibe_rank / vibe_percentile 供技术排名；jiafang_count / ketao_count 供甲方上身、赛博磕头展示';

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

-- 步骤 4: 验证视图已创建（information_schema.views 无 table_type 列）
SELECT 
    table_schema,
    table_name
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
