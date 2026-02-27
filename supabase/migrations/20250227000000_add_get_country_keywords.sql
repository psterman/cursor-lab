-- RPC: get_country_keywords
-- 供前端国家视图「黑话榜」Top10 使用，参数 target_code 为国家/地区代码（如 CN、US）
-- 返回 (tag, weight)，前端兼容 phrase/hit_count 别名
-- 若项目中暂无国家维度关键词表，可先返回空集；有数据源后在此函数内写查询逻辑即可

CREATE OR REPLACE FUNCTION get_country_keywords(target_code text)
RETURNS TABLE(tag text, weight bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- 占位：无表时返回空集，避免前端 400；有表后改为 SELECT phrase AS tag, hit_count::bigint AS weight FROM your_table WHERE country_code = target_code 等
  SELECT NULL::text, NULL::bigint WHERE false;
$$;

COMMENT ON FUNCTION get_country_keywords(text) IS '国家维度关键词/黑话榜 Top10，返回 tag+weight；前端用 target_code 调用';
