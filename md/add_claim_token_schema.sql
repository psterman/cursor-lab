-- ============================================
-- 添加 claim_token 和增强 user_id 字段到 user_analysis 表
-- 功能：支持影子令牌（Claim Token）机制，实现自动同步系统
-- ============================================

-- 步骤 1: 添加 claim_token 字段（UUID 类型，可为 NULL）
DO $$
BEGIN
    -- 检查 claim_token 字段是否存在
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'user_analysis' 
        AND column_name = 'claim_token'
    ) THEN
        -- 添加 claim_token 字段（UUID 类型）
        ALTER TABLE user_analysis 
        ADD COLUMN claim_token uuid DEFAULT NULL;
        
        -- 添加注释
        COMMENT ON COLUMN user_analysis.claim_token IS '临时认领令牌（影子令牌），用于将匿名记录关联到 GitHub 账号';
        
        RAISE NOTICE 'claim_token 字段已成功添加到 user_analysis 表';
    ELSE
        RAISE NOTICE 'claim_token 字段已存在，跳过添加';
    END IF;
END $$;

-- 步骤 2: 确保 user_id 字段存在（如果不存在则添加）
-- 注意：user_analysis 表的主键 id 就是 user_id（对应 auth.users.id）
-- 这里我们确保有明确的 user_id 字段用于存储 GitHub UID
DO $$
BEGIN
    -- 检查 user_id 字段是否存在（如果表结构使用 id 作为主键，则不需要单独的 user_id）
    -- 但为了兼容性，我们检查是否需要添加
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'user_analysis' 
        AND column_name = 'user_id'
    ) THEN
        -- 如果 id 字段存在且是 UUID 类型，则 user_id 可以指向 id
        -- 这里我们添加一个 user_id 字段作为 id 的别名/冗余字段
        -- 但实际上，id 字段就是 user_id，所以我们可以跳过
        RAISE NOTICE 'user_id 字段不存在，但 id 字段已作为主键（即 user_id）';
    ELSE
        RAISE NOTICE 'user_id 字段已存在';
    END IF;
END $$;

-- 步骤 3: 创建索引以优化查询性能
-- 索引 1: claim_token 索引（用于快速查找待认领的记录）
CREATE INDEX IF NOT EXISTS idx_user_analysis_claim_token 
ON user_analysis(claim_token) 
WHERE claim_token IS NOT NULL;

-- 索引 2: user_id (id) 和 fingerprint 的复合索引（如果不存在）
-- 注意：id 是主键，已有索引；fingerprint 可能已有索引
CREATE INDEX IF NOT EXISTS idx_user_analysis_fingerprint 
ON user_analysis(fingerprint) 
WHERE fingerprint IS NOT NULL;

-- 索引 3: user_identity 索引（用于快速过滤 GitHub 用户）
CREATE INDEX IF NOT EXISTS idx_user_analysis_user_identity 
ON user_analysis(user_identity) 
WHERE user_identity IS NOT NULL;

-- 索引 4: user_id 和 fingerprint 的复合索引（用于关联查询）
-- 注意：由于 id 是主键，这个索引主要用于优化 JOIN 查询
CREATE INDEX IF NOT EXISTS idx_user_analysis_id_fingerprint 
ON user_analysis(id, fingerprint) 
WHERE fingerprint IS NOT NULL;

-- 步骤 4: 验证字段和索引已创建
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'user_analysis' 
AND column_name IN ('claim_token', 'id', 'fingerprint', 'user_identity')
ORDER BY column_name;

-- 验证索引
SELECT 
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename = 'user_analysis' 
AND indexname LIKE 'idx_user_analysis%'
ORDER BY indexname;
