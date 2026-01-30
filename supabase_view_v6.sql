-- ============================================
-- v_global_stats_v6 视图定义
-- 功能：全局统计数据视图（v6版本）
-- 包含：总用户数、总分析次数、总吐槽字数、人均吐槽量、单次平均吐槽量等
-- ============================================

-- 删除旧视图（如果存在）
DROP VIEW IF EXISTS public.v_global_stats_v6;

-- 创建 v6 视图
CREATE OR REPLACE VIEW public.v_global_stats_v6 AS
WITH agg AS (
    SELECT
        -- 基础统计
        COUNT(DISTINCT ua.id) AS total_users,                   -- 总用户数（去重 count）
        COUNT(*) AS total_analysis,                             -- 总记录
        COALESCE(SUM(ua.total_chars), 0)::bigint AS total_chars_sum, -- 所有文本长度和（使用 total_chars 字段）

        -- 维度全网平均值：直接对 0-100 的维度分求平均（NULL 自动排除）
        ROUND(AVG(ua.l_score)::numeric, 1) AS avg_l,
        ROUND(AVG(ua.p_score)::numeric, 1) AS avg_p,
        ROUND(AVG(ua.d_score)::numeric, 1) AS avg_d,
        ROUND(AVG(ua.e_score)::numeric, 1) AS avg_e,
        ROUND(AVG(ua.f_score)::numeric, 1) AS avg_f,

        -- 美国大盘分片（聚合 FILTER 一次扫表得到）
        COUNT(DISTINCT ua.id) FILTER (WHERE ua.ip_location = 'United States') AS us_total_users,
        COUNT(*) FILTER (WHERE ua.ip_location = 'United States') AS us_total_analysis,
        COALESCE(SUM(ua.total_chars) FILTER (WHERE ua.ip_location = 'United States'), 0)::bigint AS us_total_chars_sum,
        ROUND((AVG(ua.l_score) FILTER (WHERE ua.ip_location = 'United States'))::numeric, 1) AS us_avg_l,
        ROUND((AVG(ua.p_score) FILTER (WHERE ua.ip_location = 'United States'))::numeric, 1) AS us_avg_p,
        ROUND((AVG(ua.d_score) FILTER (WHERE ua.ip_location = 'United States'))::numeric, 1) AS us_avg_d,
        ROUND((AVG(ua.e_score) FILTER (WHERE ua.ip_location = 'United States'))::numeric, 1) AS us_avg_e,
        ROUND((AVG(ua.f_score) FILTER (WHERE ua.ip_location = 'United States'))::numeric, 1) AS us_avg_f
    FROM public.user_analysis ua
)
SELECT
    -- 基础统计（字段名按需求精确输出：camelCase 需要引号保留大小写）
    a.total_users AS "totalUsers",
    a.total_analysis AS "totalAnalysis",
    a.total_chars_sum AS "totalCharsSum",

    -- 维度全网平均值
    a.avg_l,
    a.avg_p,
    a.avg_d,
    a.avg_e,
    a.avg_f,

    -- 最新动态：最近 10 条记录
    lr.latest_records,

    -- 美国大盘分片：ip_location = 'United States'
    jsonb_build_object(
        'totalUsers', a.us_total_users,
        'totalAnalysis', a.us_total_analysis,
        'totalCharsSum', a.us_total_chars_sum,
        'avg_l', a.us_avg_l,
        'avg_p', a.us_avg_p,
        'avg_d', a.us_avg_d,
        'avg_e', a.us_avg_e,
        'avg_f', a.us_avg_f
    ) AS us_stats
FROM agg a
CROSS JOIN LATERAL (
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'user_name', t.user_name,
                'personality_type', t.personality->>'type',
                'ip_location', t.ip_location
            )
            ORDER BY t.created_at DESC
        ),
        '[]'::jsonb
    ) AS latest_records
    FROM (
        SELECT
            ua.user_name,
            ua.personality,
            ua.ip_location,
            ua.created_at
        FROM public.user_analysis ua
        ORDER BY ua.created_at DESC NULLS LAST
        LIMIT 10
    ) t
) lr;

-- 授予权限（允许通过 REST API 访问）
GRANT SELECT ON public.v_global_stats_v6 TO anon;
GRANT SELECT ON public.v_global_stats_v6 TO authenticated;

-- 添加注释
COMMENT ON VIEW public.v_global_stats_v6 IS '全局统计数据视图 v6（高性能聚合版）- totalUsers/totalAnalysis/totalCharsSum、avg_l~avg_f、latest_records、us_stats';

-- ============================================
-- 索引建议（避免多人查询时的全表扫描热点）
-- 说明：
-- 1) 视图里的聚合本质仍需扫描统计口径范围内的数据；索引主要用于“最新 10 条”和分片过滤的快速定位。
-- 2) 如果数据量巨大且高并发，建议进一步改为“物化视图 + 定时刷新 / 触发器增量表”。
-- ============================================

-- 最新 10 条：加速 ORDER BY created_at DESC LIMIT 10
CREATE INDEX IF NOT EXISTS idx_user_analysis_created_at_desc
ON public.user_analysis (created_at DESC);

-- 常用分片过滤：ip_location
CREATE INDEX IF NOT EXISTS idx_user_analysis_ip_location
ON public.user_analysis (ip_location);

-- 美国分片：部分索引（更小、更快）
CREATE INDEX IF NOT EXISTS idx_user_analysis_us_created_at_desc
ON public.user_analysis (created_at DESC)
WHERE ip_location = 'United States';

-- 维度字段索引建议：
-- 注意：AVG(...) 不会直接利用这些索引；仅当你还有“按维度阈值筛选/排序”的查询时才有收益。
CREATE INDEX IF NOT EXISTS idx_user_analysis_dim_scores
ON public.user_analysis (l_score, p_score, d_score, e_score, f_score);
