-- ============================================
-- 灵魂词每小时汇总：表 + RPC（Worker Cron 调用）
-- 用途：Worker 从 KV 拉取 soul: 前缀 Key，按 (country, phrase) 聚合后批量 upsert
-- 唯一约束：(phrase, country)；存在则 hit_count += 新计数值，否则插入
-- ============================================

-- 1) 表：灵魂词按国家聚合 + 用户级别关联
create table if not exists public.soul_word_stats (
  phrase text not null,
  country text not null,
  hit_count bigint not null default 0,
  fingerprints jsonb, -- 存储贡献过该词的所有 fingerprint（用户级查询）
  updated_at timestamptz not null default now(),
  primary key (phrase, country)
);

comment on table public.soul_word_stats is '灵魂词按国家聚合，由 Worker 每小时从 KV 同步；fingerprints 记录贡献用户';

-- 索引：支持按 fingerprint 查询
create index if not exists idx_soul_word_stats_fingerprints on public.soul_word_stats using gin(fingerprints);

-- 2) RPC：批量 upsert，存在则 hit_count += 新值，同时合并 fingerprints
create or replace function public.upsert_soul_word_hits(p_rows jsonb)
returns void
language plpgsql
security definer
as $$
declare
  r record;
begin
  for r in
    select
      (x->>'phrase')::text as phrase,
      (x->>'country')::text as country,
      (x->>'hit_count')::bigint as hit_count,
      (x->'fingerprints')::jsonb as fingerprints
    from jsonb_array_elements(p_rows) as x
    where (x->>'phrase') is not null and (x->>'country') is not null and (x->>'hit_count') is not null
  loop
    insert into public.soul_word_stats (phrase, country, hit_count, fingerprints, updated_at)
    values (r.phrase, r.country, greatest(0, r.hit_count), r.fingerprints, now())
    on conflict (phrase, country)
    do update set
      hit_count = public.soul_word_stats.hit_count + excluded.hit_count,
      fingerprints = (
        select jsonb_agg(distinct value)
        from (
          select jsonb_array_elements(coalesce(public.soul_word_stats.fingerprints, '[]'::jsonb)) as value
          union
          select jsonb_array_elements(coalesce(excluded.fingerprints, '[]'::jsonb)) as value
        ) t
      ),
      updated_at = now();
  end loop;
end;
$$;

comment on function public.upsert_soul_word_hits(jsonb) is 'Worker 灵魂词每小时汇总：批量 upsert，phrase+country 存在则累加 hit_count';

-- 3) 用户级查询 RPC：根据 fingerprint 返回该用户的灵魂词统计
create or replace function public.get_user_soul_words(p_fingerprint text)
returns table(phrase text, country text, hit_count bigint, rank bigint)
language plpgsql
security definer
as $$
begin
  return query
  select 
    s.phrase,
    s.country,
    s.hit_count,
    row_number() over (order by s.hit_count desc) as rank
  from public.soul_word_stats s
  where s.fingerprints @> jsonb_build_array(p_fingerprint)
  order by s.hit_count desc
  limit 50;
end;
$$;

comment on function public.get_user_soul_words(text) is '按 fingerprint 查询该用户贡献的灵魂词（Top 50）';
