-- ============================================
-- refresh_country_stats_current dual-source rollup
-- - cursor + openclaw metrics separated
-- - total_chars uses cursor_chars + openclaw_chars
-- - work_days uses row-level max(cursor, openclaw, column)
-- - rank_score = cursor_messages*0.7 + openclaw_tool_calls*0.3
-- ============================================

alter table public.country_stats_current
  add column if not exists cursor_metrics jsonb not null default '{}'::jsonb,
  add column if not exists lobster_metrics jsonb not null default '{}'::jsonb,
  add column if not exists rank_score numeric not null default 0;

create or replace function public.refresh_country_stats_current()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  with base as (
    select
      upper(
        coalesce(
          nullif(trim(country_code), ''),
          nullif(trim(current_location), ''),
          nullif(trim(manual_location), ''),
          nullif(trim(ip_location), '')
        )
      ) as country_code,
      coalesce(nullif((stats->'cursor'->>'total_messages'), '')::bigint, coalesce(total_messages, 0)::bigint, 0::bigint) as cursor_messages,
      coalesce(nullif((stats->'cursor'->>'total_chars'), '')::bigint, coalesce(total_chars, 0)::bigint, 0::bigint) as cursor_total_chars,
      coalesce(nullif((stats->'cursor'->>'work_days'), '')::bigint, coalesce(work_days, 0)::bigint, 0::bigint) as cursor_work_days,
      coalesce(nullif((stats->'openclaw'->'stats'->>'records_total'), '')::bigint, 0::bigint) as openclaw_messages,
      coalesce(nullif((stats->'openclaw'->'stats'->>'total_chars'), '')::bigint, 0::bigint) as openclaw_total_chars,
      coalesce(nullif((stats->'openclaw'->'stats'->>'tool_calls_total'), '')::bigint, 0::bigint) as openclaw_tool_calls,
      coalesce(nullif((stats->'openclaw'->'stats'->>'work_days'), '')::bigint, 0::bigint) as openclaw_work_days,
      coalesce(work_days, 0)::bigint as col_work_days,
      coalesce(jiafang_count, 0)::bigint as jiafang_count,
      coalesce(ketao_count, 0)::bigint as ketao_count
    from public.user_analysis
  ),
  src as (
    select
      country_code,
      count(*)::bigint as total_users,
      sum(cursor_messages + openclaw_messages)::bigint as total_messages_sum,
      sum(cursor_total_chars + openclaw_total_chars)::bigint as total_user_chars_sum,
      sum(cursor_total_chars + openclaw_total_chars)::bigint as total_chars_sum,
      sum(jiafang_count)::bigint as jiafang_count_sum,
      sum(ketao_count)::bigint as ketao_count_sum,
      sum(greatest(cursor_work_days, openclaw_work_days, col_work_days))::bigint as work_days_sum,
      sum(cursor_messages)::bigint as cursor_messages_sum,
      sum(cursor_total_chars)::bigint as cursor_total_chars_sum,
      sum(cursor_work_days)::bigint as cursor_work_days_sum,
      sum(openclaw_messages)::bigint as openclaw_messages_sum,
      sum(openclaw_total_chars)::bigint as openclaw_total_chars_sum,
      sum(openclaw_tool_calls)::bigint as openclaw_tool_calls_sum,
      sum(openclaw_work_days)::bigint as openclaw_work_days_sum
    from base
    where country_code ~ '^[A-Z]{2}$'
    group by country_code
  )
  insert into public.country_stats_current (
    country_code,
    total_users,
    total_messages_sum,
    total_user_chars_sum,
    total_chars_sum,
    jiafang_count_sum,
    ketao_count_sum,
    avg_user_message_length,
    updated_at,
    cursor_metrics,
    lobster_metrics,
    rank_score
  )
  select
    s.country_code,
    s.total_users,
    s.total_messages_sum,
    s.total_user_chars_sum,
    s.total_chars_sum,
    s.jiafang_count_sum,
    s.ketao_count_sum,
    coalesce((s.total_user_chars_sum::numeric / nullif(s.total_messages_sum, 0)::numeric), 0),
    now(),
    jsonb_build_object(
      'messages', s.cursor_messages_sum,
      'total_chars', s.cursor_total_chars_sum,
      'work_days', s.cursor_work_days_sum
    ),
    jsonb_build_object(
      'messages', s.openclaw_messages_sum,
      'tool_calls', s.openclaw_tool_calls_sum,
      'total_chars', s.openclaw_total_chars_sum,
      'work_days', s.openclaw_work_days_sum
    ),
    (s.cursor_messages_sum::numeric * 0.7) + (s.openclaw_tool_calls_sum::numeric * 0.3)
  from src s
  on conflict (country_code) do update set
    total_users = excluded.total_users,
    total_messages_sum = excluded.total_messages_sum,
    total_user_chars_sum = excluded.total_user_chars_sum,
    total_chars_sum = excluded.total_chars_sum,
    jiafang_count_sum = excluded.jiafang_count_sum,
    ketao_count_sum = excluded.ketao_count_sum,
    avg_user_message_length = excluded.avg_user_message_length,
    cursor_metrics = excluded.cursor_metrics,
    lobster_metrics = excluded.lobster_metrics,
    rank_score = excluded.rank_score,
    updated_at = now();

  delete from public.country_stats_current c
  where not exists (
    select 1
    from public.user_analysis u
    where upper(
      coalesce(
        nullif(trim(u.country_code), ''),
        nullif(trim(u.current_location), ''),
        nullif(trim(u.manual_location), ''),
        nullif(trim(u.ip_location), '')
      )
    ) = c.country_code
      and upper(
        coalesce(
          nullif(trim(u.country_code), ''),
          nullif(trim(u.current_location), ''),
          nullif(trim(u.manual_location), ''),
          nullif(trim(u.ip_location), '')
        )
      ) ~ '^[A-Z]{2}$'
  );
end;
$$;

comment on function public.refresh_country_stats_current() is
'刷新 country_stats_current：双源聚合 cursor/openclaw，输出 cursor_metrics/lobster_metrics，并计算 rank_score=(cursor_messages*0.7)+(openclaw_tool_calls*0.3)';
