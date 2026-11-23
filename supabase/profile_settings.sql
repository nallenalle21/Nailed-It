-- ============================================================================
-- Nailed It: what a freelancer can change on their profile
-- Applied to the project as migration "profile_settings". Kept here for reference.
--
--   1. profiles: bio, languages, accessibility, pause/vacation, cancellation notice, deposit,
--      returning-client discount (shown only), weekly schedule template
--   2. vendor_posts.tags (portfolio tags by service/style)
--   3. service_bundles: combined treatments (shown on the profile; not bookable as such)
--   4. notification_settings (+ send_push respects them)
--   5. update_my_profile(): saves the fields in 1 (each checked)
--   6. Pause: no bookings and no free times on paused dates; an open-ended pause hides the
--      freelancer from the Book view and the date filter (the profile stays reachable)
--   7. cancel_appointment(): customers can't cancel a confirmed booking inside the notice period
--   8. fill_weekly_schedule(): copies the weekly template into the calendar for N weeks
-- ============================================================================

-- 1. Profile fields (public: customers see them on the profile)
alter table public.profiles add column if not exists bio text;
alter table public.profiles add column if not exists languages text[] not null default '{}';
alter table public.profiles add column if not exists accessibility text[] not null default '{}';
alter table public.profiles add column if not exists accessibility_note text;
alter table public.profiles add column if not exists paused boolean not null default false;
alter table public.profiles add column if not exists pause_from date;
alter table public.profiles add column if not exists pause_until date;
alter table public.profiles add column if not exists cancel_notice_hours int not null default 0;
alter table public.profiles add column if not exists deposit_enabled boolean not null default false;
alter table public.profiles add column if not exists deposit_type text;
alter table public.profiles add column if not exists deposit_amount numeric;
alter table public.profiles add column if not exists deposit_instructions text;
alter table public.profiles add column if not exists returning_discount_percent int;
alter table public.profiles add column if not exists weekly_schedule jsonb not null default '[]'::jsonb;

alter table public.profiles drop constraint if exists profiles_bio_check;
alter table public.profiles add constraint profiles_bio_check check (bio is null or char_length(bio) <= 300);
alter table public.profiles drop constraint if exists profiles_accessibility_check;
alter table public.profiles add constraint profiles_accessibility_check
  check (accessibility <@ array['step_free', 'elevator', 'stairs', 'parking', 'public_transport', 'wheelchair']);
alter table public.profiles drop constraint if exists profiles_cancel_notice_check;
alter table public.profiles add constraint profiles_cancel_notice_check check (cancel_notice_hours in (0, 24, 48, 168));
alter table public.profiles drop constraint if exists profiles_deposit_check;
alter table public.profiles add constraint profiles_deposit_check
  check (deposit_type is null or deposit_type in ('kr', 'percent'));
alter table public.profiles drop constraint if exists profiles_returning_discount_check;
alter table public.profiles add constraint profiles_returning_discount_check
  check (returning_discount_percent is null or returning_discount_percent between 1 and 50);

-- Is the freelancer on a break on this date?
create or replace function public.pause_active(p_paused boolean, p_from date, p_until date, p_day date)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_paused, false)
     and (p_from is null or p_day >= p_from)
     and (p_until is null or p_day <= p_until);
$$;

-- 2. Portfolio tags
alter table public.vendor_posts add column if not exists tags text[] not null default '{}';

-- 3. Combined treatments
create table if not exists public.service_bundles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 2 and 60),
  service_ids uuid[] not null default '{}',
  duration_minutes int not null check (duration_minutes between 15 and 600),
  price numeric not null check (price >= 0),
  created_at timestamptz not null default now()
);
alter table public.service_bundles enable row level security;
drop policy if exists "Bundles are public" on public.service_bundles;
create policy "Bundles are public" on public.service_bundles for select using (true);
drop policy if exists "Owner manages bundles" on public.service_bundles;
create policy "Owner manages bundles" on public.service_bundles
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- 4. Notification settings (everyone; a missing row = everything on)
create table if not exists public.notification_settings (
  user_id uuid primary key default auth.uid() references public.profiles (id) on delete cascade,
  new_bookings boolean not null default true,
  booking_requests boolean not null default true,
  cancellations boolean not null default true,
  reminders boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.notification_settings enable row level security;
drop policy if exists "Owner manages notification settings" on public.notification_settings;
create policy "Owner manages notification settings" on public.notification_settings
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create or replace function public.send_push(p_user uuid, p_title text, p_body text, p_data jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  messages jsonb;
  s notification_settings;
  v_kind text;
begin
  if p_user is null then return; end if;

  -- Respect the person's notification settings.
  select * into s from notification_settings where user_id = p_user;
  if found then
    v_kind := case
      when p_data ->> 'type' = 'reminder' then 'reminders'
      when p_data ->> 'type' = 'booking_request' then 'booking_requests'
      when p_title ~* '(cancel|withdrawn|declined|expired)' then 'cancellations'
      else 'new_bookings'
    end;
    if (v_kind = 'reminders' and not s.reminders)
       or (v_kind = 'booking_requests' and not s.booking_requests)
       or (v_kind = 'cancellations' and not s.cancellations)
       or (v_kind = 'new_bookings' and not s.new_bookings) then
      return;
    end if;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'to', token,
           'title', p_title,
           'body', p_body,
           'sound', 'default',
           'channelId', 'default',
           'data', p_data
         )), '[]'::jsonb)
    into messages
    from public.push_tokens
   where user_id = p_user;

  if jsonb_array_length(messages) = 0 then return; end if;

  -- Sent in the background by pg_net; a failed send never blocks the booking itself.
  perform net.http_post(
    url     := 'https://exp.host/--/api/v2/push/send',
    body    := messages,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Accept', 'application/json')
  );
end;
$function$;

-- 5. Saving profile settings
create or replace function public.update_my_profile(p_data jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  v text;
  arr text[];
  e jsonb;
begin
  if me is null or not exists (select 1 from profiles where id = me and role = 'creator') then
    raise exception 'Only freelancers have these settings.';
  end if;
  p_data := coalesce(p_data, '{}'::jsonb);

  if p_data ? 'bio' then
    v := nullif(trim(p_data ->> 'bio'), '');
    if char_length(v) > 300 then raise exception 'Keep your bio under 300 characters.'; end if;
    update profiles set bio = v where id = me;
  end if;

  if p_data ? 'languages' then
    select coalesce(array_agg(distinct trim(x)) filter (where trim(x) <> ''), '{}') into arr
      from jsonb_array_elements_text(p_data -> 'languages') x;
    if cardinality(arr) > 12 then raise exception 'Choose up to 12 languages.'; end if;
    update profiles set languages = arr where id = me;
  end if;

  if p_data ? 'accessibility' then
    select coalesce(array_agg(distinct x), '{}') into arr from jsonb_array_elements_text(p_data -> 'accessibility') x;
    if not arr <@ array['step_free', 'elevator', 'stairs', 'parking', 'public_transport', 'wheelchair'] then
      raise exception 'Unknown accessibility option.';
    end if;
    update profiles set accessibility = arr where id = me;
  end if;

  if p_data ? 'accessibility_note' then
    v := nullif(trim(p_data ->> 'accessibility_note'), '');
    if char_length(v) > 200 then raise exception 'Keep the note under 200 characters.'; end if;
    update profiles set accessibility_note = v where id = me;
  end if;

  if p_data ? 'paused' then
    if coalesce((p_data ->> 'paused')::boolean, false) then
      if (p_data ->> 'pause_until') is not null
         and (p_data ->> 'pause_until')::date < coalesce((p_data ->> 'pause_from')::date, current_date) then
        raise exception 'The break has to end after it starts.';
      end if;
      update profiles set paused = true,
                          pause_from = (p_data ->> 'pause_from')::date,
                          pause_until = (p_data ->> 'pause_until')::date
       where id = me;
    else
      update profiles set paused = false, pause_from = null, pause_until = null where id = me;
    end if;
  end if;

  if p_data ? 'cancel_notice_hours' then
    update profiles set cancel_notice_hours = (p_data ->> 'cancel_notice_hours')::int where id = me;
  end if;

  if p_data ? 'deposit_enabled' then
    if coalesce((p_data ->> 'deposit_enabled')::boolean, false) then
      if (p_data ->> 'deposit_type') not in ('kr', 'percent')
         or (p_data ->> 'deposit_amount')::numeric is null
         or (p_data ->> 'deposit_amount')::numeric <= 0
         or ((p_data ->> 'deposit_type') = 'percent' and (p_data ->> 'deposit_amount')::numeric > 100) then
        raise exception 'Enter a deposit amount (kr, or 1–100 %%).';
      end if;
      v := nullif(trim(p_data ->> 'deposit_instructions'), '');
      if char_length(v) > 200 then raise exception 'Keep the payment instructions under 200 characters.'; end if;
      update profiles set deposit_enabled = true,
                          deposit_type = p_data ->> 'deposit_type',
                          deposit_amount = round((p_data ->> 'deposit_amount')::numeric, 2),
                          deposit_instructions = v
       where id = me;
    else
      update profiles set deposit_enabled = false where id = me;
    end if;
  end if;

  if p_data ? 'returning_discount_percent' then
    update profiles set returning_discount_percent = (p_data ->> 'returning_discount_percent')::int where id = me;
  end if;

  if p_data ? 'weekly_schedule' then
    if jsonb_typeof(p_data -> 'weekly_schedule') <> 'array' or jsonb_array_length(p_data -> 'weekly_schedule') > 21 then
      raise exception 'Invalid weekly schedule.';
    end if;
    for e in select * from jsonb_array_elements(p_data -> 'weekly_schedule') loop
      if (e ->> 'day')::int not between 1 and 7
         or (e ->> 'start')::time >= (e ->> 'end')::time then
        raise exception 'Each day needs a start time before its end time.';
      end if;
    end loop;
    update profiles set weekly_schedule = p_data -> 'weekly_schedule' where id = me;
  end if;
end;
$$;

revoke all on function public.update_my_profile(jsonb) from public, anon;
grant execute on function public.update_my_profile(jsonb) to authenticated;

-- 6. Pause: schedule without paused dates, no booking on them, open-ended pause hidden from Book/date filter
create or replace function public.get_creator_schedule(p_creator uuid, p_from date, p_to date)
returns table(kind text, slot_date date, start_time time without time zone, end_time time without time zone)
language sql
stable security definer
set search_path to 'public'
as $function$
  select 'available'::text, s.slot_date, s.start_time, s.end_time
    from creator_slots s
    join profiles pr on pr.id = s.creator_id
   where s.creator_id = p_creator and s.status = 'available'
     and s.slot_date between p_from and p_to
     and not pause_active(pr.paused, pr.pause_from, pr.pause_until, s.slot_date)
  union all
  select 'busy'::text, s.slot_date, s.start_time, s.end_time
    from creator_slots s
   where s.creator_id = p_creator and s.status = 'booked'
     and s.slot_date between p_from and p_to
  union all
  select 'busy'::text, a.appointment_date, a.start_time, a.end_time
    from appointments a
   where a.creator_id = p_creator and a.status in ('confirmed', 'pending')
     and a.appointment_date between p_from and p_to;
$function$;

create or replace function public.creators_available_on(p_date date)
returns setof uuid
language sql
stable security definer
set search_path to 'public'
as $function$
  select distinct s.creator_id
    from creator_slots s
    join profiles pr on pr.id = s.creator_id and pr.is_live
                    and not pause_active(pr.paused, pr.pause_from, pr.pause_until, p_date)
   where s.slot_date = p_date and s.status = 'available'
     and not exists (
       select 1 from creator_slots b
        where b.creator_id = s.creator_id and b.slot_date = p_date and b.status = 'booked'
          and b.start_time <= s.start_time and b.end_time >= s.end_time)
     and not exists (
       select 1 from appointments a
        where a.creator_id = s.creator_id and a.appointment_date = p_date
          and a.status in ('confirmed', 'pending')
          and a.start_time <= s.start_time and a.end_time >= s.end_time);
$function$;

-- Booking: not on a paused date (otherwise as in freelancer_onboarding.sql)
create or replace function public.book_appointment(p_creator uuid, p_date date, p_start time without time zone, p_service_ids uuid[])
returns appointments
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  v_quote jsonb;
  v_services jsonb;
  v_customer_name text;
  v_creator_name text;
  v_auto boolean;
  v_row appointments;
begin
  if v_user is null then
    raise exception 'Please sign in to book.';
  end if;
  if v_user = p_creator then
    raise exception 'You cannot book your own calendar.';
  end if;
  if not exists (select 1 from profiles where id = p_creator and role = 'creator') then
    raise exception 'Creator not found.';
  end if;
  if not exists (select 1 from profiles where id = p_creator and is_live) then
    raise exception 'This nail tech isn''t taking bookings yet.';
  end if;
  if exists (select 1 from profiles where id = p_creator and pause_active(paused, pause_from, pause_until, p_date)) then
    raise exception 'This nail tech is taking a break on that date.';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_creator::text));

  v_quote := _booking_quote(p_creator, p_date, p_start, p_service_ids);
  if not (v_quote ->> 'ok')::boolean then
    raise exception '%', v_quote ->> 'reason';
  end if;

  select jsonb_agg(jsonb_build_object(
           'id', id, 'name', name, 'duration_minutes', duration_minutes,
           'price', coalesce(discount_price, price)) order by name)
    into v_services
    from services where user_id = p_creator and id = any (p_service_ids);

  select coalesce(nullif(trim(username), ''), 'Customer') into v_customer_name from profiles where id = v_user;
  select coalesce(nullif(trim(username), ''), 'Creator'), coalesce(auto_accept_bookings, true)
    into v_creator_name, v_auto
    from profiles where id = p_creator;

  begin
    insert into appointments (creator_id, customer_id, creator_name, customer_name, appointment_date,
                              start_time, end_time, total_minutes, total_price, services, status, expires_at)
    values (p_creator, v_user, v_creator_name, coalesce(v_customer_name, 'Customer'), p_date, p_start,
            (v_quote ->> 'end_time')::time, (v_quote ->> 'total_minutes')::int,
            (v_quote ->> 'total_price')::numeric, v_services,
            case when v_auto then 'confirmed' else 'pending' end,
            case when v_auto then null
                 else least(now() + interval '24 hours', public.appointment_starts_at(p_date, p_start)) end)
    returning * into v_row;
  exception when exclusion_violation then
    raise exception 'That time was just booked by someone else.';
  end;

  return v_row;
end;
$function$;

-- 7. Cancelling: customers can't cancel a confirmed booking inside the freelancer's notice period
create or replace function public.cancel_appointment(p_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  me uuid := auth.uid();
  v_row appointments;
  v_reason text := nullif(left(trim(p_reason), 300), '');
  v_was text;
  v_notice int;
  v_starts timestamptz;
begin
  select * into v_row from public.appointments where id = p_id for update;
  if not found or me is null or me not in (v_row.customer_id, v_row.creator_id) then
    raise exception 'Booking not found.';
  end if;
  v_starts := public.appointment_starts_at(v_row.appointment_date::date, v_row.start_time::time);
  if v_row.status not in ('confirmed', 'pending') or v_starts <= now() then
    raise exception 'This booking can no longer be cancelled.';
  end if;

  select cancel_notice_hours into v_notice from public.profiles where id = v_row.creator_id;
  if me = v_row.customer_id and v_row.status = 'confirmed' and coalesce(v_notice, 0) > 0
     and v_starts - now() < make_interval(hours => v_notice) then
    raise exception 'Bookings can''t be cancelled in the app less than % hours before. Message @% to cancel.',
      v_notice, v_row.creator_name;
  end if;
  v_was := v_row.status;

  update public.appointments
     set status = 'cancelled',
         cancelled_by = me,
         cancelled_at = now(),
         cancel_reason = v_reason
   where id = p_id;

  insert into public.messages (chat_id, sender_id, text)
  values (
    public.chat_id_for(v_row.creator_id, v_row.customer_id),
    me,
    case
      when v_was = 'pending' and me = v_row.customer_id then 'Withdrew the booking request: '
      when v_was = 'pending' then 'Declined the booking request: '
      else 'Cancelled the booking: '
    end
    || public.appointment_services_text(v_row.services) || ' · '
    || public.appointment_when(v_row.appointment_date, v_row.start_time)
    || coalesce(E'\n' || v_reason, ''));
end;
$function$;

revoke all on function public.cancel_appointment(uuid, text) from public, anon;
grant execute on function public.cancel_appointment(uuid, text) to authenticated;

-- 8. Weekly schedule → calendar: adds the template's hours for the next p_weeks weeks.
-- Days that already have availability overlapping a template window, and paused days, are skipped.
create or replace function public.fill_weekly_schedule(p_weeks int default 4)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  p profiles;
  v_now timestamp := now() at time zone 'Europe/Stockholm';
  d date;
  e jsonb;
  n int := 0;
begin
  select * into p from profiles where id = me and role = 'creator';
  if not found then
    raise exception 'Only freelancers have a schedule.';
  end if;
  if jsonb_array_length(p.weekly_schedule) = 0 then
    raise exception 'Set your weekly hours first.';
  end if;

  for d in select generate_series(v_now::date, v_now::date + least(greatest(coalesce(p_weeks, 4), 1), 12) * 7 - 1, interval '1 day')::date loop
    continue when pause_active(p.paused, p.pause_from, p.pause_until, d);
    for e in select * from jsonb_array_elements(p.weekly_schedule) x where (x ->> 'day')::int = extract(isodow from d) loop
      continue when d + (e ->> 'start')::time <= v_now;
      continue when exists (
        select 1 from creator_slots
         where creator_id = me and slot_date = d and status = 'available'
           and start_time < (e ->> 'end')::time and end_time > (e ->> 'start')::time);
      insert into creator_slots (creator_id, slot_date, start_time, end_time, service, status)
      values (me, d, (e ->> 'start')::time, (e ->> 'end')::time, 'Available', 'available');
      n := n + 1;
    end loop;
  end loop;
  return n;
end;
$$;

revoke all on function public.fill_weekly_schedule(int) from public, anon;
grant execute on function public.fill_weekly_schedule(int) to authenticated;

-- Book view: no free times on paused dates; open-ended pause hides the freelancer
create or replace function public.find_bookable_creators(
  p_date date default null,
  p_service text default null,
  p_creator uuid default null,
  p_times int default 3
)
returns table (
  id uuid,
  username text,
  display_name text,
  avatar_path text,
  city text,
  area_lat double precision,
  area_lng double precision,
  categories text[],
  workplace_types text[],
  travel_km int,
  from_price numeric,
  service_names text[],
  service_id uuid,
  service_name text,
  next_times jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  with params as (
    select (now() at time zone 'Europe/Stockholm') as local_now,
           nullif(lower(trim(coalesce(p_service, ''))), '') as service_q,
           least(greatest(coalesce(p_times, 3), 1), 10) as max_times
  ),
  creators as (
    select p.*
      from public.profiles p
     cross join params
     where p.role = 'creator' and p.is_live and (p_creator is null or p.id = p_creator)
       -- an open-ended break hides them; a break with an end date only removes those dates
       and not (p.paused and p.pause_until is null and coalesce(p.pause_from, params.local_now::date) <= params.local_now::date)
  ),
  chosen as (
    select distinct on (s.user_id) s.user_id, s.id as service_id, s.name, s.duration_minutes
      from public.services s
      join creators c on c.id = s.user_id
      cross join params
     where params.service_q is null
        or lower(s.name) like '%' || params.service_q || '%'
        or lower(coalesce(s.category, '')) like '%' || params.service_q || '%'
     order by s.user_id, s.duration_minutes, coalesce(s.discount_price, s.price), s.name
  ),
  candidates as (
    select w.creator_id, w.slot_date, (t)::time as start_time,
           ((t)::time + make_interval(mins => ch.duration_minutes)) as end_time
      from public.creator_slots w
      join chosen ch on ch.user_id = w.creator_id
      join creators cr on cr.id = w.creator_id
      cross join params
      cross join lateral generate_series(
        w.slot_date + make_interval(mins => (ceil(extract(epoch from w.start_time) / 900) * 15)::int),
        w.slot_date + w.end_time - make_interval(mins => ch.duration_minutes),
        interval '15 minutes'
      ) as t
     where w.status = 'available'
       and w.slot_date between coalesce(p_date, params.local_now::date)
                           and coalesce(p_date, params.local_now::date + 14)
       and t > params.local_now
       and not pause_active(cr.paused, cr.pause_from, cr.pause_until, w.slot_date)
  ),
  free as (
    select c.*,
           row_number() over (partition by c.creator_id order by c.slot_date, c.start_time) as rn
      from candidates c
     where not exists (
             select 1 from public.appointments a
              where a.creator_id = c.creator_id and a.appointment_date = c.slot_date
                and a.status in ('confirmed', 'pending')
                and a.start_time < c.end_time and a.end_time > c.start_time)
       and not exists (
             select 1 from public.creator_slots b
              where b.creator_id = c.creator_id and b.slot_date = c.slot_date and b.status = 'booked'
                and b.start_time < c.end_time and b.end_time > c.start_time)
  )
  select c.id,
         c.username,
         c.display_name,
         va.storage_path,
         coalesce(c.area, nullif(trim(u.raw_user_meta_data ->> 'city'), '')),
         c.area_lat,
         c.area_lng,
         c.categories,
         c.workplace_types,
         c.travel_km,
         (select min(coalesce(s.discount_price, s.price)) from public.services s where s.user_id = c.id),
         (select array_agg(s.name order by s.name) from public.services s where s.user_id = c.id),
         ch.service_id,
         ch.name,
         coalesce((
           select jsonb_agg(jsonb_build_object('date', f.slot_date, 'start', to_char(f.start_time, 'HH24:MI'))
                            order by f.slot_date, f.start_time)
             from free f cross join params
            where f.creator_id = c.id and f.rn <= params.max_times
         ), '[]'::jsonb)
    from creators c
    join chosen ch on ch.user_id = c.id
    left join auth.users u on u.id = c.id
    left join public.vendor_avatars va on va.vendor_id = c.id
   where p_date is null or exists (select 1 from free f where f.creator_id = c.id);
$$;

revoke all on function public.find_bookable_creators(date, text, uuid, int) from public, anon;
grant execute on function public.find_bookable_creators(date, text, uuid, int) to authenticated;

notify pgrst, 'reload schema';
