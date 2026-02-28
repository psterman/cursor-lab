-- RPC: get_country_dimension_averages
-- 供前端国家视图右侧抽屉雷达图使用，参数 target_country_code 为国家/地区代码（如 CN、US）
-- 返回指标平均值的 JSON（表行：has_valid_data, avg_l, avg_p, avg_d, avg_e, avg_f）；无数据时返回 has_valid_data=false 供前端走 country-summary 兜底

-- 修改参数名或返回结构时需先删除旧函数，否则 42P13
DROP FUNCTION IF EXISTS get_country_dimension_averages(text);

CREATE OR REPLACE FUNCTION get_country_dimension_averages(target_country_code text)
RETURNS TABLE(
  has_valid_data boolean,
  avg_l numeric,
  avg_p numeric,
  avg_d numeric,
  avg_e numeric,
  avg_f numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- 有表后改为基于 user_analysis 等聚合
  SELECT 
    COUNT(*) > 0 AS has_valid_data,
    COALESCE(AVG(l_score), 50.0)::numeric AS avg_l,
    COALESCE(AVG(p_score), 50.0)::numeric AS avg_p,
    COALESCE(AVG(d_score), 50.0)::numeric AS avg_d,
    COALESCE(AVG(e_score), 50.0)::numeric AS avg_e,
    COALESCE(AVG(f_score), 50.0)::numeric AS avg_f
  FROM user_analysis
  WHERE country_code = target_country_code
     OR ip_location = target_country_code
     OR manual_location = target_country_code
     OR current_location = target_country_code
  LIMIT 1;
$$;

COMMENT ON FUNCTION get_country_dimension_averages(text) IS '国家维度雷达图均值；前端用 target_country_code 调用，返回指标平均值（表行即 JSON 数组元素），无数据时 has_valid_data=false 走 country-summary 兜底';
