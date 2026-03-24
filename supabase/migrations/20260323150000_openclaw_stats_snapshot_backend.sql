-- Persist OpenClaw snapshots into user_analysis.openclaw_stats so the backend has a durable source
-- for tool-call / task rollups even when user_analysis.stats.openclaw is missing.

create or replace function public.upsert_openclaw_stats_snapshot(
  p_user_id uuid,
  p_source_file_hash text default null,
  p_source_file_name text default null,
  p_source_type text default 'openclaw_jsonl',
  p_stats_version text default 'v1',
  p_records_total integer default 0,
  p_model_usage jsonb default '{}'::jsonb,
  p_top_model_id text default null,
  p_prompt_tokens bigint default 0,
  p_completion_tokens bigint default 0,
  p_total_tokens bigint default 0,
  p_cached_tokens bigint default 0,
  p_total_cost_usd numeric default 0,
  p_skills_stats jsonb default '{}'::jsonb,
  p_skills_snapshot jsonb default '[]'::jsonb,
  p_skills_tree jsonb default '{}'::jsonb,
  p_tool_usage jsonb default '{}'::jsonb,
  p_tool_calls_total integer default 0,
  p_success_count integer default 0,
  p_failure_count integer default 0,
  p_success_rate numeric default 0,
  p_abnormal_interrupt_count integer default 0,
  p_abnormal_interrupt_rate numeric default 0,
  p_cache_requests integer default 0,
  p_cache_hits integer default 0,
  p_cache_hit_rate numeric default 0,
  p_cache_hit_token_rate numeric default 0,
  p_cwd_usage jsonb default '{}'::jsonb,
  p_primary_cwd text default null,
  p_hourly_heatmap jsonb default '[]'::jsonb,
  p_daily_activity jsonb default '{}'::jsonb,
  p_first_event_at timestamptz default null,
  p_last_event_at timestamptz default null,
  p_country_code text default null,
  p_github_login text default null,
  p_github_card jsonb default '{}'::jsonb,
  p_stats2_bindings jsonb default '{}'::jsonb,
  p_raw_summary jsonb default '{}'::jsonb,
  p_analyzed_at timestamptz default now(),
  p_total_chars bigint default 0,
  p_work_days bigint default 0,
  p_tasks_executed bigint default 0
)
returns table (id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source_hash text := nullif(trim(p_source_file_hash), '');
  v_raw_summary jsonb := coalesce(p_raw_summary, '{}'::jsonb)
    || jsonb_build_object(
      'records_total', coalesce(p_records_total, 0),
      'total_chars', coalesce(p_total_chars, 0),
      'work_days', coalesce(p_work_days, 0),
      'tasks_executed', coalesce(p_tasks_executed, 0),
      'tool_calls_total', coalesce(p_tool_calls_total, 0),
      'total_tokens', coalesce(p_total_tokens, 0)
    );
  v_stats2_bindings jsonb := coalesce(p_stats2_bindings, '{}'::jsonb)
    || jsonb_build_object(
      'records_total', coalesce(p_records_total, 0),
      'total_chars', coalesce(p_total_chars, 0),
      'work_days', coalesce(p_work_days, 0),
      'tasks_executed', coalesce(p_tasks_executed, 0),
      'tool_calls_total', coalesce(p_tool_calls_total, 0)
    );
begin
  if p_user_id is null then
    raise exception 'p_user_id is required';
  end if;

  if v_source_hash is not null then
    return query
    with upserted as (
      insert into user_analysis.openclaw_stats (
        user_id,
        source_type,
        source_file_name,
        source_file_hash,
        stats_version,
        records_total,
        model_usage,
        top_model_id,
        prompt_tokens,
        completion_tokens,
        total_tokens,
        cached_tokens,
        total_cost_usd,
        skills_stats,
        skills_snapshot,
        skills_tree,
        tool_usage,
        tool_calls_total,
        success_count,
        failure_count,
        success_rate,
        abnormal_interrupt_count,
        abnormal_interrupt_rate,
        cache_requests,
        cache_hits,
        cache_hit_rate,
        cache_hit_token_rate,
        cwd_usage,
        primary_cwd,
        hourly_heatmap,
        daily_activity,
        first_event_at,
        last_event_at,
        country_code,
        github_login,
        github_card,
        stats2_bindings,
        raw_summary,
        analyzed_at
      )
      values (
        p_user_id,
        p_source_type,
        p_source_file_name,
        v_source_hash,
        p_stats_version,
        coalesce(p_records_total, 0),
        coalesce(p_model_usage, '{}'::jsonb),
        p_top_model_id,
        coalesce(p_prompt_tokens, 0),
        coalesce(p_completion_tokens, 0),
        coalesce(p_total_tokens, 0),
        coalesce(p_cached_tokens, 0),
        coalesce(p_total_cost_usd, 0),
        coalesce(p_skills_stats, '{}'::jsonb),
        coalesce(p_skills_snapshot, '[]'::jsonb),
        coalesce(p_skills_tree, '{}'::jsonb),
        coalesce(p_tool_usage, '{}'::jsonb),
        coalesce(p_tool_calls_total, 0),
        coalesce(p_success_count, 0),
        coalesce(p_failure_count, 0),
        coalesce(p_success_rate, 0),
        coalesce(p_abnormal_interrupt_count, 0),
        coalesce(p_abnormal_interrupt_rate, 0),
        coalesce(p_cache_requests, 0),
        coalesce(p_cache_hits, 0),
        coalesce(p_cache_hit_rate, 0),
        coalesce(p_cache_hit_token_rate, 0),
        coalesce(p_cwd_usage, '{}'::jsonb),
        p_primary_cwd,
        coalesce(p_hourly_heatmap, '[]'::jsonb),
        coalesce(p_daily_activity, '{}'::jsonb),
        p_first_event_at,
        p_last_event_at,
        p_country_code,
        p_github_login,
        coalesce(p_github_card, '{}'::jsonb),
        v_stats2_bindings,
        v_raw_summary,
        coalesce(p_analyzed_at, now())
      )
      on conflict (user_id, source_file_hash) do update
      set
        source_type = excluded.source_type,
        source_file_name = excluded.source_file_name,
        stats_version = excluded.stats_version,
        records_total = excluded.records_total,
        model_usage = excluded.model_usage,
        top_model_id = excluded.top_model_id,
        prompt_tokens = excluded.prompt_tokens,
        completion_tokens = excluded.completion_tokens,
        total_tokens = excluded.total_tokens,
        cached_tokens = excluded.cached_tokens,
        total_cost_usd = excluded.total_cost_usd,
        skills_stats = excluded.skills_stats,
        skills_snapshot = excluded.skills_snapshot,
        skills_tree = excluded.skills_tree,
        tool_usage = excluded.tool_usage,
        tool_calls_total = excluded.tool_calls_total,
        success_count = excluded.success_count,
        failure_count = excluded.failure_count,
        success_rate = excluded.success_rate,
        abnormal_interrupt_count = excluded.abnormal_interrupt_count,
        abnormal_interrupt_rate = excluded.abnormal_interrupt_rate,
        cache_requests = excluded.cache_requests,
        cache_hits = excluded.cache_hits,
        cache_hit_rate = excluded.cache_hit_rate,
        cache_hit_token_rate = excluded.cache_hit_token_rate,
        cwd_usage = excluded.cwd_usage,
        primary_cwd = excluded.primary_cwd,
        hourly_heatmap = excluded.hourly_heatmap,
        daily_activity = excluded.daily_activity,
        first_event_at = excluded.first_event_at,
        last_event_at = excluded.last_event_at,
        country_code = excluded.country_code,
        github_login = excluded.github_login,
        github_card = excluded.github_card,
        stats2_bindings = excluded.stats2_bindings,
        raw_summary = excluded.raw_summary,
        analyzed_at = excluded.analyzed_at,
        updated_at = now()
      returning user_analysis.openclaw_stats.id
    )
    select upserted.id from upserted;
  end if;

  return query
  insert into user_analysis.openclaw_stats (
    user_id,
    source_type,
    source_file_name,
    source_file_hash,
    stats_version,
    records_total,
    model_usage,
    top_model_id,
    prompt_tokens,
    completion_tokens,
    total_tokens,
    cached_tokens,
    total_cost_usd,
    skills_stats,
    skills_snapshot,
    skills_tree,
    tool_usage,
    tool_calls_total,
    success_count,
    failure_count,
    success_rate,
    abnormal_interrupt_count,
    abnormal_interrupt_rate,
    cache_requests,
    cache_hits,
    cache_hit_rate,
    cache_hit_token_rate,
    cwd_usage,
    primary_cwd,
    hourly_heatmap,
    daily_activity,
    first_event_at,
    last_event_at,
    country_code,
    github_login,
    github_card,
    stats2_bindings,
    raw_summary,
    analyzed_at
  )
  values (
    p_user_id,
    p_source_type,
    p_source_file_name,
    null,
    p_stats_version,
    coalesce(p_records_total, 0),
    coalesce(p_model_usage, '{}'::jsonb),
    p_top_model_id,
    coalesce(p_prompt_tokens, 0),
    coalesce(p_completion_tokens, 0),
    coalesce(p_total_tokens, 0),
    coalesce(p_cached_tokens, 0),
    coalesce(p_total_cost_usd, 0),
    coalesce(p_skills_stats, '{}'::jsonb),
    coalesce(p_skills_snapshot, '[]'::jsonb),
    coalesce(p_skills_tree, '{}'::jsonb),
    coalesce(p_tool_usage, '{}'::jsonb),
    coalesce(p_tool_calls_total, 0),
    coalesce(p_success_count, 0),
    coalesce(p_failure_count, 0),
    coalesce(p_success_rate, 0),
    coalesce(p_abnormal_interrupt_count, 0),
    coalesce(p_abnormal_interrupt_rate, 0),
    coalesce(p_cache_requests, 0),
    coalesce(p_cache_hits, 0),
    coalesce(p_cache_hit_rate, 0),
    coalesce(p_cache_hit_token_rate, 0),
    coalesce(p_cwd_usage, '{}'::jsonb),
    p_primary_cwd,
    coalesce(p_hourly_heatmap, '[]'::jsonb),
    coalesce(p_daily_activity, '{}'::jsonb),
    p_first_event_at,
    p_last_event_at,
    p_country_code,
    p_github_login,
    coalesce(p_github_card, '{}'::jsonb),
    v_stats2_bindings,
    v_raw_summary,
    coalesce(p_analyzed_at, now())
  )
  returning user_analysis.openclaw_stats.id;
end;
$$;

comment on function public.upsert_openclaw_stats_snapshot(
  uuid, text, text, text, text, integer, jsonb, text, bigint, bigint, bigint, bigint, numeric, jsonb, jsonb, jsonb, jsonb, integer, integer, integer, numeric, integer, numeric, integer, integer, numeric, numeric, jsonb, text, jsonb, jsonb, timestamptz, timestamptz, text, text, jsonb, jsonb, jsonb, timestamptz, bigint, bigint, bigint
) is 'Persist one OpenClaw snapshot into user_analysis.openclaw_stats for backend rollups.';

grant execute on function public.upsert_openclaw_stats_snapshot(
  uuid, text, text, text, text, integer, jsonb, text, bigint, bigint, bigint, bigint, numeric, jsonb, jsonb, jsonb, jsonb, integer, integer, integer, numeric, integer, numeric, integer, integer, numeric, numeric, jsonb, text, jsonb, jsonb, timestamptz, timestamptz, text, text, jsonb, jsonb, jsonb, timestamptz, bigint, bigint, bigint
) to anon;

grant execute on function public.upsert_openclaw_stats_snapshot(
  uuid, text, text, text, text, integer, jsonb, text, bigint, bigint, bigint, bigint, numeric, jsonb, jsonb, jsonb, jsonb, integer, integer, integer, numeric, integer, numeric, integer, integer, numeric, numeric, jsonb, text, jsonb, jsonb, timestamptz, timestamptz, text, text, jsonb, jsonb, jsonb, timestamptz, bigint, bigint, bigint
) to authenticated;

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
  coalesce(ua.github_stats, '{}'::jsonb) as github_stats,
  r.raw_summary,
  r.stats2_bindings,
  coalesce(nullif(trim(r.raw_summary->>'total_chars'), '')::bigint, 0::bigint) as total_chars,
  coalesce(nullif(trim(r.raw_summary->>'work_days'), '')::bigint, 0::bigint) as work_days,
  coalesce(nullif(trim(r.raw_summary->>'tasks_executed'), '')::bigint, 0::bigint) as tasks_executed
from ranked r
left join public.user_analysis ua on ua.id = r.user_id
where r.rn = 1;

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
  max(s.analyzed_at) as last_analyzed_at,
  sum(coalesce(nullif(trim(s.raw_summary->>'tasks_executed'), '')::bigint, 0::bigint))::bigint as total_tasks_executed,
  sum(coalesce(nullif(trim(s.raw_summary->>'total_chars'), '')::bigint, 0::bigint))::bigint as total_chars,
  sum(coalesce(nullif(trim(s.raw_summary->>'work_days'), '')::bigint, 0::bigint))::bigint as total_work_days
from user_analysis.openclaw_stats s
left join public.user_analysis ua on ua.id = s.user_id
group by 1;

grant select on public.v_openclaw_stats_latest to anon;
grant select on public.v_openclaw_stats_latest to authenticated;
grant select on public.v_openclaw_country_stats to anon;
grant select on public.v_openclaw_country_stats to authenticated;
