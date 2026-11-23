-- ============================================================================
-- Nailed It: Business Insights for freelancers
-- Applied to the project as migration "business_insights". Kept here for reference.
--
--   1. appointments.status 'no_show' (+ no_show_at) and mark_no_show(): the freelancer marks a
--      past booking as a no-show (or undoes it)
--   2. platform_fees: the Nailed It fee, one row, empty until decided. Set it with e.g.
--        update platform_fees set percent = 10, fixed_kr = null where id = 1;
--      and "earnings after fees" appears for every freelancer, no app update needed.
--   3. business_insights(p_from, p_to): every number on the Insights screen for the signed-in
--      freelancer, for appointments dated p_from ≤ date < p_to (null = from their first booking /
--      up to and including today). Definitions:
--        completed      = confirmed and its start time has passed (revenue counts only these)
--        no-show        = marked by the freelancer
--        cancellation   = a booking cancelled by either side (a request withdrawn before it was
--                         answered is not a cancelled booking)
--        late cancel    = cancelled by the customer less than 24 h before the start
--        money lost     = no-shows + late cancels
--        calendar full  = booked time inside availability / available time (exact overlap)
-- ============================================================================

-- 1. No-shows
alter table public.appointments drop constraint if exists appointments_status_check;
alter table public.appointments add constraint appointments_status_check
  check (status in ('pending', 'confirmed', 'declined', 'expired', 'cancelled', 'no_show'));
alter table public.appointments add column if not exists no_show_at timestamptz;

create or replace function public.mark_no_show(p_id uuid, p_no_show boolean default true)
returns appointments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row appointments;
begin
  select * into v_row from appointments where id = p_id for update;
  if not found or v_row.creator_id is distinct from auth.uid() then
    raise exception 'Booking not found.';
  end if;
  if p_no_show then
    if v_row.status <> 'confirmed' or appointment_starts_at(v_row.appointment_date, v_row.start_time) > now() then
      raise exception 'Only a booking that has started can be marked as a no-show.';
    end if;
    update appointments set status = 'no_show', no_show_at = now() where id = p_id returning * into v_row;
  else
    if v_row.status <> 'no_show' then
      raise exception 'This booking is not marked as a no-show.';
    end if;
    update appointments set status = 'confirmed', no_show_at = null where id = p_id returning * into v_row;
  end if;
  return v_row;
end;
$$;

revoke all on function public.mark_no_show(uuid, boolean) from public, anon;
grant execute on function public.mark_no_show(uuid, boolean) to authenticated;

-- 2. The Nailed It fee (not decided yet: both empty)
create table if not exists public.platform_fees (
  id int primary key default 1 check (id = 1),
  percent numeric check (percent is null or (percent >= 0 and percent <= 100)),
  fixed_kr numeric check (fixed_kr is null or fixed_kr >= 0),
  updated_at timestamptz not null default now()
);
insert into public.platform_fees (id) values (1) on conflict (id) do nothing;
alter table public.platform_fees enable row level security;
drop policy if exists "Signed-in users can read the fee" on public.platform_fees;
create policy "Signed-in users can read the fee" on public.platform_fees
  for select to authenticated using (true);

-- 3. Insights
create or replace function public.business_insights(p_from date default null, p_to date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  v_today date := (now() at time zone 'Europe/Stockholm')::date;
  v_from date;
  v_to date;
  v_fee platform_fees;
  v_money jsonb;
  v_clients jsonb;
  v_services jsonb;
  v_hours jsonb;
  v_weekdays jsonb;
  v_fullness jsonb;
  v_series jsonb;
  v_upcoming jsonb;
  v_lead jsonb;
  v_requests jsonb;
  v_avail tsmultirange;
  v_booked tsmultirange;
  v_week boolean;
begin
  if me is null or not exists (select 1 from profiles where id = me and role = 'creator') then
    raise exception 'Only freelancers have business insights.';
  end if;

  v_from := coalesce(p_from, (select min(appointment_date) from appointments where creator_id = me), v_today);
  v_to := coalesce(p_to, v_today + 1);
  select * into v_fee from platform_fees where id = 1;

  -- Money: revenue, average value, fees, cancellations, no-shows, money lost
  with a as (
    select ap.*,
           appointment_starts_at(ap.appointment_date, ap.start_time) as starts_at,
           not (ap.expires_at is not null and ap.decided_at is null) as was_booking
      from appointments ap
     where ap.creator_id = me and ap.appointment_date >= v_from and ap.appointment_date < v_to
  ), m as (
    select
      count(*) filter (where status = 'confirmed' and starts_at <= now()) as completed,
      coalesce(sum(total_price) filter (where status = 'confirmed' and starts_at <= now()), 0) as revenue,
      count(*) filter (where status = 'no_show') as no_shows,
      coalesce(sum(total_price) filter (where status = 'no_show'), 0) as no_show_value,
      count(*) filter (where status = 'cancelled' and was_booking) as cancelled,
      count(*) filter (where status = 'cancelled' and was_booking and cancelled_by = customer_id) as cancelled_by_client,
      count(*) filter (where status = 'cancelled' and was_booking and cancelled_by = creator_id) as cancelled_by_you,
      count(*) filter (where status = 'cancelled' and was_booking and cancelled_by = customer_id
                         and cancelled_at > starts_at - interval '24 hours') as late_cancels,
      coalesce(sum(total_price) filter (where status = 'cancelled' and was_booking and cancelled_by = customer_id
                         and cancelled_at > starts_at - interval '24 hours'), 0) as late_cancel_value,
      count(*) filter (where status = 'confirmed' and starts_at > now()) as upcoming_in_period,
      coalesce(sum(total_price) filter (where status = 'confirmed' and starts_at > now()), 0) as upcoming_in_period_value
    from a
  )
  select jsonb_build_object(
           'completed', completed,
           'revenue', revenue,
           'avg_value', case when completed > 0 then round(revenue / completed, 2) end,
           'fee_set', v_fee.percent is not null or v_fee.fixed_kr is not null,
           'fee_percent', v_fee.percent,
           'fee_fixed_kr', v_fee.fixed_kr,
           'fees', case when v_fee.percent is not null or v_fee.fixed_kr is not null
                        then round(revenue * coalesce(v_fee.percent, 0) / 100 + completed * coalesce(v_fee.fixed_kr, 0), 2) end,
           'earnings_after_fees', case when v_fee.percent is not null or v_fee.fixed_kr is not null
                        then round(revenue - (revenue * coalesce(v_fee.percent, 0) / 100 + completed * coalesce(v_fee.fixed_kr, 0)), 2) end,
           'no_shows', no_shows,
           'no_show_value', no_show_value,
           'no_show_rate', case when completed + no_shows > 0 then round(no_shows::numeric / (completed + no_shows), 4) end,
           'cancelled', cancelled,
           'cancelled_by_client', cancelled_by_client,
           'cancelled_by_you', cancelled_by_you,
           'late_cancels', late_cancels,
           'late_cancel_value', late_cancel_value,
           'cancellation_rate', case when completed + no_shows + cancelled > 0
                                     then round(cancelled::numeric / (completed + no_shows + cancelled), 4) end,
           'money_lost', no_show_value + late_cancel_value,
           'upcoming_in_period', upcoming_in_period,
           'upcoming_in_period_value', upcoming_in_period_value)
    into v_money
    from m;

  -- Clients: new vs returning, rebooking
  with done as (   -- every completed booking with this freelancer, all time
    select customer_id, appointment_starts_at(appointment_date, start_time) as starts_at
      from appointments
     where creator_id = me and status = 'confirmed' and appointment_starts_at(appointment_date, start_time) <= now()
  ), per_client as (
    select customer_id,
           min(starts_at) as first_visit,
           count(*) as visits,
           bool_or(starts_at >= v_from::timestamp at time zone 'Europe/Stockholm'
                   and starts_at < v_to::timestamp at time zone 'Europe/Stockholm') as in_period
      from done group by customer_id
  ), gaps as (
    select extract(epoch from starts_at - lag(starts_at) over (partition by customer_id order by starts_at)) / 86400 as days
      from done
  )
  select jsonb_build_object(
           'clients', count(*) filter (where in_period),
           'new', count(*) filter (where in_period and first_visit >= v_from::timestamp at time zone 'Europe/Stockholm'),
           'returning', count(*) filter (where in_period and first_visit < v_from::timestamp at time zone 'Europe/Stockholm'),
           'rebook_rate', case when count(*) filter (where in_period) > 0
                               then round((count(*) filter (where in_period and visits > 1))::numeric
                                          / count(*) filter (where in_period), 4) end,
           'avg_days_between_visits', (select round(avg(days)::numeric, 1) from gaps where days is not null))
    into v_clients
    from per_client;

  -- Top services (completed bookings): by count and by revenue
  select coalesce(jsonb_agg(jsonb_build_object('name', name, 'bookings', bookings, 'revenue', revenue)
                            order by bookings desc, revenue desc), '[]'::jsonb)
    into v_services
    from (
      select s ->> 'name' as name, count(*) as bookings, coalesce(sum((s ->> 'price')::numeric), 0) as revenue
        from appointments ap, jsonb_array_elements(ap.services) s
       where ap.creator_id = me and ap.status = 'confirmed'
         and appointment_starts_at(ap.appointment_date, ap.start_time) <= now()
         and ap.appointment_date >= v_from and ap.appointment_date < v_to
       group by s ->> 'name'
       order by count(*) desc
       limit 10
    ) t;

  -- Busiest times: hour of day and weekday (everything booked in the period, past and future)
  select jsonb_agg(coalesce(n, 0) order by h) into v_hours
    from generate_series(0, 23) h
    left join (
      select extract(hour from start_time)::int as hr, count(*) as n
        from appointments
       where creator_id = me and status in ('confirmed', 'no_show')
         and appointment_date >= v_from and appointment_date < v_to
       group by 1
    ) c on c.hr = h;
  select jsonb_agg(coalesce(n, 0) order by d) into v_weekdays   -- Monday first
    from generate_series(1, 7) d
    left join (
      select extract(isodow from appointment_date)::int as dow, count(*) as n
        from appointments
       where creator_id = me and status in ('confirmed', 'no_show')
         and appointment_date >= v_from and appointment_date < v_to
       group by 1
    ) c on c.dow = d;

  -- How full the calendar is: booked time inside the availability windows
  select range_agg(tsrange(slot_date + start_time, slot_date + end_time)) into v_avail
    from creator_slots
   where creator_id = me and status = 'available' and slot_date >= v_from and slot_date < v_to;
  select range_agg(r) into v_booked
    from (
      select tsrange(appointment_date + start_time, appointment_date + end_time) as r
        from appointments
       where creator_id = me and status in ('confirmed', 'no_show', 'pending')
         and appointment_date >= v_from and appointment_date < v_to
      union all
      select tsrange(slot_date + start_time, slot_date + end_time)
        from creator_slots
       where creator_id = me and status = 'booked' and slot_date >= v_from and slot_date < v_to
    ) b;
  with avail_min as (
    select coalesce(sum(extract(epoch from upper(r) - lower(r)) / 60), 0) as m from unnest(coalesce(v_avail, '{}'::tsmultirange)) r
  ), booked_in as (
    select coalesce(sum(extract(epoch from upper(r) - lower(r)) / 60), 0) as m
      from unnest(coalesce(v_avail, '{}'::tsmultirange) * coalesce(v_booked, '{}'::tsmultirange)) r
  ), booked_all as (
    select coalesce(sum(extract(epoch from upper(r) - lower(r)) / 60), 0) as m from unnest(coalesce(v_booked, '{}'::tsmultirange)) r
  )
  select jsonb_build_object(
           'available_minutes', round(avail_min.m),
           'booked_minutes', round(booked_all.m),
           'booked_in_availability_minutes', round(booked_in.m),
           'rate', case when avail_min.m > 0 then round(booked_in.m / avail_min.m, 4) end)
    into v_fullness
    from avail_min, booked_in, booked_all;

  -- Earnings over time: per week (periods up to ~3 months) or per month, up to today
  v_week := v_to - v_from <= 100;
  select coalesce(jsonb_agg(jsonb_build_object('start', b.bucket::date, 'revenue', coalesce(x.revenue, 0), 'bookings', coalesce(x.n, 0))
                            order by b.bucket), '[]'::jsonb)
    into v_series
    from generate_series(
           date_trunc(case when v_week then 'week' else 'month' end, v_from::timestamp),
           date_trunc(case when v_week then 'week' else 'month' end, least(v_to - 1, v_today)::timestamp),
           case when v_week then interval '1 week' else interval '1 month' end) as b(bucket)
    left join (
      select date_trunc(case when v_week then 'week' else 'month' end, appointment_date::timestamp) as bucket,
             sum(total_price) as revenue, count(*) as n
        from appointments
       where creator_id = me and status = 'confirmed'
         and appointment_starts_at(appointment_date, start_time) <= now()
         and appointment_date >= v_from and appointment_date < v_to
       group by 1
    ) x on x.bucket = b.bucket;

  -- Upcoming booked revenue (from now on, regardless of the chosen period)
  select jsonb_build_object(
           'next_7_days', coalesce(sum(total_price) filter (where starts_at <= now() + interval '7 days'), 0),
           'next_7_days_bookings', count(*) filter (where starts_at <= now() + interval '7 days'),
           'next_30_days', coalesce(sum(total_price) filter (where starts_at <= now() + interval '30 days'), 0),
           'next_30_days_bookings', count(*) filter (where starts_at <= now() + interval '30 days'),
           'all', coalesce(sum(total_price), 0),
           'all_bookings', count(*))
    into v_upcoming
    from (
      select total_price, appointment_starts_at(appointment_date, start_time) as starts_at
        from appointments
       where creator_id = me and status = 'confirmed'
         and appointment_starts_at(appointment_date, start_time) > now()
    ) u;

  -- Lead time: how far ahead clients book (bookings made for appointments in the period)
  with l as (
    select appointment_date - (created_at at time zone 'Europe/Stockholm')::date as days
      from appointments
     where creator_id = me and status in ('confirmed', 'no_show', 'cancelled')
       and not (expires_at is not null and decided_at is null)
       and appointment_date >= v_from and appointment_date < v_to
  )
  select jsonb_build_object(
           'same_day', count(*) filter (where days <= 0),
           'within_week', count(*) filter (where days between 1 and 7),
           'within_month', count(*) filter (where days between 8 and 30),
           'later', count(*) filter (where days > 30),
           'median_days', (select percentile_cont(0.5) within group (order by days) from l))
    into v_lead
    from l;

  -- Booking requests (manual approval): answered how, and how fast
  with q as (
    select status, decided_at, created_at
      from appointments
     where creator_id = me and expires_at is not null
       and (created_at at time zone 'Europe/Stockholm')::date >= v_from
       and (created_at at time zone 'Europe/Stockholm')::date < v_to
  ), c as (
    select
      count(*) as total,
      count(*) filter (where decided_at is not null and status not in ('declined', 'expired')) as accepted,
      count(*) filter (where status = 'declined') as declined,
      count(*) filter (where status = 'expired') as expired,
      count(*) filter (where status = 'cancelled' and decided_at is null) as withdrawn,
      count(*) filter (where status = 'pending') as waiting,
      avg(extract(epoch from decided_at - created_at) / 60) filter (where decided_at is not null and status <> 'expired') as avg_minutes
    from q
  )
  select jsonb_build_object(
           'total', total, 'accepted', accepted, 'declined', declined, 'expired', expired,
           'withdrawn', withdrawn, 'waiting', waiting,
           'acceptance_rate', case when accepted + declined + expired > 0
                                   then round(accepted::numeric / (accepted + declined + expired), 4) end,
           'avg_response_minutes', round(avg_minutes::numeric))
    into v_requests
    from c;

  return jsonb_build_object(
    'from', v_from, 'to', v_to,
    'money', v_money,
    'clients', v_clients,
    'services', v_services,
    'hours', v_hours,
    'weekdays', v_weekdays,
    'fullness', v_fullness,
    'series', v_series,
    'series_unit', case when v_week then 'week' else 'month' end,
    'upcoming', v_upcoming,
    'lead_time', v_lead,
    'requests', v_requests);
end;
$$;

revoke all on function public.business_insights(date, date) from public, anon;
grant execute on function public.business_insights(date, date) to authenticated;
