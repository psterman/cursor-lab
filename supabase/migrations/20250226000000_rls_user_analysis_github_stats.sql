-- RLS for user_analysis: GitHub 战力字段由 Worker 使用 service_role 写入（绕过 RLS）
-- 本迁移为可选：若希望前端用 authenticated 用户直接 SELECT 自己的记录，需允许读取
-- Worker 使用 SUPABASE_SERVICE_ROLE_KEY 时不受 RLS 限制
-- 若表未启用 RLS，请先在 Dashboard 执行: ALTER TABLE user_analysis ENABLE ROW LEVEL SECURITY;

-- 策略：已认证用户可读取自己的 user_analysis 行（含 github_stats）
-- 用于前端 supabase.from('user_analysis').select('github_stats,...').eq('id', userId)
DROP POLICY IF EXISTS "user_analysis_select_own" ON user_analysis;
CREATE POLICY "user_analysis_select_own"
  ON user_analysis FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

-- 策略：已认证用户可更新自己的 GitHub 相关字段（可选，当前由 Worker 负责更新）
-- 若仅由 Worker 写入，可注释掉此策略
DROP POLICY IF EXISTS "user_analysis_update_own_github" ON user_analysis;
CREATE POLICY "user_analysis_update_own_github"
  ON user_analysis FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

COMMENT ON POLICY "user_analysis_select_own" ON user_analysis IS 'Authenticated user can read own row for left drawer github_stats';
COMMENT ON POLICY "user_analysis_update_own_github" ON user_analysis IS 'Authenticated user can update own row; Worker uses service_role to bypass RLS';
