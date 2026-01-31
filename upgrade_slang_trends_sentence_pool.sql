-- ============================================
-- 句式热度池（国家维度）：原子累加 + 唯一约束
--
-- 背景说明：
-- - 现有 slang_trends 设计为“按月桶(time_bucket)”统计，并且 v2 还引入了 category，
--   因此全表层面无法直接建立 (region, phrase) 的唯一索引（会与跨月份/跨分类的历史记录冲突）。
--
-- 若你的目标是“热度池”（不分月、按国家累加），推荐新增一张池表 slang_trends_pool，
-- 并以 (region, phrase) 作为主键/唯一约束，实现你要的原子累加语义。
-- ============================================

create table if not exists public.slang_trends_pool (
  phrase      text not null,
  region      text not null,
  category    text not null default 'slang',
  hit_count   bigint not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (region, phrase)
);

-- 更新时间戳触发器（复用已存在的 _touch_updated_at）
do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'trg_slang_trends_pool_touch'
  ) then
    create trigger trg_slang_trends_pool_touch
    before update on public.slang_trends_pool
    for each row
    execute function public._touch_updated_at();
  end if;
end;
$$;

-- 原子累加 RPC（服务端使用 service key 调用，建议 security definer）
create or replace function public.upsert_slang_pool_hits_v1(
  p_phrase text,
  p_region text,
  p_category text,
  p_delta bigint default 1
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  delta bigint := greatest(1, coalesce(p_delta, 1));
  cat text := coalesce(nullif(trim(p_category), ''), 'slang');
  reg text := coalesce(nullif(trim(p_region), ''), 'Global');
  phr text := nullif(trim(p_phrase), '');
begin
  if phr is null then
    return;
  end if;

  insert into public.slang_trends_pool (region, phrase, category, hit_count)
  values (reg, phr, cat, delta)
  on conflict (region, phrase)
  do update set
    hit_count = public.slang_trends_pool.hit_count + delta,
    category = excluded.category;
end;
$$;

-- 允许前端经由 Worker（anon/authenticated）调用 RPC
-- 注意：如果你仅允许 service_role 调用，也可以不授予；但那要求 Worker 必须使用 service_role key。
grant execute on function public.upsert_slang_pool_hits_v1(text, text, text, bigint) to anon;
grant execute on function public.upsert_slang_pool_hits_v1(text, text, text, bigint) to authenticated;

-- 国家特色筛选：获取某批 phrase 的“全球总频次”（跨所有 region 聚合）
create or replace function public.get_slang_pool_global_counts_v1(
  p_phrases text[]
)
returns table (
  phrase text,
  global_count bigint
)
language sql
security definer
set search_path = public
as $$
  select
    stp.phrase as phrase,
    sum(stp.hit_count)::bigint as global_count
  from public.slang_trends_pool stp
  where stp.phrase = any(p_phrases)
  group by stp.phrase;
$$;

