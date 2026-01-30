-- ============================================
-- keyword_logs 关键词日志表（语义爆发核心表）
-- 用途：
-- 1) 接收前端上报的原始关键词数据
-- 2) 支持分类存储（merit/slang/sv_slang）
-- 3) 支持指纹关联，便于用户行为分析
-- ============================================

-- 1) 表结构
create table if not exists public.keyword_logs (
  id          bigserial primary key,
  phrase      text not null,
  category    text not null default 'slang', -- merit | slang | sv_slang
  fingerprint text null, -- 用户指纹（可选）
  weight      integer not null default 1, -- 权重（通常为1）
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- 2) 索引优化（提升查询性能）
create index if not exists idx_keyword_logs_phrase on public.keyword_logs(phrase);
create index if not exists idx_keyword_logs_category on public.keyword_logs(category);
create index if not exists idx_keyword_logs_fingerprint on public.keyword_logs(fingerprint);
create index if not exists idx_keyword_logs_created_at on public.keyword_logs(created_at desc);

-- 3) 复合索引（支持聚合查询）
create index if not exists idx_keyword_logs_phrase_category on public.keyword_logs(phrase, category);
create index if not exists idx_keyword_logs_category_created on public.keyword_logs(category, created_at desc);

-- 4) 更新时间戳触发器
create or replace function public._touch_keyword_logs_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_keyword_logs_touch on public.keyword_logs;
create trigger trg_keyword_logs_touch
before update on public.keyword_logs
for each row
execute function public._touch_keyword_logs_updated_at();

-- 5) 聚合视图（v_keyword_stats） - 词云数据源
create or replace view public.v_keyword_stats as
select 
  phrase,
  category,
  sum(weight) as value,
  count(*) as hit_count,
  max(created_at) as last_seen
from public.keyword_logs 
where created_at >= now() - interval '90 days' -- 只统计最近90天的数据
group by phrase, category
having sum(weight) > 0
order by sum(weight) desc, count(*) desc;

-- 6) 清理策略（可选，防止表膨胀）
-- 删除90天前的数据（建议定期执行）
-- delete from public.keyword_logs where created_at < now() - interval '90 days';

-- 7) 权限设置（根据需要调整）
-- grant usage on schema public to anon, authenticated;
-- grant select, insert on public.keyword_logs to anon, authenticated;
-- grant usage, select on sequence public.keyword_logs_id_seq to anon, authenticated;
-- grant select on public.v_keyword_stats to anon, authenticated;