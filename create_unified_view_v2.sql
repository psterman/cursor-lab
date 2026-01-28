-- ============================================
-- 创建统一数据视图 v_unified_analysis_v2
-- 功能：去重处理、数据补全（vibe_index）、统一统计口径
-- ============================================

-- 步骤 1: 创建统一视图
-- 去重处理：如果同一个用户既有指纹记录又有 GitHub 记录，通过视图逻辑进行合并展示
-- 数据补全：为所有记录计算 vibe_index（如果缺失）
-- 统计口径统一：确保地图（Map）和排行榜（Rank）的数据来源全部切换到这个新视图

CREATE OR REPLACE VIEW public.v_unified_analysis_v2 AS
WITH user_deduplication AS (
    -- 第一步：识别每个用户的"主记录"
    -- 【修改】确保当同一个指纹存在 github 身份时，优先过滤掉旧的 fingerprint 身份记录
    -- 优先级：GitHub 用户 > 有更多数据的记录 > 创建时间更早的记录
    -- 去重策略：
    -- 1. 如果同一个指纹存在 github 身份，优先选择 github 记录，过滤掉 fingerprint 记录
    -- 2. 如果同一个指纹只有 fingerprint 身份，选择 fingerprint 记录
    -- 3. 确保不会出现两个相同的自己（一个 fingerprint，一个 github）
    SELECT DISTINCT ON (
        -- 去重键：使用 fingerprint 作为主要去重键（如果存在）
        -- 这样确保同一个指纹的 github 记录和 fingerprint 记录能被正确去重
        -- 如果 fingerprint 不存在，则使用 id（GitHub 用户的唯一标识）
        COALESCE(fingerprint, id::text)
    )
        id,
        user_name,
        fingerprint,
        user_identity,
        l_score,
        p_score,
        d_score,
        e_score,
        f_score,
        stats,
        dimensions,
        personality,
        total_messages,
        total_chars,
        work_days,
        ip_location,
        lat,
        lng,
        created_at,
        updated_at,
        -- 计算数据完整性分数（用于排序）
        -- GitHub 用户优先级最高（10000分），确保优先选择
        CASE 
            WHEN user_identity = 'github' THEN 10000  -- GitHub 用户优先级最高（提高分数确保优先）
            ELSE 0
        END + 
        COALESCE(total_messages, 0) + 
        COALESCE((stats->>'total_messages')::int, 0) +
        CASE WHEN dimensions IS NOT NULL THEN 100 ELSE 0 END +
        CASE WHEN stats IS NOT NULL THEN 50 ELSE 0 END AS completeness_score
    FROM public.user_analysis
    WHERE id IS NOT NULL
    ORDER BY 
        -- 去重键排序：使用 fingerprint（如果存在）或 id
        COALESCE(fingerprint, id::text),
        -- 优先级排序：GitHub 用户 > 数据完整性 > 创建时间
        completeness_score DESC,
        created_at ASC
),
enriched_data AS (
    SELECT 
        id,
        user_name,
        fingerprint,
        user_identity,
        l_score,
        p_score,
        d_score,
        e_score,
        f_score,
        stats,
        dimensions,
        personality,
        total_messages,
        total_chars,
        work_days,
        ip_location,
        lat,
        lng,
        created_at,
        updated_at,
        -- 【Task 3】计算 vibe_index（如果缺失）
        -- 公式：vibe_index = (L * 0.25 + P * 0.20 + D * 0.25 + E * 0.15 + F * 0.15)
        CASE 
            WHEN l_score IS NOT NULL AND p_score IS NOT NULL AND d_score IS NOT NULL 
                 AND e_score IS NOT NULL AND f_score IS NOT NULL THEN
                ROUND(
                    (COALESCE(l_score, 50) * 0.25 + 
                     COALESCE(p_score, 50) * 0.20 + 
                     COALESCE(d_score, 50) * 0.25 + 
                     COALESCE(e_score, 50) * 0.15 + 
                     COALESCE(f_score, 50) * 0.15)::numeric, 
                    2
                )
            ELSE NULL
        END AS vibe_index,
        -- 从 stats JSONB 中提取 total_messages（如果主字段为空）
        COALESCE(
            total_messages,
            (stats->>'total_messages')::int,
            (stats->>'totalMessages')::int,
            (stats->>'userMessages')::int
        ) AS effective_total_messages,
        -- 从 stats JSONB 中提取 total_chars（如果主字段为空）
        COALESCE(
            total_chars,
            (stats->>'total_chars')::int,
            (stats->>'totalChars')::int
        ) AS effective_total_chars,
        -- 从 stats JSONB 中提取 work_days（如果主字段为空）
        COALESCE(
            work_days,
            (stats->>'work_days')::int,
            (stats->>'workDays')::int,
            (stats->>'usageDays')::int
        ) AS effective_work_days
    FROM user_deduplication
)
SELECT 
    id,
    user_name,
    fingerprint,
    user_identity,
    l_score,
    p_score,
    d_score,
    e_score,
    f_score,
    vibe_index,
    stats,
    dimensions,
    personality,
    effective_total_messages AS total_messages,
    effective_total_chars AS total_chars,
    effective_work_days AS work_days,
    ip_location,
    lat,
    lng,
    created_at,
    updated_at,
    -- 计算排名相关字段（用于后续排名计算）
    CASE 
        WHEN vibe_index IS NOT NULL THEN
            (SELECT COUNT(*) + 1 
             FROM enriched_data ed2 
             WHERE ed2.vibe_index > enriched_data.vibe_index)
        ELSE NULL
    END AS vibe_rank,
    -- 计算百分比排名
    CASE 
        WHEN vibe_index IS NOT NULL THEN
            ROUND(
                (SELECT COUNT(*)::numeric 
                 FROM enriched_data ed2 
                 WHERE ed2.vibe_index <= enriched_data.vibe_index) * 100.0 / 
                NULLIF((SELECT COUNT(*) FROM enriched_data WHERE vibe_index IS NOT NULL), 0),
                2
            )
        ELSE NULL
    END AS vibe_percentile
FROM enriched_data;

-- 步骤 2: 添加注释说明
COMMENT ON VIEW public.v_unified_analysis_v2 IS 
'统一用户分析视图 V2 - 用于地图和排行榜统计
功能：
1. 去重处理：自动合并同一用户的多个记录（指纹记录 + GitHub 记录）
   - 当同一个指纹存在 github 身份时，优先过滤掉旧的 fingerprint 身份记录
   - 确保排名系统不会出现两个相同的自己
2. 数据补全：自动计算 vibe_index（五维加权综合指数）
3. 统计口径统一：统一 total_messages、total_chars、work_days 字段来源
4. 排名计算：自动计算 vibe_rank 和 vibe_percentile

使用场景：
- 地图（Map）数据展示
- 排行榜（Rank）数据展示
- 全局统计查询

注意事项：
- 视图会自动选择每个用户的"主记录"（优先级：GitHub > 数据完整性 > 创建时间）
- 去重策略：GitHub 用户使用 id 作为去重键，fingerprint 用户使用 fingerprint 作为去重键
- 当同一个指纹存在 github 身份时，优先选择 github 记录，过滤掉 fingerprint 记录
- vibe_index 计算公式：L*0.25 + P*0.20 + D*0.25 + E*0.15 + F*0.15
- 如果维度分数缺失，vibe_index 将为 NULL';

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
