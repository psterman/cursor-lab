-- ============================================
-- OpenClaw JSONL analytics storage
-- - schema: user_analysis
-- - table : openclaw_stats
-- - purpose: persist parser outputs for stats2 binding, GitHub user card, country rollups
-- ============================================

create extension if not exists pgcrypto;
create schema if not exists user_analysis;

create table if not exists user_analysis.openclaw_stats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,

  source_type text not null default 'openclaw_jsonl',
  source_file_name text,
  source_file_hash text,
  stats_version text not null default 'v1',

  records_total integer not null default 0,
  events_with_exit_code integer not null default 0,

  -- usage / model
  model_usage jsonb not null default '{}'::jsonb,
  top_model_id text,
  model_count integer not null default 0,
  prompt_tokens bigint not null default 0,
  completion_tokens bigint not null default 0,
  total_tokens bigint not null default 0,
  cached_tokens bigint not null default 0,
  total_cost_usd numeric(18,6) not null default 0,

  -- skills / tools
  skills_stats jsonb not null default '{}'::jsonb,
  skills_snapshot jsonb not null default '[]'::jsonb,
  skills_tree jsonb not null default '{}'::jsonb,
  tool_usage jsonb not null default '{}'::jsonb,
  tool_calls_total integer not null default 0,
  tool_success_count integer not null default 0,
  tool_failure_count integer not null default 0,

  -- reliability
  success_count integer not null default 0,
  failure_count integer not null default 0,
  success_rate numeric(6,4) not null default 0,
  error_count integer not null default 0,
  abnormal_interrupt_count integer not null default 0,
  abnormal_interrupt_rate numeric(6,4) not null default 0,

  -- cache
  cache_requests integer not null default 0,
  cache_hits integer not null default 0,
  cache_hit_rate numeric(6,4) not null default 0,
  cache_hit_token_rate numeric(6,4) not null default 0,

  -- activity / workspace
  cwd_usage jsonb not null default '{}'::jsonb,
  primary_cwd text,
  hourly_heatmap jsonb not null default '[]'::jsonb,
  daily_activity jsonb not null default '{}'::jsonb,
  first_event_at timestamptz,
  last_event_at timestamptz,

  -- stats2 binding fields
  country_code text,
  github_login text,
  github_card jsonb not null default '{}'::jsonb,
  stats2_bindings jsonb not null default '{}'::jsonb,

  -- debug / trace
  raw_summary jsonb not null default '{}'::jsonb,
  analyzed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint openclaw_stats_user_fk
    foreign key (user_id) references public.user_analysis(id) on delete cascade,

  constraint openclaw_stats_success_rate_chk
    check (success_rate >= 0 and success_rate <= 1),
  constraint openclaw_stats_interrupt_rate_chk
    check (abnormal_interrupt_rate >= 0 and abnormal_interrupt_rate <= 1),
  constraint openclaw_stats_cache_rate_chk
    check (cache_hit_rate >= 0 and cache_hit_rate <= 1),
  constraint openclaw_stats_cache_token_rate_chk
    check (cache_hit_token_rate >= 0 and cache_hit_token_rate <= 1)
);

comment on table user_analysis.openclaw_stats is 'OpenClaw JSONL 聚合统计快照（供 stats2 / GitHub 卡片 / 国家统计使用）';
comment on column user_analysis.openclaw_stats.user_id is '关联 public.user_analysis.id';
comment on column user_analysis.openclaw_stats.model_usage is '模型使用频次 JSONB（modelId -> count）';
comment on column user_analysis.openclaw_stats.skills_tree is 'skillsSnapshot + tool_calls 构建的技能树 JSONB';
comment on column user_analysis.openclaw_stats.hourly_heatmap is '24h 活跃热力分布（JSON 数组）';
comment on column user_analysis.openclaw_stats.github_card is '预留：stats2 GitHub 用户卡片数据';

create index if not exists idx_openclaw_stats_user_id
  on user_analysis.openclaw_stats(user_id);

create index if not exists idx_openclaw_stats_user_analyzed_at
  on user_analysis.openclaw_stats(user_id, analyzed_at desc);

create index if not exists idx_openclaw_stats_country_code
  on user_analysis.openclaw_stats(country_code)
  where country_code is not null;

create index if not exists idx_openclaw_stats_github_login
  on user_analysis.openclaw_stats(github_login)
  where github_login is not null;

create unique index if not exists idx_openclaw_stats_user_file_hash
  on user_analysis.openclaw_stats(user_id, source_file_hash)
  where source_file_hash is not null;

create index if not exists idx_openclaw_stats_model_usage_gin
  on user_analysis.openclaw_stats using gin(model_usage);

create index if not exists idx_openclaw_stats_tool_usage_gin
  on user_analysis.openclaw_stats using gin(tool_usage);

create index if not exists idx_openclaw_stats_skills_stats_gin
  on user_analysis.openclaw_stats using gin(skills_stats);

create or replace function user_analysis._touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_openclaw_stats_touch on user_analysis.openclaw_stats;
create trigger trg_openclaw_stats_touch
before update on user_analysis.openclaw_stats
for each row
execute function user_analysis._touch_updated_at();

alter table user_analysis.openclaw_stats enable row level security;

drop policy if exists "openclaw_stats_select_own" on user_analysis.openclaw_stats;
create policy "openclaw_stats_select_own"
  on user_analysis.openclaw_stats
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "openclaw_stats_insert_own" on user_analysis.openclaw_stats;
create policy "openclaw_stats_insert_own"
  on user_analysis.openclaw_stats
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "openclaw_stats_update_own" on user_analysis.openclaw_stats;
create policy "openclaw_stats_update_own"
  on user_analysis.openclaw_stats
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- allow anon role to read rows through public views (country rollups / public cards)
drop policy if exists "openclaw_stats_select_public" on user_analysis.openclaw_stats;
create policy "openclaw_stats_select_public"
  on user_analysis.openclaw_stats
  for select
  to anon
  using (true);

grant usage on schema user_analysis to authenticated;
grant usage on schema user_analysis to anon;
grant select, insert, update on user_analysis.openclaw_stats to authenticated;

-- latest snapshot per user (for stats2 profile/github card binding)
create or replace view public.v_openclaw_stats_latest as
with ranked as (
  select
    s.*,
    row_number() over (
      partition by s.user_id
      order by coalesce(s.analyzed_at, s.created_at) desc, s.id desc
    ) as rn
  from user_analysis.openclaw_stats s
)
select
  r.id as stat_id,
  r.user_id,
  ua.user_name,
  ua.user_identity,
  coalesce(r.github_login, ua.github_login) as github_login,
  coalesce(
    nullif(trim(upper(r.country_code)), ''),
    nullif(trim(upper(ua.country_code)), ''),
    nullif(trim(upper(ua.current_location)), ''),
    nullif(trim(upper(ua.manual_location)), ''),
    nullif(trim(upper(ua.ip_location)), ''),
    'XX'
  ) as country_code,
  r.analyzed_at,
  r.total_tokens,
  r.total_cost_usd,
  r.success_rate,
  r.abnormal_interrupt_rate,
  r.cache_hit_rate,
  r.tool_calls_total,
  r.model_usage,
  r.skills_stats,
  r.tool_usage,
  coalesce(r.github_card, '{}'::jsonb) as github_card,
  coalesce(ua.github_stats, '{}'::jsonb) as github_stats
from ranked r
left join public.user_analysis ua on ua.id = r.user_id
where r.rn = 1;

comment on view public.v_openclaw_stats_latest is '每个用户最新 OpenClaw 统计快照（含 github_card 绑定字段）';

-- country rollup for stats2 regional/user distribution panels
create or replace view public.v_openclaw_country_stats as
select
  coalesce(
    nullif(trim(upper(s.country_code)), ''),
    nullif(trim(upper(ua.country_code)), ''),
    nullif(trim(upper(ua.current_location)), ''),
    nullif(trim(upper(ua.manual_location)), ''),
    nullif(trim(upper(ua.ip_location)), ''),
    'XX'
  ) as country_code,
  count(*)::bigint as snapshot_count,
  count(distinct s.user_id)::bigint as user_count,
  sum(s.total_tokens)::bigint as total_tokens,
  sum(s.total_cost_usd)::numeric(18,6) as total_cost_usd,
  sum(s.tool_calls_total)::bigint as total_tool_calls,
  avg(s.success_rate)::numeric(8,6) as avg_success_rate,
  avg(s.abnormal_interrupt_rate)::numeric(8,6) as avg_abnormal_interrupt_rate,
  avg(s.cache_hit_rate)::numeric(8,6) as avg_cache_hit_rate,
  max(s.analyzed_at) as last_analyzed_at
from user_analysis.openclaw_stats s
left join public.user_analysis ua on ua.id = s.user_id
group by 1;

comment on view public.v_openclaw_country_stats is 'OpenClaw 国家维度聚合（用户数/Token/成本/成功率/中断率）';

grant select on public.v_openclaw_stats_latest to anon;
grant select on public.v_openclaw_stats_latest to authenticated;
grant select on public.v_openclaw_country_stats to anon;
grant select on public.v_openclaw_country_stats to authenticated;
