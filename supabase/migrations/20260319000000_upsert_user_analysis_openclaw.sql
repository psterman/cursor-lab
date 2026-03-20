-- ============================================
-- OpenClaw upsert helper for user_analysis
-- - keep existing stats nodes (e.g. cursor)
-- - update openclaw branch and latest activity fields
-- ============================================

create or replace function public.upsert_user_analysis_openclaw(
  p_fingerprint text,
  p_user_name text default null,
  p_github_login text default null,
  p_user_identity text default null,
  p_country_code text default null,
  p_total_tokens bigint default null,
  p_primary_model text default null,
  p_skills_tags jsonb default null,
  p_total_messages integer default null,
  p_work_days integer default null,
  p_total_chars bigint default null,
  p_last_active_at timestamptz default now(),
  p_stats jsonb default '{}'::jsonb,
  p_updated_at timestamptz default now()
)
returns table (id uuid)
language plpgsql
security definer
set search_path = public
as $$
begin
  if nullif(trim(p_fingerprint), '') is null then
    raise exception 'p_fingerprint is required';
  end if;

  return query
  with upserted as (
    insert into public.user_analysis (
      fingerprint,
      user_name,
      github_login,
      user_identity,
      country_code,
      total_tokens,
      primary_model,
      skills_tags,
      total_messages,
      work_days,
      total_chars,
      last_active_at,
      stats,
      updated_at
    )
    values (
      trim(p_fingerprint),
      p_user_name,
      p_github_login,
      p_user_identity,
      p_country_code,
      p_total_tokens,
      p_primary_model,
      p_skills_tags,
      p_total_messages,
      p_work_days,
      p_total_chars,
      coalesce(p_last_active_at, now()),
      coalesce(p_stats, '{}'::jsonb),
      coalesce(p_updated_at, now())
    )
    on conflict (fingerprint) do update
    set
      user_name = coalesce(excluded.user_name, user_analysis.user_name),
      github_login = coalesce(excluded.github_login, user_analysis.github_login),
      user_identity = coalesce(excluded.user_identity, user_analysis.user_identity),
      total_tokens = coalesce(excluded.total_tokens, user_analysis.total_tokens),
      primary_model = coalesce(excluded.primary_model, user_analysis.primary_model),
      skills_tags = coalesce(excluded.skills_tags, user_analysis.skills_tags),
      total_messages = coalesce(excluded.total_messages, user_analysis.total_messages),
      work_days = coalesce(excluded.work_days, user_analysis.work_days),
      total_chars = coalesce(excluded.total_chars, user_analysis.total_chars),
      stats = coalesce(user_analysis.stats, '{}'::jsonb) || excluded.stats,
      country_code = excluded.country_code,
      updated_at = excluded.updated_at,
      last_active_at = excluded.last_active_at
    returning user_analysis.id
  )
  select upserted.id from upserted;
end;
$$;

comment on function public.upsert_user_analysis_openclaw(
  text, text, text, text, text, bigint, text, jsonb, integer, integer, bigint, timestamptz, jsonb, timestamptz
) is 'OpenClaw 上报专用 UPSERT：以 fingerprint 冲突，stats 采用 COALESCE(user_analysis.stats,''{}''::jsonb) || EXCLUDED.stats，并强制刷新 country_code/updated_at/last_active_at';

grant execute on function public.upsert_user_analysis_openclaw(
  text, text, text, text, text, bigint, text, jsonb, integer, integer, bigint, timestamptz, jsonb, timestamptz
) to anon;

grant execute on function public.upsert_user_analysis_openclaw(
  text, text, text, text, text, bigint, text, jsonb, integer, integer, bigint, timestamptz, jsonb, timestamptz
) to authenticated;
