-- 修复 "function name get_country_dimension_averages is not unique"：确保库中只存在唯一签名 (target_country_code text)
-- 先删除所有可能的重载（无参、单 text 参等），再创建唯一函数

DROP FUNCTION IF EXISTS public.get_country_dimension_averages();
DROP FUNCTION IF EXISTS public.get_country_dimension_averages(text);

CREATE OR REPLACE FUNCTION public.get_country_dimension_averages(target_country_code text)
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

COMMENT ON FUNCTION public.get_country_dimension_averages(text) IS '国家维度雷达图均值，唯一签名 target_country_code text；RPC 调用时只传此参数，避免 is not unique';
