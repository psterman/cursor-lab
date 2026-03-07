-- ============================================
-- 国家级词云聚合表 country_vibe_stats
-- 用于 verify-location 原子累加与 country-hot-list Lift 算法
-- ============================================

create table if not exists public.country_vibe_stats (
  country_code text not null primary key,
  merit_jsonb  jsonb not null default '{}',
  slang_jsonb  jsonb not null default '{}',
  native_jsonb jsonb not null default '{}',
  updated_at   timestamptz not null default now()
);

comment on table public.country_vibe_stats is '国家级词云聚合：merit/slang/native 词频 JSONB';

-- 更新时间戳（若无 _touch_updated_at 则创建并挂触发器）
do $trigger_setup$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on p.pronamespace = n.oid where n.nspname = 'public' and p.proname = '_touch_updated_at') then
    if not exists (select 1 from pg_trigger where tgname = 'trg_country_vibe_stats_touch') then
      create trigger trg_country_vibe_stats_touch
        before update on public.country_vibe_stats
        for each row
        execute function public._touch_updated_at();
    end if;
  else
    create or replace function public._touch_updated_at()
    returns trigger language plpgsql as $func$
    begin
      new.updated_at = now();
      return new;
    end;
    $func$;
    if not exists (select 1 from pg_trigger where tgname = 'trg_country_vibe_stats_touch') then
      create trigger trg_country_vibe_stats_touch
        before update on public.country_vibe_stats
        for each row
        execute function public._touch_updated_at();
    end if;
  end if;
end;
$trigger_setup$;

-- 辅助：合并两个 jsonb，同 key 相加，delta 值乘 weight
create or replace function public._merge_jsonb_add(orig jsonb, delta jsonb, w float)
returns jsonb
language sql
immutable
as $$
  select coalesce(
    (select jsonb_object_agg(k, (greatest(0, (coalesce((orig ->> k)::numeric, 0) + coalesce((delta ->> k)::numeric, 0) * w))::bigint))
     from (select distinct key as k from jsonb_each(orig) union select key from jsonb_each(delta)) keys
     where nullif(trim(k), '') is not null),
    '{}'
  );
$$;

-- 原子累加：先插入再 FOR UPDATE 锁定行，合并三列后 UPDATE
create or replace function public.increment_country_vibe_stats(
  p_country_code text,
  p_merit       jsonb default '{}',
  p_slang       jsonb default '{}',
  p_native      jsonb default '{}',
  p_weight      float default 1.0
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  cc text := nullif(trim(upper(p_country_code)), '');
  w  float := greatest(0, least(1, coalesce(p_weight, 1)));
  nm jsonb := coalesce(p_merit, '{}');
  ns jsonb := coalesce(p_slang, '{}');
  nn jsonb := coalesce(p_native, '{}');
  row record;
  new_merit  jsonb;
  new_slang  jsonb;
  new_native jsonb;
begin
  if cc is null or length(cc) < 2 then
    return;
  end if;

  insert into public.country_vibe_stats (country_code, merit_jsonb, slang_jsonb, native_jsonb, updated_at)
  values (cc, '{}', '{}', '{}', now())
  on conflict (country_code) do nothing;

  select merit_jsonb, slang_jsonb, native_jsonb into row
  from public.country_vibe_stats where country_code = cc for update;

  new_merit  := public._merge_jsonb_add(coalesce(row.merit_jsonb, '{}'), nm, w);
  new_slang  := public._merge_jsonb_add(coalesce(row.slang_jsonb, '{}'), ns, w);
  new_native := public._merge_jsonb_add(coalesce(row.native_jsonb, '{}'), nn, w);

  update public.country_vibe_stats
  set merit_jsonb = new_merit, slang_jsonb = new_slang, native_jsonb = new_native, updated_at = now()
  where country_code = cc;
end;
$$;

comment on function public.increment_country_vibe_stats(text, jsonb, jsonb, jsonb, float) is '国家级词云原子累加，p_weight 用于 VPN 降权';

-- 全局聚合：各词在全球的平均频率（按国家数平均），用于 Lift 分母
create or replace function public.get_country_vibe_stats_global_sum()
returns table (
  word      text,
  total     bigint,
  countries bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with all_words as (
    select country_code, key as word, (value #>> '{}')::bigint as cnt from country_vibe_stats, lateral jsonb_each(merit_jsonb)
    union all
    select country_code, key, (value #>> '{}')::bigint from country_vibe_stats, lateral jsonb_each(slang_jsonb)
    union all
    select country_code, key, (value #>> '{}')::bigint from country_vibe_stats, lateral jsonb_each(native_jsonb)
  ),
  summed as (
    select word, sum(cnt)::bigint as total, count(distinct country_code)::bigint as countries
    from all_words
    where nullif(trim(word), '') is not null and cnt > 0
    group by word
  )
  select word, total, countries from summed;
$$;

comment on function public.get_country_vibe_stats_global_sum() is '全球词频汇总，供 Lift 算法分母';

grant execute on function public.increment_country_vibe_stats(text, jsonb, jsonb, jsonb, float) to anon;
grant execute on function public.increment_country_vibe_stats(text, jsonb, jsonb, jsonb, float) to authenticated;
grant execute on function public.get_country_vibe_stats_global_sum() to anon;
grant execute on function public.get_country_vibe_stats_global_sum() to authenticated;
