-- ============================================
-- 用户校准位置字段：manual_location, manual_lat, manual_lng
-- 用于地图校准后持久化用户选择的国家与坐标，refreshUserStats 优先使用
-- ============================================

ALTER TABLE public.user_analysis
  ADD COLUMN IF NOT EXISTS manual_location TEXT,
  ADD COLUMN IF NOT EXISTS manual_lat DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS manual_lng DOUBLE PRECISION;

COMMENT ON COLUMN public.user_analysis.manual_location IS '用户校准的国家/地区名称（地图校准后上报）';
COMMENT ON COLUMN public.user_analysis.manual_lat IS '用户校准纬度';
COMMENT ON COLUMN public.user_analysis.manual_lng IS '用户校准经度';
