-- ============================================
-- v_global_stats_v6 视图定义
-- 功能：全局统计数据视图（v6版本）
-- 包含：总用户数、总分析次数、总吐槽字数、人均吐槽量、单次平均吐槽量等
-- ============================================

-- 删除旧视图（如果存在）
DROP VIEW IF EXISTS v_global_stats_v6;

-- 创建 v6 视图
CREATE OR REPLACE VIEW v_global_stats_v6 AS
SELECT 
    -- 基础统计
    COUNT(DISTINCT id) AS total_users,                    -- 总用户数（去重）
    COUNT(*) AS total_analysis,                          -- 总分析次数
    COALESCE(SUM(total_chars), 0) AS total_roast_words,  -- 总吐槽字数（使用 total_chars 字段）
    
    -- 平均值计算
    CASE 
        WHEN COUNT(DISTINCT id) > 0 
        THEN ROUND(COALESCE(SUM(total_chars), 0)::numeric / COUNT(DISTINCT id), 1)
        ELSE 0 
    END AS avg_per_user,                                 -- 人均吐槽量（总字数 / 总用户数）
    
    CASE 
        WHEN COUNT(*) > 0 
        THEN ROUND(COALESCE(SUM(total_chars), 0)::numeric / COUNT(*), 1)
        ELSE 0 
    END AS avg_per_scan,                                  -- 单次平均吐槽量（总字数 / 总分析次数）
    
    -- 维度平均值（L, P, D, E, F）
    ROUND(COALESCE(AVG(l), 50), 1) AS avg_l,             -- 逻辑力平均值
    ROUND(COALESCE(AVG(p), 50), 1) AS avg_p,             -- 耐心值平均值
    ROUND(COALESCE(AVG(d), 50), 1) AS avg_d,             -- 细腻度平均值
    ROUND(COALESCE(AVG(e), 50), 1) AS avg_e,             -- 情绪化平均值
    ROUND(COALESCE(AVG(f), 50), 1) AS avg_f,             -- 频率感平均值
    
    -- 其他统计
    COUNT(DISTINCT ip_location) AS city_count,            -- 覆盖城市数（去重地理位置）
    
    -- 系统运行天数（从最早记录到现在的天数）
    CASE 
        WHEN MIN(created_at) IS NOT NULL 
        THEN GREATEST(1, EXTRACT(DAY FROM (NOW() - MIN(created_at)))::integer)
        ELSE 1 
    END AS system_days,
    
    -- 平均字符数（total_chars 的平均值）
    ROUND(COALESCE(AVG(total_chars), 0), 2) AS avg_chars  -- 平均吐槽字数
    
FROM user_analysis;

-- 授予权限（允许通过 REST API 访问）
GRANT SELECT ON v_global_stats_v6 TO anon;
GRANT SELECT ON v_global_stats_v6 TO authenticated;

-- 添加注释
COMMENT ON VIEW v_global_stats_v6 IS '全局统计数据视图 v6 - 包含总用户数、总分析次数、总吐槽字数、人均/单次平均吐槽量、维度平均值等';
