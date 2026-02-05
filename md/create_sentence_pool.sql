-- ============================================
-- 句子热度池(国家维度):存储用户多次出现的完整句子
-- V2（可迁移/可重复执行）：
-- - 引入 normalized_sentence（归一化 key）
-- - 忽略标点/空格/大小写，合并“相似但不完全相同”的句子计数
-- - 让 hit_count 更容易达到 ≥2，从而在语义爆发卡片里有内容
--
-- 兼容旧表：
-- - 若你已存在旧结构 public.sentence_pool(region, sentence, ...)，本脚本会：
--   1) ADD COLUMN normalized_sentence
--   2) 回填 normalized_sentence
--   3) 合并 (region, normalized_sentence) 重复行（sum hit_count）
--   4) 建立 UNIQUE (region, normalized_sentence) 供 upsert ON CONFLICT 使用
--
-- 背景说明:
-- - slang_trends_pool 存储关键词/短语,不适合存储完整句子
-- - 需要新表 sentence_pool 来存储用户输入的完整句子(去重后累加hit_count)
-- - 用于展示该国用户最常说的话(雷同句子TOP 10)
-- ============================================

-- ============================================
-- 归一化函数：忽略标点/空格/大小写
-- 说明：
-- - 先 lower
-- - 将各种标点替换为空格
-- - 折叠多空格并 trim
-- - 保留字母数字与中文（避免把英文词粘成一团）
-- ============================================
CREATE OR REPLACE FUNCTION public.normalize_sentence_key_v1(p_text TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    trim(
      regexp_replace(
        regexp_replace(
          lower(coalesce(p_text, '')),
          -- 标点/符号 -> 空格（包含中英文全角）
          E'[\\u0000-\\u001F\\u007F`~!@#$%^&*()\\-_=+\\[\\]{}\\\\|;:''\",.<>/?·！￥…（）—【】、；：‘’“”，。《》？]+',
          ' ',
          'g'
        ),
        E'\\s+',
        ' ',
        'g'
      )
    );
$$;

-- 先尝试按新结构创建（若旧表已存在，则不会改变旧表结构）
CREATE TABLE IF NOT EXISTS public.sentence_pool (
  region        TEXT NOT NULL,             -- 国家/地区代码(如 US, CN, Global)
  normalized_sentence TEXT NOT NULL,       -- 归一化 key（忽略标点/空格/大小写）
  sentence      TEXT NOT NULL,             -- 代表句（来自真实用户输入的某一次原文）
  hit_count     BIGINT NOT NULL DEFAULT 1, -- 重复次数（归一化后累加）
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), -- 首次出现时间
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(), -- 最后出现时间
  PRIMARY KEY (region, normalized_sentence)
);

-- 旧表迁移：补列、回填、合并重复，并建立 UNIQUE (region, normalized_sentence)
DO $$
DECLARE
  has_norm_col boolean;
  has_sentence_col boolean;
  has_region_col boolean;
  has_hit_col boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='sentence_pool' AND column_name='normalized_sentence'
  ) INTO has_norm_col;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='sentence_pool' AND column_name='sentence'
  ) INTO has_sentence_col;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='sentence_pool' AND column_name='region'
  ) INTO has_region_col;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='sentence_pool' AND column_name='hit_count'
  ) INTO has_hit_col;

  -- 若是非常旧的结构（缺 region/sentence/hit_count），直接退出
  IF NOT has_region_col OR NOT has_sentence_col OR NOT has_hit_col THEN
    RETURN;
  END IF;

  IF NOT has_norm_col THEN
    EXECUTE 'ALTER TABLE public.sentence_pool ADD COLUMN normalized_sentence TEXT';
  END IF;

  -- 回填 normalized_sentence
  EXECUTE 'UPDATE public.sentence_pool
           SET normalized_sentence = public.normalize_sentence_key_v1(sentence)
           WHERE normalized_sentence IS NULL OR normalized_sentence = ''''';

  -- 清理无法归一化的脏行
  EXECUTE 'DELETE FROM public.sentence_pool
           WHERE normalized_sentence IS NULL OR normalized_sentence = ''''';

  -- 合并重复：(region, normalized_sentence) 聚合
  -- 用临时表聚合后覆盖原表（避免 UNIQUE 创建失败）
  EXECUTE '
    CREATE TEMP TABLE _sentence_pool_agg AS
    SELECT
      region,
      normalized_sentence,
      (ARRAY_AGG(sentence ORDER BY length(sentence) ASC, last_seen_at DESC NULLS LAST))[1] AS sentence,
      SUM(COALESCE(hit_count,0))::bigint AS hit_count,
      MIN(first_seen_at) AS first_seen_at,
      MAX(last_seen_at) AS last_seen_at
    FROM public.sentence_pool
    GROUP BY region, normalized_sentence
  ';

  EXECUTE 'TRUNCATE TABLE public.sentence_pool';
  EXECUTE '
    INSERT INTO public.sentence_pool (region, normalized_sentence, sentence, hit_count, first_seen_at, last_seen_at)
    SELECT region, normalized_sentence, sentence, GREATEST(1, hit_count), COALESCE(first_seen_at, NOW()), COALESCE(last_seen_at, NOW())
    FROM _sentence_pool_agg
  ';

  -- 强制 NOT NULL（此时已回填并清理）
  BEGIN
    EXECUTE 'ALTER TABLE public.sentence_pool ALTER COLUMN normalized_sentence SET NOT NULL';
  EXCEPTION WHEN others THEN
    -- ignore
  END;

  -- 为 upsert ON CONFLICT 提供唯一约束（若主键已是 region+normalized_sentence，也不会冲突）
  BEGIN
    EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS idx_sentence_pool_region_norm_unique ON public.sentence_pool(region, normalized_sentence)';
  EXCEPTION WHEN others THEN
    -- ignore
  END;
END $$;

-- 创建索引:按地区和重复次数排序(用于快速获取TOP句子)
CREATE INDEX IF NOT EXISTS idx_sentence_pool_region_hitcount 
ON public.sentence_pool(region, hit_count DESC);

-- 创建索引:最后出现时间(用于清理过期数据)
CREATE INDEX IF NOT EXISTS idx_sentence_pool_last_seen 
ON public.sentence_pool(last_seen_at DESC);

-- 授权(允许通过REST API访问)
GRANT SELECT ON public.sentence_pool TO anon;
GRANT SELECT ON public.sentence_pool TO authenticated;

-- 添加注释
COMMENT ON TABLE public.sentence_pool IS '句子热度池(国家维度) - 存储用户多次重复的完整句子,用于语义爆发看板';
COMMENT ON COLUMN public.sentence_pool.sentence IS '完整句子内容(自动去重)';
COMMENT ON COLUMN public.sentence_pool.region IS '国家/地区代码(如US, CN, Global)';
COMMENT ON COLUMN public.sentence_pool.normalized_sentence IS '句子归一化 key（忽略标点/空格/大小写），用于合并相似句子计数';
COMMENT ON COLUMN public.sentence_pool.hit_count IS '该句子在该地区的重复次数';
COMMENT ON COLUMN public.sentence_pool.first_seen_at IS '首次出现时间';
COMMENT ON COLUMN public.sentence_pool.last_seen_at IS '最后出现时间';

-- ============================================
-- RPC函数:原子累加句子计数
-- ============================================
CREATE OR REPLACE FUNCTION public.upsert_sentence_pool_v1(
  p_sentence TEXT,
  p_region TEXT,
  p_delta BIGINT DEFAULT 1
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  delta BIGINT := GREATEST(1, COALESCE(p_delta, 1));
  reg TEXT := COALESCE(NULLIF(TRIM(p_region), ''), 'Global');
  sent TEXT := NULLIF(TRIM(p_sentence), '');
  norm TEXT := NULLIF(public.normalize_sentence_key_v1(sent), '');
BEGIN
  -- 忽略空句子或过短句子(少于3个字符)
  IF sent IS NULL OR LENGTH(sent) < 3 THEN
    RETURN;
  END IF;
  
  -- 忽略过长句子(超过500字符,避免污染)
  IF LENGTH(sent) > 500 THEN
    RETURN;
  END IF;

  IF norm IS NULL OR LENGTH(norm) < 3 THEN
    RETURN;
  END IF;

  -- 原子Upsert：以 (region, normalized_sentence) 合并相似句子
  INSERT INTO public.sentence_pool (region, normalized_sentence, sentence, hit_count, last_seen_at)
  VALUES (reg, norm, sent, delta, NOW())
  ON CONFLICT (region, normalized_sentence)
  DO UPDATE SET
    hit_count = public.sentence_pool.hit_count + delta,
    last_seen_at = NOW(),
    -- 代表句：保留更“可读”的那条（更短通常更像一句话；两者都是真实用户输入）
    sentence = CASE
      WHEN length(excluded.sentence) < length(public.sentence_pool.sentence) THEN excluded.sentence
      ELSE public.sentence_pool.sentence
    END;
END;
$$;

COMMENT ON FUNCTION public.upsert_sentence_pool_v1 IS 'RPC函数:原子累加句子计数(用于语义爆发-句子看板)';

-- ============================================
-- RPC函数:获取某地区TOP句子
-- ============================================
CREATE OR REPLACE FUNCTION public.get_top_sentences_v1(
  p_region TEXT,
  p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
  sentence TEXT,
  hit_count BIGINT,
  last_seen_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    sp.sentence,
    sp.hit_count,
    sp.last_seen_at
  FROM public.sentence_pool sp
  WHERE sp.region = COALESCE(NULLIF(TRIM(p_region), ''), 'Global')
    AND sp.hit_count >= 2
  ORDER BY sp.hit_count DESC, sp.last_seen_at DESC
  LIMIT LEAST(COALESCE(p_limit, 10), 50); -- 最多返回50条
$$;

COMMENT ON FUNCTION public.get_top_sentences_v1 IS 'RPC函数:获取某地区TOP句子(按重复次数降序)';

-- ============================================
-- 清理函数:删除过期或低频句子(定期维护)
-- ============================================
CREATE OR REPLACE FUNCTION public.cleanup_sentence_pool_v1(
  p_days_old INTEGER DEFAULT 90,      -- 超过90天未出现
  p_min_hit_count INTEGER DEFAULT 2   -- 重复次数少于2次
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM public.sentence_pool
  WHERE 
    (last_seen_at < NOW() - INTERVAL '1 day' * p_days_old)
    OR
    (hit_count < p_min_hit_count AND last_seen_at < NOW() - INTERVAL '7 days');
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

COMMENT ON FUNCTION public.cleanup_sentence_pool_v1 IS 'RPC函数:清理过期或低频句子(定期维护)';
