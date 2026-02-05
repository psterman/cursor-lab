-- ============================================
-- slang_trends 趋势统计表（语义爆发）
-- 用途：
-- 1) 前端本地提取关键词后上报
-- 2) 后端按月桶统计 hit_count
-- ============================================

-- 1) 表结构
create table if not exists public.slang_trends (
  phrase      text not null,
  region      text not null,
  time_bucket date not null,
  hit_count   integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (phrase, region, time_bucket)
);

-- 2) 更新时间戳：简单触发器（可选，但有助于审计）
create or replace function public._touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_slang_trends_touch on public.slang_trends;
create trigger trg_slang_trends_touch
before update on public.slang_trends
for each row
execute function public._touch_updated_at();

-- 3) RPC：批量增量（推荐）
-- 注意：Worker 端使用 service key 调用 RPC，可绕过 RLS。
create or replace function public.increment_slang_trends(
  p_phrases text[],
  p_region text,
  p_time_bucket date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  p text;
begin
  if p_phrases is null or array_length(p_phrases, 1) is null then
    return;
  end if;

  foreach p in array p_phrases loop
    if p is null or length(trim(p)) = 0 then
      continue;
    end if;

    insert into public.slang_trends (phrase, region, time_bucket, hit_count)
    values (trim(p), trim(p_region), p_time_bucket, 1)
    on conflict (phrase, region, time_bucket)
    do update set hit_count = public.slang_trends.hit_count + excluded.hit_count;
  end loop;
end;
$$;

-- 3.1) RPC：单条 upsert（与 /api/report-slang 对齐）
-- SQL 参考（按月桶）：INSERT ... VALUES (p_phrase, p_region, date_trunc('month', CURRENT_DATE)::date)
create or replace function public.upsert_slang_hits(
  p_phrase text,
  p_region text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_phrase is null or length(trim(p_phrase)) = 0 then
    return;
  end if;
  insert into public.slang_trends (phrase, region, time_bucket, hit_count)
  values (trim(p_phrase), trim(p_region), date_trunc('month', CURRENT_DATE)::date, 1)
  on conflict (phrase, region, time_bucket)
  do update set hit_count = public.slang_trends.hit_count + 1;
end;
$$;

-- 4) 授权（如需通过 REST/RPC 公开调用，请按你的安全策略设置；默认建议仅 Worker 使用 service key）
-- grant execute on function public.increment_slang_trends(text[], text, date) to anon, authenticated;
-- grant execute on function public.upsert_slang_hits(text, text) to anon, authenticated;

