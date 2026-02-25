-- ============================================
-- GitHub 综合战力天梯榜：扩展 user_analysis 表与 RLS
-- 功能：新增 GitHub 五维统计字段，仅 Service Role 可写入，任何人可读
-- ============================================

-- 1) 扩展 user_analysis 表：GitHub 统计字段
ALTER TABLE public.user_analysis
  ADD COLUMN IF NOT EXISTS github_stars INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS github_forks INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS github_watchers INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS github_followers INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS github_score INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS github_synced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS github_login TEXT;

COMMENT ON COLUMN public.user_analysis.github_stars IS 'GitHub 原创仓库 Star 总数（ownerAffiliations: OWNER）';
COMMENT ON COLUMN public.user_analysis.github_forks IS 'GitHub 原创仓库 Fork 总数';
COMMENT ON COLUMN public.user_analysis.github_watchers IS 'GitHub 原创仓库 Watch 总数';
COMMENT ON COLUMN public.user_analysis.github_followers IS 'GitHub 粉丝数';
COMMENT ON COLUMN public.user_analysis.github_score IS '综合得分 = Star×10 + Fork×5 + Watch×2 + Follower×1';
COMMENT ON COLUMN public.user_analysis.github_synced_at IS '最近一次 GitHub 数据同步时间（用于 24h 冷却）';
COMMENT ON COLUMN public.user_analysis.github_login IS 'GitHub 登录名，用于排行榜展示与头像';

-- 2) 天梯榜查询索引
CREATE INDEX IF NOT EXISTS idx_user_analysis_github_score
  ON public.user_analysis (github_score DESC NULLS LAST)
  WHERE github_score > 0 AND github_login IS NOT NULL;

-- 3) 确保 RLS 已启用
ALTER TABLE public.user_analysis ENABLE ROW LEVEL SECURITY;

-- 4) 允许所有人读取（若已有 SELECT 策略可跳过或合并）
DROP POLICY IF EXISTS "Allow public read github stats" ON public.user_analysis;
CREATE POLICY "Allow public read github stats"
  ON public.user_analysis FOR SELECT
  USING (true);

-- 5) 禁止前端修改 GitHub 统计字段：仅 Service Role 可写
-- 通过触发器实现：非 service_role 若修改 github_* 列则报错
CREATE OR REPLACE FUNCTION public.check_github_stats_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  jwt_role text;
BEGIN
  jwt_role := current_setting('request.jwt.claims', true)::json->>'role';
  IF jwt_role = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF (OLD.github_stars IS DISTINCT FROM NEW.github_stars)
     OR (OLD.github_forks IS DISTINCT FROM NEW.github_forks)
     OR (OLD.github_watchers IS DISTINCT FROM NEW.github_watchers)
     OR (OLD.github_followers IS DISTINCT FROM NEW.github_followers)
     OR (OLD.github_score IS DISTINCT FROM NEW.github_score)
     OR (OLD.github_synced_at IS DISTINCT FROM NEW.github_synced_at)
     OR (OLD.github_login IS DISTINCT FROM NEW.github_login) THEN
    RAISE EXCEPTION 'Only service_role can update GitHub stats fields.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_github_stats_update ON public.user_analysis;
CREATE TRIGGER trg_check_github_stats_update
  BEFORE UPDATE ON public.user_analysis
  FOR EACH ROW
  EXECUTE PROCEDURE public.check_github_stats_update();

-- ============================================
-- 6) RPC：天梯榜排名查询
-- 调用：POST /rest/v1/rpc/get_github_leaderboard
-- body: { "limit_count": 50 }
-- ============================================
CREATE OR REPLACE FUNCTION public.get_github_leaderboard(limit_count INT DEFAULT 50)
RETURNS TABLE(
  rank BIGINT,
  id UUID,
  github_login TEXT,
  user_name TEXT,
  github_score INTEGER,
  github_stars INTEGER,
  github_forks INTEGER,
  github_watchers INTEGER,
  github_followers INTEGER,
  avatar_url TEXT
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    RANK() OVER (ORDER BY u.github_score DESC NULLS LAST, u.id) AS rank,
    u.id,
    u.github_login,
    u.user_name,
    u.github_score,
    u.github_stars,
    u.github_forks,
    u.github_watchers,
    u.github_followers,
    'https://github.com/' || u.github_login || '.png' AS avatar_url
  FROM public.user_analysis u
  WHERE u.github_score > 0 AND u.github_login IS NOT NULL
  ORDER BY u.github_score DESC NULLS LAST, u.id
  LIMIT limit_count;
$$;

COMMENT ON FUNCTION public.get_github_leaderboard(INT) IS
  'GitHub 战力天梯榜：按 github_score 降序返回前 limit_count 名，含 rank/id/github_login/user_name/五维数据/avatar_url';

-- ============================================
-- 验证（可选）
-- ============================================
-- SELECT * FROM public.get_github_leaderboard(10);
