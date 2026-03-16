-- ============================================
-- OpenClaw 个人数据监视器：扩展 user_analysis 表
-- 用途：支撑 stats2 左侧抽屉监视器、全球/国别统计
-- ============================================

ALTER TABLE public.user_analysis
  ADD COLUMN IF NOT EXISTS total_tokens BIGINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS primary_model TEXT,
  ADD COLUMN IF NOT EXISTS skills_tags JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ;

COMMENT ON COLUMN public.user_analysis.total_tokens IS 'OpenClaw 总 Token 消耗（来自 openclaw_stats 或本地解析）';
COMMENT ON COLUMN public.user_analysis.primary_model IS '对话频率最高的 AI 模型 ID';
COMMENT ON COLUMN public.user_analysis.skills_tags IS '从对话中提取的关键词标签（JSONB 数组）';
COMMENT ON COLUMN public.user_analysis.last_active_at IS '最后活跃时间（由 Worker 或前端更新）';
