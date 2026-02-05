-- ============================================
-- 甲方上身 / 赛博磕头 字段：jiafang_count, ketao_count
-- 与 worker 写入、v_unified_analysis_v2 视图一致，供 stats2 左侧抽屉展示
-- ============================================

ALTER TABLE public.user_analysis
  ADD COLUMN IF NOT EXISTS jiafang_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ketao_count INTEGER DEFAULT 0;

COMMENT ON COLUMN public.user_analysis.jiafang_count IS '甲方上身次数（「不」字等否定/命令类统计）';
COMMENT ON COLUMN public.user_analysis.ketao_count IS '赛博磕头次数（「请」「谢谢」等礼貌用语统计）';
