-- OpenClaw 定时任务数：从 stats / openclaw_stats / raw_summary 读取 scheduled_tasks_count，国家级 SUM 写入 lobster_metrics.scheduled_tasks
-- 部署后：SELECT public.refresh_country_stats_current();

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
          nullif(trim(u.country_code), ''),
          nullif(trim(u.current_location), ''),
          nullif(trim(u.manual_location), ''),
          nullif(trim(u.ip_location), '')
        )
      ) as country_code,
      coalesce(nullif((u.stats->'cursor'->>'total_messages'), '')::bigint, coalesce(u.total_messages, 0)::bigint, 0::bigint) as cursor_messages,
      coalesce(nullif((u.stats->'cursor'->>'total_chars'), '')::bigint, coalesce(u.total_chars, 0)::bigint, 0::bigint) as cursor_total_chars,
      coalesce(nullif((u.stats->'cursor'->>'work_days'), '')::bigint, coalesce(u.work_days, 0)::bigint, 0::bigint) as cursor_work_days,
      coalesce(
        nullif((u.stats->'openclaw'->'stats'->>'records_total'), '')::bigint,
        nullif((u.stats->'openclaw_stats'->>'records_total'), '')::bigint,
        nullif((ocs.raw_summary->>'records_total'), '')::bigint,
        0::bigint
      ) as openclaw_messages,
      coalesce(
        nullif((u.stats->'openclaw'->'stats'->>'total_chars'), '')::bigint,
        nullif((u.stats->'openclaw_stats'->>'total_chars'), '')::bigint,
        nullif((ocs.raw_summary->>'total_chars'), '')::bigint,
        nullif((ocs.stats2_bindings->>'total_chars'), '')::bigint,
        0::bigint
      ) as openclaw_total_chars,
      coalesce(
        nullif((u.stats->'openclaw'->'stats'->>'tool_calls_total'), '')::bigint,
        nullif((u.stats->'openclaw_stats'->>'tool_calls_total'), '')::bigint,
        nullif((ocs.tool_calls_total)::text, '')::bigint,
        nullif((ocs.raw_summary->>'tool_calls_total'), '')::bigint,
        nullif((ocs.stats2_bindings->>'tool_calls_total'), '')::bigint,
        0::bigint
      ) as openclaw_tool_calls,
      coalesce(
        nullif((u.stats->'openclaw'->'stats'->>'work_days'), '')::bigint,
        nullif((u.stats->'openclaw_stats'->>'work_days'), '')::bigint,
        nullif((ocs.raw_summary->>'work_days'), '')::bigint,
        nullif((ocs.stats2_bindings->>'work_days'), '')::bigint,
        0::bigint
      ) as openclaw_work_days,
      coalesce(
        nullif((u.stats->'openclaw'->'stats'->>'tasks_executed'), '')::bigint,
        nullif((u.stats->'openclaw_stats'->>'tasks_executed'), '')::bigint,
        nullif((ocs.raw_summary->>'tasks_executed'), '')::bigint,
        nullif((ocs.stats2_bindings->>'tasks_executed'), '')::bigint,
        0::bigint
      ) as openclaw_tasks_executed,
      coalesce(
        nullif((u.stats->'openclaw'->'stats'->>'scheduled_tasks_count'), '')::bigint,
        nullif((u.stats->'openclaw_stats'->>'scheduled_tasks_count'), '')::bigint,
        nullif((ocs.raw_summary->>'scheduled_tasks_count'), '')::bigint,
        nullif((ocs.stats2_bindings->>'scheduled_tasks_count'), '')::bigint,
        0::bigint
      ) as openclaw_scheduled_tasks,
      coalesce(u.work_days, 0)::bigint as col_work_days,
      coalesce(u.jiafang_count, 0)::bigint as jiafang_count,
      coalesce(u.ketao_count, 0)::bigint as ketao_count,
      case
        when u.github_stats->>'totalRepos' is not null and trim(u.github_stats->>'totalRepos') ~ '^[0-9]+$'
          then (trim(u.github_stats->>'totalRepos'))::bigint
        else
          (case when u.github_stats->>'publicRepos' is not null and trim(u.github_stats->>'publicRepos') ~ '^[0-9]+$'
            then (trim(u.github_stats->>'publicRepos'))::bigint else 0::bigint end)
          + (case when u.github_stats->>'privateRepos' is not null and trim(u.github_stats->>'privateRepos') ~ '^[0-9]+$'
            then (trim(u.github_stats->>'privateRepos'))::bigint else 0::bigint end)
      end as github_repos,
      nullif(
        trim(
          coalesce(
            u.github_stats->>'primaryLanguage',
            u.github_stats->>'primary_language',
            u.github_stats->>'mainLanguage',
            u.github_stats->>'main_language',
            ''
          )
        ),
        ''
      ) as main_lang_raw,
      coalesce(
        nullif((u.stats->'cursor'->>'ai_messages'), '')::bigint,
        nullif((u.stats->'cursor'->>'aiMessages'), '')::bigint,
        greatest(
          0::bigint,
          (coalesce(
            nullif((u.stats->'cursor'->>'total_messages'), '')::bigint,
            coalesce(u.total_messages, 0)::bigint,
            0::bigint
          ) / 2)::bigint
        )
      ) as cursor_ai_messages
    from public.user_analysis u
    left join lateral (
      select s.*
      from user_analysis.openclaw_stats s
      where s.user_id = u.id
      order by coalesce(s.analyzed_at, s.created_at) desc, s.id desc
      limit 1
    ) ocs on true
  ),
  lang_counts as (
    select
      country_code,
      main_lang_raw as lang,
      count(*)::bigint as cnt
    from base
    where country_code ~ '^[A-Z]{2}$'
      and main_lang_raw is not null
    group by country_code, main_lang_raw
  ),
  lang_mode as (
    select distinct on (country_code)
      country_code,
      lang as main_language_mode,
      cnt as main_language_mode_users
    from lang_counts
    order by country_code, cnt desc, lang asc
  ),
  src as (
    select
      b.country_code,
      count(*)::bigint as total_users,
      sum(b.cursor_messages + b.openclaw_messages)::bigint as total_messages_sum,
      sum(b.cursor_total_chars + b.openclaw_total_chars)::bigint as total_user_chars_sum,
      sum(b.cursor_total_chars + b.openclaw_total_chars)::bigint as total_chars_sum,
      sum(b.jiafang_count)::bigint as jiafang_count_sum,
      sum(b.ketao_count)::bigint as ketao_count_sum,
      sum(greatest(b.cursor_work_days, b.openclaw_work_days, b.col_work_days))::bigint as work_days_sum,
      sum(b.cursor_messages)::bigint as cursor_messages_sum,
      sum(b.cursor_total_chars)::bigint as cursor_total_chars_sum,
      sum(b.cursor_work_days)::bigint as cursor_work_days_sum,
      sum(b.openclaw_messages)::bigint as openclaw_messages_sum,
      sum(b.openclaw_total_chars)::bigint as openclaw_total_chars_sum,
      sum(b.openclaw_tool_calls)::bigint as openclaw_tool_calls_sum,
      sum(b.openclaw_tasks_executed)::bigint as openclaw_tasks_executed_sum,
      sum(b.openclaw_scheduled_tasks)::bigint as openclaw_scheduled_tasks_sum,
      sum(b.openclaw_work_days)::bigint as openclaw_work_days_sum,
      sum(b.cursor_messages)::bigint as cursor_total_messages_sum,
      sum(b.github_repos)::bigint as github_total_repos_sum,
      sum(b.cursor_ai_messages)::bigint as cursor_ai_messages_sum
    from base b
    where b.country_code ~ '^[A-Z]{2}$'
    group by b.country_code
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
    rank_score,
    main_language_mode,
    main_language_mode_users,
    cursor_total_messages_sum,
    github_total_repos_sum
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
      'ai_messages', s.cursor_ai_messages_sum,
      'total_chars', s.cursor_total_chars_sum,
      'work_days', s.cursor_work_days_sum
    ),
    jsonb_build_object(
      'messages', s.openclaw_messages_sum,
      'tool_calls', s.openclaw_tool_calls_sum,
      'tasks_executed', s.openclaw_tasks_executed_sum,
      'scheduled_tasks', s.openclaw_scheduled_tasks_sum,
      'total_chars', s.openclaw_total_chars_sum,
      'work_days', s.openclaw_work_days_sum
    ),
    s.cursor_total_messages_sum::numeric,
    lm.main_language_mode,
    coalesce(lm.main_language_mode_users, 0::bigint),
    s.cursor_total_messages_sum,
    s.github_total_repos_sum
  from src s
  left join lang_mode lm on lm.country_code = s.country_code
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
    main_language_mode = excluded.main_language_mode,
    main_language_mode_users = excluded.main_language_mode_users,
    cursor_total_messages_sum = excluded.cursor_total_messages_sum,
    github_total_repos_sum = excluded.github_total_repos_sum,
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

comment on column public.country_stats_current.lobster_metrics is 'OpenClaw：messages, tool_calls, tasks_executed, scheduled_tasks（定时任务数 SUM）, total_chars, work_days';

drop view if exists public.v_country_stats_rollup;

create view public.v_country_stats_rollup as
select
  country_code,
  total_users,
  main_language_mode,
  main_language_mode_users,
  cursor_total_messages_sum,
  github_total_repos_sum,
  jiafang_count_sum,
  coalesce((lobster_metrics->>'tool_calls')::bigint, 0::bigint) as openclaw_tool_calls_sum,
  coalesce((lobster_metrics->>'tasks_executed')::bigint, 0::bigint) as tasks_executed_sum,
  coalesce((lobster_metrics->>'scheduled_tasks')::bigint, 0::bigint) as scheduled_tasks_sum,
  coalesce((cursor_metrics->>'ai_messages')::bigint, 0::bigint) as cursor_ai_messages_sum,
  (cursor_total_messages_sum::numeric / nullif(total_users, 0)) as avg_cursor_messages_per_user,
  (github_total_repos_sum::numeric / nullif(total_users, 0)) as avg_github_repos_per_user,
  (main_language_mode_users::numeric / nullif(total_users, 0)) as main_language_share,
  case
    when coalesce(jiafang_count_sum, 0) > 0
    then (coalesce((cursor_metrics->>'ai_messages')::bigint, 0)::numeric / nullif(jiafang_count_sum, 0)::numeric)
    else null::numeric
  end as jiafang_rejection_rate
from public.country_stats_current;

comment on view public.v_country_stats_rollup is '国家级聚合；含 scheduled_tasks_sum（OpenClaw 定时任务数国家级 SUM）';

grant select on public.v_country_stats_rollup to anon;
grant select on public.v_country_stats_rollup to authenticated;
