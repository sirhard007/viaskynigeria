-- Run in the VIA SKY Analytics project's SQL Editor. No secret values belong here.
begin;
create table if not exists public.viasky_events (
  id uuid primary key,
  visitor_id uuid not null,
  session_id uuid not null,
  name text not null check (name in ('page_view','planner_open','service_select','destination_select','planner_step_view','planner_step_complete','whatsapp_handoff','whatsapp_click')),
  occurred_at timestamptz not null default now(),
  page text not null check (page in ('/','/privacy.html')),
  source text not null,
  device text not null check (device in ('mobile','tablet','desktop')),
  country text not null,
  data jsonb not null default '{}'::jsonb
);
create index if not exists viasky_events_time on public.viasky_events(occurred_at);
create table if not exists public.viasky_rate_limits (
  key text primary key,
  count integer not null,
  expires_at timestamptz not null
);
alter table public.viasky_events enable row level security;
alter table public.viasky_rate_limits enable row level security;
revoke all on public.viasky_events, public.viasky_rate_limits from anon, authenticated;
grant select, insert, delete on public.viasky_events to service_role;
grant all on public.viasky_rate_limits to service_role;

create or replace function public.viasky_cleanup() returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.viasky_events where occurred_at < now() - interval '90 days';
  delete from public.viasky_rate_limits where expires_at < now();
end;
$$;
revoke all on function public.viasky_cleanup() from public, anon, authenticated;
grant execute on function public.viasky_cleanup() to service_role;

create or replace function public.viasky_rate_limit(p_key text, p_limit integer, p_seconds integer)
returns boolean language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  if p_limit < 1 or p_limit > 1000 or p_seconds < 1 or p_seconds > 900 then return false; end if;
  delete from public.viasky_rate_limits where expires_at < now();
  insert into public.viasky_rate_limits(key, count, expires_at)
  values(p_key,1,now()+make_interval(secs=>p_seconds))
  on conflict(key) do update set count=public.viasky_rate_limits.count+1
  returning count into n;
  return n <= p_limit;
end;
$$;
revoke all on function public.viasky_rate_limit(text,integer,integer) from public, anon, authenticated;
grant execute on function public.viasky_rate_limit(text,integer,integer) to service_role;

create or replace function public.viasky_summary(p_start timestamptz,p_end timestamptz,p_days integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  if p_days not in (7,30,90) or p_end <= p_start or p_end-p_start > interval '90 days' then raise exception 'Invalid report range'; end if;
  perform public.viasky_cleanup();
  with e as materialized (
    select * from public.viasky_events where occurred_at >= p_start and occurred_at < p_end
  ), rankings as (
    select 'services' as kind,data->>'service' as label,count(*) as count from e where name='service_select' and data ? 'service' group by data->>'service'
    union all select 'destinations',data->>'destination',count(*) from e where name='destination_select' and data ? 'destination' group by data->>'destination'
    union all select 'sources',source,count(distinct session_id) from e group by source
    union all select 'devices',device,count(distinct session_id) from e group by device
    union all select 'countries',country,count(distinct session_id) from e group by country
    union all select 'placements',coalesce(data->>'placement','planner'),count(*) from e where name in ('whatsapp_handoff','whatsapp_click') group by coalesce(data->>'placement','planner')
  ), ordered as (
    select *,row_number() over(partition by kind order by count desc,label) as position from rankings
  ), lists as (
    select kind,jsonb_agg(jsonb_build_object('label',label,'count',count) order by count desc,label) as items from ordered where position<=12 group by kind
  ), days as (
    select d::date as day from generate_series((p_start at time zone 'Africa/Lagos')::date,((p_end-interval '1 second') at time zone 'Africa/Lagos')::date,interval '1 day') d
  ), trend as (
    select days.day,count(distinct e.session_id) as visits,count(e.id) filter(where e.name in ('whatsapp_handoff','whatsapp_click')) as handoffs
    from days left join e on (e.occurred_at at time zone 'Africa/Lagos')::date=days.day group by days.day
  )
  select jsonb_build_object(
    'range',jsonb_build_object('days',p_days,'start',p_start,'end',p_end),
    'generatedAt',now(),
    'totals',(select jsonb_build_object(
      'visitors',count(distinct visitor_id),'visits',count(distinct session_id),
      'pageViews',count(*) filter(where name='page_view'),
      'planners',count(distinct session_id) filter(where name='planner_open'),
      'handoffs',count(*) filter(where name in ('whatsapp_handoff','whatsapp_click')),
      'enquiryVisits',count(distinct session_id) filter(where name in ('whatsapp_handoff','whatsapp_click')),
      'conversion',coalesce(round(100.0*(count(distinct session_id) filter(where name in ('whatsapp_handoff','whatsapp_click')))/nullif(count(distinct session_id),0),1),0),
      'active',count(distinct session_id) filter(where occurred_at > now()-interval '5 minutes')
    ) from e),
    'daily',(select jsonb_agg(jsonb_build_object('date',to_char(day,'YYYY-MM-DD'),'visits',visits,'handoffs',handoffs) order by day) from trend),
    'services',coalesce((select items from lists where kind='services'),'[]'::jsonb),
    'destinations',coalesce((select items from lists where kind='destinations'),'[]'::jsonb),
    'sources',coalesce((select items from lists where kind='sources'),'[]'::jsonb),
    'devices',coalesce((select items from lists where kind='devices'),'[]'::jsonb),
    'countries',coalesce((select items from lists where kind='countries'),'[]'::jsonb),
    'placements',coalesce((select items from lists where kind='placements'),'[]'::jsonb),
    'journey',(select jsonb_build_array(
      jsonb_build_object('label','Planner opened','count',count(distinct session_id) filter(where name='planner_open')),
      jsonb_build_object('label','Trip details','count',count(distinct session_id) filter(where name='planner_step_view' and data->>'step'='3')),
      jsonb_build_object('label','Contact details','count',count(distinct session_id) filter(where name='planner_step_view' and data->>'step'='4')),
      jsonb_build_object('label','WhatsApp handoff','count',count(distinct session_id) filter(where name='whatsapp_handoff'))
    ) from e)
  ) into result;
  return result;
end;
$$;
revoke all on function public.viasky_summary(timestamptz,timestamptz,integer) from public, anon, authenticated;
grant execute on function public.viasky_summary(timestamptz,timestamptz,integer) to service_role;
commit;

-- Retention: enable the pg_cron extension in Database > Extensions, then create a
-- daily Cron job for: select public.viasky_cleanup();
-- The report endpoint also removes expired records whenever it runs.
