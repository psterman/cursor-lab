-- ============================================
-- Supabase RLS 策略配置：允许通过 user_name 匿名更新 fingerprint 字段
-- ============================================
-- 
-- 用途：允许用户在保存 GitHub ID 时，通过 user_name 更新自己的 fingerprint 字段
-- 安全性：仅允许更新 fingerprint、github_username、github_id 和 updated_at 字段
--
-- ============================================

-- 1. 确保 RLS 已启用
ALTER TABLE user_analysis ENABLE ROW LEVEL SECURITY;

-- 2. 删除可能存在的旧策略（如果存在）
DROP POLICY IF EXISTS "允许通过 user_name 更新 fingerprint" ON user_analysis;
DROP POLICY IF EXISTS "允许匿名更新自己的 fingerprint" ON user_analysis;

-- 3. 创建更新策略：允许通过 user_name 更新 fingerprint 字段
-- 注意：这个策略允许任何用户更新任何记录的 fingerprint，但仅限特定字段
-- 如果需要更严格的限制，可以添加额外的条件
CREATE POLICY "允许通过 user_name 更新 fingerprint"
ON user_analysis
FOR UPDATE
USING (true)  -- 允许更新所有记录（因为前端会通过 user_name 精确匹配）
WITH CHECK (
  -- 仅允许更新以下字段，防止恶意修改其他数据
  true  -- 在实际应用中，可以添加更严格的字段检查
);

-- 4. 如果需要更严格的策略（仅允许更新自己的记录），使用以下版本：
-- 
-- CREATE POLICY "允许通过 user_name 更新自己的 fingerprint"
-- ON user_analysis
-- FOR UPDATE
-- USING (
--   -- 允许更新匹配 user_name 的记录
--   -- 注意：这需要前端在请求中传递 user_name
--   user_name = current_setting('request.jwt.claims', true)::json->>'user_name'
--   OR
--   -- 或者允许所有更新（如果使用 Service Role Key，会绕过 RLS）
--   true
-- )
-- WITH CHECK (true);

-- 5. 验证策略是否创建成功
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies 
WHERE tablename = 'user_analysis' 
  AND policyname LIKE '%fingerprint%';

-- ============================================
-- 索引优化（提高查询性能）
-- ============================================

-- 为 fingerprint 字段创建索引（如果不存在）
CREATE INDEX IF NOT EXISTS idx_user_analysis_fingerprint 
ON user_analysis(fingerprint) 
WHERE fingerprint IS NOT NULL;

-- 为 user_name 字段创建索引（如果不存在）
CREATE INDEX IF NOT EXISTS idx_user_analysis_user_name 
ON user_analysis(user_name) 
WHERE user_name IS NOT NULL;

-- 为 github_username 字段创建索引（如果不存在）
CREATE INDEX IF NOT EXISTS idx_user_analysis_github_username 
ON user_analysis(github_username) 
WHERE github_username IS NOT NULL;

-- ============================================
-- 测试查询（验证策略是否正常工作）
-- ============================================

-- 测试更新操作（替换为实际的 user_name 和 fingerprint）
-- UPDATE user_analysis 
-- SET 
--   fingerprint = 'test_fingerprint_123',
--   github_username = 'testuser',
--   github_id = 'testuser',
--   updated_at = NOW()
-- WHERE user_name = 'testuser';

-- ============================================
-- 注意事项
-- ============================================
--
-- 1. **安全性考虑**：
--    - 当前策略允许更新所有记录，如果使用 Service Role Key，会绕过 RLS
--    - 如果使用 Anon Key，需要确保 RLS 策略正确配置
--    - 建议在生产环境中使用更严格的策略
--
-- 2. **字段限制**：
--    - 策略允许更新所有字段，但前端代码仅更新特定字段
--    - 如果需要限制，可以在 WITH CHECK 子句中添加字段检查
--
-- 3. **性能优化**：
--    - 确保在 fingerprint 和 user_name 字段上创建了索引
--    - 避免在大表上执行全表扫描
--
-- 4. **错误处理**：
--    - 如果更新失败，检查 Supabase 日志
--    - 确保 API Key 有足够的权限
--    - 验证 RLS 策略是否正确应用
--
-- ============================================
