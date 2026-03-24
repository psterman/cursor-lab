-- 全球「硬核榜」数据管道自检（在 Supabase SQL Editor 中执行）
-- 对应计划：verify-supabase / verify-user-analysis / verify-api-path 的人工核对步骤

-- ---------------------------------------------------------------------------
-- 1) verify-supabase：country_stats_current 是否含 jiafang / lobster_metrics
-- ---------------------------------------------------------------------------
select country_code,
       total_users,
       jiafang_count_sum,
       cursor_total_messages_sum,
       coalesce((cursor_metrics->>'ai_messages')::bigint, 0) as cursor_ai_messages_sum,
       round((coalesce((cursor_metrics->>'ai_messages')::bigint, 0)::numeric / nullif(jiafang_count_sum, 0)), 6) as jiafang_interval_ai_per_neg_calc,
       lobster_metrics
from public.country_stats_current
order by total_users desc nulls last
limit 15;

-- 部署迁移后应执行（或由 Cron 触发 Worker 内的同名 RPC）：
-- select public.refresh_country_stats_current();

-- ---------------------------------------------------------------------------
-- 2) verify-user-analysis：OpenClaw 指标在 stats JSON 中的路径分布
--    refresh_country_stats_current 优先读 stats.openclaw.stats.*，并回退 stats.openclaw_stats.*
-- ---------------------------------------------------------------------------
select
  count(*) filter (where coalesce(nullif(stats->'openclaw'->'stats'->>'tool_calls_total', ''), '') <> '') as nested_tool_calls_nonempty,
  count(*) filter (where coalesce(nullif(stats->'openclaw_stats'->>'tool_calls_total', ''), '') <> '') as flat_tool_calls_nonempty,
  count(*) filter (where coalesce(nullif(stats->'openclaw'->'stats'->>'tasks_executed', ''), '') <> '') as nested_tasks_nonempty,
  count(*) filter (where coalesce(nullif(stats->'openclaw_stats'->>'tasks_executed', ''), '') <> '') as flat_tasks_nonempty,
  count(*) as total_rows
from public.user_analysis;

select
  count(*) filter (where (github_stats->>'avg_languages_per_repo') ~ '^[0-9]' or (github_stats->>'avgLanguagesPerRepo') ~ '^[0-9]') as has_avg_languages_per_repo,
  count(*) as total_with_github_stats
from public.user_analysis
where github_stats is not null and github_stats <> '{}'::jsonb;

-- ---------------------------------------------------------------------------
-- 3) v_country_stats_rollup 与 Worker 读写字段对齐（mergeCountryStatsCurrent / KV）
-- ---------------------------------------------------------------------------
select country_code,
       jiafang_count_sum,
       cursor_total_messages_sum,
       cursor_ai_messages_sum,
       openclaw_tool_calls_sum,
       tasks_executed_sum,
       jiafang_rejection_rate
from public.v_country_stats_rollup
order by total_users desc nulls last
limit 15;
