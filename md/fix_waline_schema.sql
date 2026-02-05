-- 修复 Waline 评论表结构：添加缺失的字段
-- 执行此脚本以修复以下错误：
-- 1. "column pid does not exist" - 缺少父评论 ID 字段
-- 2. "column rid does not exist" - 缺少根评论 ID 字段  
-- 3. "column sticky does not exist" - 缺少置顶标记字段

-- 1. 添加 pid 字段（父评论 ID，用于回复功能）
-- 如果字段不存在则添加，如果已存在则跳过
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'wl_comment' AND column_name = 'pid'
    ) THEN
        ALTER TABLE wl_comment ADD COLUMN pid INTEGER DEFAULT NULL;
        COMMENT ON COLUMN wl_comment.pid IS '父评论 ID，用于标识回复的父评论';
        RAISE NOTICE '已添加 pid 字段';
    ELSE
        RAISE NOTICE 'pid 字段已存在，跳过';
    END IF;
END $$;

-- 2. 添加 rid 字段（根评论 ID，用于标识评论树的根节点）
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'wl_comment' AND column_name = 'rid'
    ) THEN
        ALTER TABLE wl_comment ADD COLUMN rid INTEGER DEFAULT NULL;
        COMMENT ON COLUMN wl_comment.rid IS '根评论 ID，用于标识评论树的根节点';
        RAISE NOTICE '已添加 rid 字段';
    ELSE
        RAISE NOTICE 'rid 字段已存在，跳过';
    END IF;
END $$;

-- 3. 添加 sticky 字段（置顶标记，用于标记置顶评论）
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'wl_comment' AND column_name = 'sticky'
    ) THEN
        ALTER TABLE wl_comment ADD COLUMN sticky BOOLEAN DEFAULT FALSE;
        COMMENT ON COLUMN wl_comment.sticky IS '置顶标记，TRUE 表示该评论被置顶';
        RAISE NOTICE '已添加 sticky 字段';
    ELSE
        RAISE NOTICE 'sticky 字段已存在，跳过';
    END IF;
END $$;

-- 4. 为现有评论设置默认值（如果 pid 和 rid 为 NULL，表示它们是顶级评论）
-- 对于现有的顶级评论，pid 和 rid 保持为 NULL 即可
-- sticky 默认为 FALSE，表示不置顶

-- 5. 验证字段是否添加成功
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'wl_comment' 
    AND column_name IN ('pid', 'rid', 'sticky')
ORDER BY column_name;
