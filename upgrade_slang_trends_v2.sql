-- ============================================
-- slang_trends v2：支持分类(category) + 加权(delta)
-- 目标：
-- - slang / merit / sv_slang 三类词组分别统计
-- - (phrase, region, category, time_bucket) 唯一
-- - Worker 可按种子词典对命中词进行 +10，否则 +1
-- ============================================

-- 1) 增加 category 列（默认 slang）
alter table if exists public.slang_trends
  add column if not exists category text not null default 'slang';

-- 2) 调整主键为四元组（phrase, region, category, time_bucket）
-- 注意：如果已有主键为 (phrase, region, time_bucket)，需要先 drop 再 add
alter table if exists public.slang_trends
  drop constraint if exists slang_trends_pkey;

alter table if exists public.slang_trends
  add primary key (phrase, region, category, time_bucket);

-- 3) 加权 upsert RPC（推荐 Worker 使用）
create or replace function public.upsert_slang_hits_v2(
  p_phrase text,
  p_region text,
  p_category text,
  p_delta integer default 1
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  bucket date := date_trunc('month', CURRENT_DATE)::date;
  delta integer := greatest(1, coalesce(p_delta, 1));
  cat text := coalesce(nullif(trim(p_category), ''), 'slang');
  reg text := coalesce(nullif(trim(p_region), ''), 'Global');
  phr text := nullif(trim(p_phrase), '');
begin
  if phr is null then
    return;
  end if;

  insert into public.slang_trends (phrase, region, category, time_bucket, hit_count)
  values (phr, reg, cat, bucket, delta)
  on conflict (phrase, region, category, time_bucket)
  do update set hit_count = public.slang_trends.hit_count + delta;
end;
$$;

-- 4) 兼容旧 RPC：仍可用，但内部转到 v2（category=slang, delta=1）
create or replace function public.upsert_slang_hits(
  p_phrase text,
  p_region text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.upsert_slang_hits_v2(p_phrase, p_region, 'slang', 1);
end;
$$;

