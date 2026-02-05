-- ============================================
-- 添加 personality 字段到 user_analysis 表
-- 功能：存储五维语义指纹数据（detailedStats）
-- ============================================

-- 检查并添加 personality 字段（jsonb 类型）
-- 如果字段已存在，此操作不会报错（PostgreSQL 会忽略）
DO $$
BEGIN
    -- 检查字段是否存在
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'user_analysis' 
        AND column_name = 'personality'
    ) THEN
        -- 添加 personality 字段（jsonb 类型）
        ALTER TABLE user_analysis 
        ADD COLUMN personality jsonb DEFAULT NULL;
        
        -- 添加注释
        COMMENT ON COLUMN user_analysis.personality IS '人格分析详情，包含 type 和 detailedStats 数组（五维语义指纹数据）';
        
        RAISE NOTICE 'personality 字段已成功添加到 user_analysis 表';
    ELSE
        RAISE NOTICE 'personality 字段已存在，跳过添加';
    END IF;
END $$;

-- 验证字段已添加
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'user_analysis' 
AND column_name = 'personality';
