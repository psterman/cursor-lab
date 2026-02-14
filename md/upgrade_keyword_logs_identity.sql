-- ============================================
-- keyword_logs 表升级：支持身份分类聚合（Novice/Professional/Architect）与国家维度
-- 用途：analyze 接口写入带 category + ip_location 的关键词，handleSummary 按国家+分类返回 vibe_lexicon
-- ============================================

-- 1) 新增列（若已存在则跳过）
alter table public.keyword_logs
  add column if not exists ip_location text null;

alter table public.keyword_logs
  add column if not exists hit_count integer not null default 1;

-- 2) 唯一约束：同一 (phrase, category, ip_location) 仅一行（ip_location 空用 '' 存储便于唯一）
create unique index if not exists idx_keyword_logs_phrase_category_ip
  on public.keyword_logs (phrase, category, coalesce(ip_location, ''));

-- 3) 按国家+分类查询
create index if not exists idx_keyword_logs_ip_category
  on public.keyword_logs (ip_location, category)
  where ip_location is not null and ip_location <> '';

-- 4) RPC：按 (phrase, category, ip_location) upsert，存在则 hit_count+1
-- 注意：唯一索引为 (phrase, category, coalesce(ip_location, ''))，故插入时 ip_location 空存为 null 即可
create or replace function public.upsert_keyword_log_identity(
  p_phrase text,
  p_category text,
  p_ip_location text,
  p_fingerprint text default null
)
returns void
language plpgsql
security definer
as $$
declare
  v_ip text := nullif(trim(p_ip_location), '');
begin
  insert into public.keyword_logs (phrase, category, ip_location, fingerprint, hit_count, weight)
  values (p_phrase, p_category, v_ip, nullif(trim(p_fingerprint), ''), 1, 1)
  on conflict (phrase, category, (coalesce(ip_location, '')))
  do update set
    hit_count = public.keyword_logs.hit_count + 1,
    updated_at = now(),
    fingerprint = coalesce(nullif(trim(p_fingerprint), ''), public.keyword_logs.fingerprint);
end;
$$;

-- 5) 按国家按分类聚合视图（供 handleSummary / 右抽屉词云）
create or replace view public.v_keyword_stats_by_country as
select
  ip_location as country_code,
  category,
  phrase,
  sum(hit_count) as hit_count,
  max(updated_at) as last_seen
from public.keyword_logs
where ip_location is not null and ip_location <> ''
  and created_at >= now() - interval '90 days'
  and category in ('Novice', 'Professional', 'Architect')
group by ip_location, category, phrase
having sum(hit_count) > 0
order by ip_location, category, sum(hit_count) desc;
