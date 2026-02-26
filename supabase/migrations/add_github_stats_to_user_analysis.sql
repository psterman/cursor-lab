-- GitHub Combat Stats 同步：扩展 user_analysis 表
-- 在 Supabase Dashboard → SQL Editor 中执行此脚本

-- 添加 github_stats (JSONB) 和 last_sync_at (TIMESTAMPTZ)
ALTER TABLE user_analysis
ADD COLUMN IF NOT EXISTS github_stats JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMPTZ;

-- 索引：按 last_sync_at 查询（冷却检查）
CREATE INDEX IF NOT EXISTS idx_user_analysis_last_sync_at
ON user_analysis(last_sync_at)
WHERE last_sync_at IS NOT NULL;

-- 索引：按 user_name 查询（GitHub login 对应）
CREATE INDEX IF NOT EXISTS idx_user_analysis_user_name
ON user_analysis(user_name);

-- 注释（可选）
COMMENT ON COLUMN user_analysis.github_stats IS 'GitHub Combat 22 项指标扁平化 JSON，由 syncGithubCombatStats 写入';
COMMENT ON COLUMN user_analysis.last_sync_at IS 'GitHub 数据最后同步时间，用于 8 小时刷新冷却';
