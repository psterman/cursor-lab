-- ============================================
-- 迁移用户系统：从浏览器指纹识别转向 GitHub OAuth 身份认证同步
-- 功能：当 auth.users 表有新用户插入时，自动在 public.user_analysis 中创建记录
-- ============================================

-- 步骤 1: 创建函数 handle_new_user_sync()
-- 功能：当 auth.users 表有新用户插入时，自动在 public.user_analysis 中插入一行
CREATE OR REPLACE FUNCTION public.handle_new_user_sync()
RETURNS TRIGGER AS $$
DECLARE
    github_username TEXT;
    github_full_name TEXT;
    final_user_name TEXT;
BEGIN
    -- 从 user_metadata 中提取 GitHub 信息
    -- 优先使用 full_name，如果没有则使用 user_name
    github_full_name := NEW.raw_user_meta_data->>'full_name';
    github_username := NEW.raw_user_meta_data->>'user_name';
    
    -- 如果都没有，尝试从 provider 元数据中获取
    IF github_full_name IS NULL AND github_username IS NULL THEN
        github_full_name := NEW.raw_user_meta_data->>'name';
        github_username := NEW.raw_user_meta_data->>'preferred_username';
    END IF;
    
    -- 如果还是没有，使用 email 的前缀部分
    IF github_full_name IS NULL AND github_username IS NULL THEN
        IF NEW.email IS NOT NULL THEN
            github_username := split_part(NEW.email, '@', 1);
        END IF;
    END IF;
    
    -- 确定最终使用的 user_name
    IF github_full_name IS NOT NULL AND github_full_name != '' THEN
        final_user_name := github_full_name;
    ELSIF github_username IS NOT NULL AND github_username != '' THEN
        final_user_name := github_username;
    ELSE
        -- 如果都没有，使用 email 前缀或默认值
        final_user_name := COALESCE(split_part(NEW.email, '@', 1), 'github_user_' || substr(NEW.id::text, 1, 8));
    END IF;
    
    -- 转换为小写（与现有逻辑保持一致）
    final_user_name := lower(trim(final_user_name));
    
    -- 检查 user_analysis 表中是否已存在该 ID 的记录
    -- 如果已存在，则跳过插入（避免重复）
    IF EXISTS (SELECT 1 FROM public.user_analysis WHERE id = NEW.id) THEN
        RAISE NOTICE '用户 % 已存在于 user_analysis 表中，跳过自动创建', NEW.id;
        RETURN NEW;
    END IF;
    
    -- 插入新记录到 public.user_analysis 表
    -- 【修改】在执行 INSERT 创建 GitHub 新用户时（AUTO_REPORT 阶段），默认将 total_messages 设为 0
    -- 以便前端能通过 refreshUserStats 正确判断同步状态
    INSERT INTO public.user_analysis (
        id,
        user_name,
        user_identity,
        l_score,
        p_score,
        d_score,
        e_score,
        f_score,
        total_messages,
        created_at,
        updated_at
    ) VALUES (
        NEW.id,                    -- 使用 auth.users 的 id
        final_user_name,           -- 使用 GitHub 元数据中的 full_name 或 user_name
        'github',                  -- 设置 user_identity 为 'github'
        50,                        -- 默认 l_score = 50
        50,                        -- 默认 p_score = 50
        50,                        -- 默认 d_score = 50
        50,                        -- 默认 e_score = 50
        50,                        -- 默认 f_score = 50
        0,                         -- 默认 total_messages = 0（确保前端能正确判断同步状态）
        NOW(),                     -- created_at
        NOW()                      -- updated_at
    );
    
    RAISE NOTICE '已为新用户 % (user_name: %) 创建 user_analysis 记录', NEW.id, final_user_name;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 步骤 2: 创建触发器 on_auth_user_created
-- 功能：当 auth.users 表有新用户插入时，自动调用 handle_new_user_sync() 函数
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user_sync();

-- 步骤 3: 验证触发器已创建
SELECT 
    trigger_name,
    event_manipulation,
    event_object_table,
    action_statement,
    action_timing
FROM information_schema.triggers
WHERE trigger_name = 'on_auth_user_created';

-- 步骤 4: 验证函数已创建
SELECT 
    routine_name,
    routine_type,
    data_type
FROM information_schema.routines
WHERE routine_name = 'handle_new_user_sync'
AND routine_schema = 'public';

-- ============================================
-- 注意事项：
-- 1. 此函数使用 SECURITY DEFINER，确保有权限插入到 public.user_analysis 表
-- 2. 如果 user_analysis 表中已存在该 ID 的记录，将跳过插入（避免重复）
-- 3. user_name 优先使用 full_name，如果没有则使用 user_name，最后使用 email 前缀
-- 4. 所有维度分数（l_score 到 f_score）默认初始化为 50
-- 5. user_identity 设置为 'github' 以标识这是通过 GitHub OAuth 创建的用户
-- ============================================
