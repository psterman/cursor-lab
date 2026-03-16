-- ============================================
-- OpenClaw / Cursor 数据隔离：添加 metadata JSONB 字段
-- 用途：分别存储 Cursor 战力报告与 OpenClaw 监视器数据
-- ============================================

ALTER TABLE public.user_analysis
  ADD COLUMN IF NOT EXISTS cursor_metadata JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS openclaw_metadata JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.user_analysis.cursor_metadata IS 'Cursor 聊天记录分析结果（V6 协议）';
COMMENT ON COLUMN public.user_analysis.openclaw_metadata IS 'OpenClaw JSONL 画像元数据';

CREATE INDEX IF NOT EXISTS idx_user_analysis_cursor_metadata_gin
  ON public.user_analysis USING gin(cursor_metadata)
  WHERE cursor_metadata IS NOT NULL AND cursor_metadata != '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_user_analysis_openclaw_metadata_gin
  ON public.user_analysis USING gin(openclaw_metadata)
  WHERE openclaw_metadata IS NOT NULL AND openclaw_metadata != '{}'::jsonb;
