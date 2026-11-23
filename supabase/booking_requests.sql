-- ============================================================================
-- Nailed It: booking requests (freelancer approves bookings manually)
-- Applied to the project as migration "booking_requests". Kept here for reference.
--
-- Settings → "Accept bookings automatically" (profiles.auto_accept_bookings):
--   on  (default) → bookings are confirmed straight away, as before
--   off           → bookings arrive as status 'pending' and hold the time slot until the
--                   freelancer accepts or declines, or the request expires
--                   (24 h after it was made, or at its start time if that is sooner).
--
-- Adds/changes:
--   1. profiles.auto_accept_bookings
--   2. appointments: statuses 'pending' / 'declined' / 'expired', plus expires_at, decided_at,
--      decline_reason, seen_by_creator_at (for the "new" dot in the freelancer's flow)
--   3. Pending requests count as taken everywhere: overlap constraint, quote, schedule,
--      Explore date filter, chat offers
--   4. book_appointment(): pending when the freelancer approves manually
--   5. set_auto_accept_bookings(), respond_booking_request(), mark_bookings_seen(),
--      expire_booking_requests() (+ cron every 5 min), cancel_appointment() also for pending
--   6. Push notifications for requests (in notify_appointment_change)
-- ============================================================================

-- 1. The setting
alter table public.profiles add column if not exists auto_accept_bookings boolean not null default true;

-- 2. Request statuses and fields
alter table public.appointments drop constraint if exists appointments_status_check;
alter table public.appointments add constraint appointments_status_check
  check (status in ('pending', 'confirmed', 'declined', 'expired', 'cancelled'));

alter table public.appointments add column if not exists expires_at timestamptz;
alter table public.appointments add column if not exists decided_at timestamptz;
alter table public.appointments add column if not exists decline_reason text;
alter table public.appointments add column if not exists seen_by_creator_at timestamptz;

alter table public.appointments drop constraint if exists appointments_decline_reason_check;
alter table public.appointments add constraint appointments_decline_reason_check
  check (decline_reason is null or char_length(decline_reason) <= 300);

-- Bookings that existed before this change are not "new" in the flow.
update public.appointments set seen_by_creator_at = created_at where seen_by_creator_at is null;

create index if not exists appointments_pending_expiry_idx
  on public.appointments (expires_at) where status = 'pending';

-- 3. A pending request holds its slot, so nobody else can take it meanwhile.
alter table public.appointments drop constraint if exists appointments_no_overlap;
alter table public.appointments add constraint appointments_no_overlap
  exclude using gist (
    creator_id with =,
    tsrange(appointment_date + start_time, appointment_date + end_time) with &&
  ) where (status in ('confirmed', 'pending'));

create or replace function public._booking_quote(p_creator uuid, p_date date, p_start time without time zone, p_service_ids uuid[])
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare
  v_requested int;
  v_found int;
  v_minutes int;
  v_price numeric;
  v_end time;
  v_window_end time;
  v_next_end time;
begin
  if p_date is null or p_start is null then
    return jsonb_build_object('ok', false, 'reason', 'Choose a date and start time.');
  end if;
  if coalesce(cardinality(p_service_ids), 0) = 0 then
    return jsonb_build_object('ok', false, 'reason', 'Choose at least one service.');
  end if;
  if p_date < current_date then
    return jsonb_build_object('ok', false, 'reason', 'That date has already passed.');
  end if;

  select count(distinct x) into v_requested from unnest(p_service_ids) as x;
  select count(*), coalesce(sum(duration_minutes), 0), coalesce(sum(coalesce(discount_price, price)), 0)
    into v_found, v_minutes, v_price
    from services
   where user_id = p_creator and id = any (p_service_ids);
  if v_found <> v_requested then
    return jsonb_build_object('ok', false, 'reason', 'One of the services is no longer offered.');
  end if;

  if v_minutes > extract(epoch from (time '23:59:00' - p_start)) / 60 then
    return jsonb_build_object('ok', false, 'reason', 'The services would run past midnight.');
  end if;
  v_end := p_start + make_interval(mins => v_minutes);

  -- Availability must contain the start; touching/overlapping windows are chained together.
  select max(end_time) into v_window_end
    from creator_slots
   where creator_id = p_creator and slot_date = p_date and status = 'available'
     and start_time <= p_start and end_time > p_start;
  if v_window_end is null then
    return jsonb_build_object('ok', false, 'reason', 'The creator is not available at that start time.');
  end if;
  loop
    select max(end_time) into v_next_end
      from creator_slots
     where creator_id = p_creator and slot_date = p_date and status = 'available'
       and start_time <= v_window_end and end_time > v_window_end;
    exit when v_next_end is null;
    v_window_end := v_next_end;
  end loop;

  if v_end > v_window_end then
    return jsonb_build_object('ok', false,
      'reason', format('These services take %s min, but only %s min are available from %s.',
        v_minutes, (extract(epoch from (v_window_end - p_start)) / 60)::int, to_char(p_start, 'HH24:MI')));
  end if;

  if exists (select 1 from creator_slots
              where creator_id = p_creator and slot_date = p_date and status = 'booked'
                and start_time < v_end and end_time > p_start)
     or exists (select 1 from appointments
                 where creator_id = p_creator and appointment_date = p_date
                   and status in ('confirmed', 'pending')
                   and start_time < v_end and end_time > p_start) then
    return jsonb_build_object('ok', false, 'reason', 'That time overlaps an existing booking.');
  end if;

  return jsonb_build_object('ok', true, 'total_minutes', v_minutes, 'total_price', v_price,
                            'end_time', to_char(v_end, 'HH24:MI'));
end;
$function$;

create or replace function public.get_creator_schedule(p_creator uuid, p_from date, p_to date)
returns table(kind text, slot_date date, start_time time without time zone, end_time time without time zone)
language sql
stable security definer
set search_path to 'public'
as $function$
  select 'available'::text, s.slot_date, s.start_time, s.end_time
    from creator_slots s
   where s.creator_id = p_creator and s.status = 'available'
     and s.slot_date between p_from and p_to
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

create or replace function public.offer_slot_taken(p_creator uuid, p_date date, p_start time, p_end time)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.appointments
     where creator_id = p_creator
       and status in ('confirmed', 'pending')
       and appointment_date = p_date
       and start_time < p_end
       and end_time > p_start
  ) then
    return true;
  end if;

  if to_regclass('public.creator_slots') is not null then
    if exists (
      select 1 from public.creator_slots
       where creator_id = p_creator
         and status = 'booked'
         and slot_date = p_date
         and start_time < p_end
         and end_time > p_start
    ) then
      return true;
    end if;
  end if;

  return false;
end;
$$;

-- 4. Booking: pending when the freelancer approves manually
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

  -- Serialise bookings per creator so the availability check and insert cannot interleave.
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

-- 5a. Settings switch
create or replace function public.set_auto_accept_bookings(p_auto boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles set auto_accept_bookings = coalesce(p_auto, true)
   where id = auth.uid() and role = 'creator';
  if not found then
    raise exception 'Only freelancers can change this setting.';
  end if;
end;
$$;

revoke all on function public.set_auto_accept_bookings(boolean) from public, anon;
grant execute on function public.set_auto_accept_bookings(boolean) to authenticated;

-- Chat between two people, built the same way as the app does ([a, b].sort().join('_')).
create or replace function public.chat_id_for(p_a uuid, p_b uuid)
returns text
language sql
immutable
set search_path = ''
as $
  select least(p_a::text collate "C", p_b::text collate "C") || '_' || greatest(p_a::text collate "C", p_b::text collate "C");
$$;

-- 5b. Freelancer answers a request. The customer gets a chat message either way.
create or replace function public.respond_booking_request(p_id uuid, p_accept boolean, p_reason text default null)
returns appointments
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  v_row appointments;
  v_reason text := nullif(left(trim(p_reason), 300), '');
  v_what text;
begin
  select * into v_row from appointments where id = p_id for update;
  if not found or v_row.creator_id is distinct from me then
    raise exception 'Booking request not found.';
  end if;
  if v_row.status <> 'pending' then
    raise exception 'This request has already been answered.';
  end if;
  if v_row.expires_at is not null and v_row.expires_at <= now() then
    raise exception 'This request has expired.';
  end if;

  update appointments
     set status = case when p_accept then 'confirmed' else 'declined' end,
         decided_at = now(),
         decline_reason = case when p_accept then null else v_reason end,
         seen_by_creator_at = coalesce(seen_by_creator_at, now())
   where id = p_id
  returning * into v_row;

  v_what := appointment_services_text(v_row.services) || ' · ' || appointment_when(v_row.appointment_date, v_row.start_time);
  insert into messages (chat_id, sender_id, text)
  values (
    chat_id_for(v_row.creator_id, v_row.customer_id),
    me,
    case when p_accept
      then 'Accepted your booking request: ' || v_what
      else 'Declined your booking request: ' || v_what || coalesce(E'\n' || v_reason, '')
    end);

  return v_row;
end;
$$;

revoke all on function public.respond_booking_request(uuid, boolean, text) from public, anon;
grant execute on function public.respond_booking_request(uuid, boolean, text) to authenticated;

-- 5c. The freelancer has looked at their flow: no more "new" dots.
create or replace function public.mark_bookings_seen()
returns void
language sql
security definer
set search_path = public
as $$
  update appointments set seen_by_creator_at = now()
   where creator_id = auth.uid() and seen_by_creator_at is null and status <> 'pending';
$$;

revoke all on function public.mark_bookings_seen() from public, anon;
grant execute on function public.mark_bookings_seen() to authenticated;

-- 5d. Unanswered requests expire and free their slot (cron, every 5 minutes).
create or replace function public.expire_booking_requests()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r appointments;
begin
  for r in
    update appointments set status = 'expired', decided_at = now()
     where status = 'pending' and expires_at <= now()
    returning *
  loop
    insert into messages (chat_id, sender_id, text)
    values (chat_id_for(r.creator_id, r.customer_id), null,
            'Booking request expired without an answer: ' || appointment_services_text(r.services)
              || ' · ' || appointment_when(r.appointment_date, r.start_time));
  end loop;
end;
$$;

revoke all on function public.expire_booking_requests() from public, anon, authenticated;

select cron.schedule('expire-booking-requests', '*/5 * * * *', 'select public.expire_booking_requests()');

-- 5e. Customers can also withdraw a request that is still pending.
create or replace function public.cancel_appointment(p_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  update public.appointments
     set status = 'cancelled',
         cancelled_by = auth.uid(),
         cancelled_at = now()
   where id = p_id
     and status in ('confirmed', 'pending')
     and auth.uid() in (customer_id, creator_id)
     and public.appointment_starts_at(appointment_date::date, start_time::time) > now();
  if not found then
    raise exception 'This booking can no longer be cancelled.';
  end if;
end;
$function$;

-- 6. Push notifications, now also for requests
create or replace function public.notify_appointment_change()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_when     text := public.appointment_when(new.appointment_date::date, new.start_time::time);
  v_services text := public.appointment_services_text(new.services::jsonb);
  v_data     jsonb := jsonb_build_object('type', 'booking', 'appointmentId', new.id);
begin
  if tg_op = 'INSERT' and new.status = 'confirmed' then
    -- To the freelancer
    perform public.send_push(
      new.creator_id,
      'new booking',
      coalesce('@' || new.customer_name, 'a customer') || ' booked ' || v_services || ' · ' || v_when,
      v_data);
    -- To the customer
    perform public.send_push(
      new.customer_id,
      'booking confirmed',
      v_services || ' with @' || coalesce(new.creator_name, 'your nail tech') || ' · ' || v_when,
      v_data);

  elsif tg_op = 'INSERT' and new.status = 'pending' then
    perform public.send_push(
      new.creator_id,
      'new booking request',
      coalesce('@' || new.customer_name, 'a customer') || ' wants ' || v_services || ' · ' || v_when,
      jsonb_build_object('type', 'booking_request', 'appointmentId', new.id));

  elsif tg_op = 'UPDATE' and old.status = 'pending' and new.status = 'confirmed' then
    perform public.send_push(
      new.customer_id,
      'booking confirmed',
      '@' || coalesce(new.creator_name, 'your nail tech') || ' accepted ' || v_services || ' · ' || v_when,
      v_data);

  elsif tg_op = 'UPDATE' and old.status = 'pending' and new.status in ('declined', 'expired') then
    perform public.send_push(
      new.customer_id,
      case when new.status = 'declined' then 'booking declined' else 'booking request expired' end,
      v_services || ' · ' || v_when,
      v_data);

  elsif tg_op = 'UPDATE' and old.status in ('confirmed', 'pending') and new.status = 'cancelled' then
    -- Tell the person who did NOT cancel.
    if new.cancelled_by is distinct from new.creator_id then
      perform public.send_push(
        new.creator_id,
        case when old.status = 'pending' then 'booking request withdrawn' else 'booking cancelled' end,
        coalesce('@' || new.customer_name, 'the customer') || ' cancelled ' || v_services || ' · ' || v_when,
        v_data);
    end if;
    if new.cancelled_by is distinct from new.customer_id then
      perform public.send_push(
        new.customer_id,
        'booking cancelled',
        '@' || coalesce(new.creator_name, 'your nail tech') || ' cancelled ' || v_services || ' · ' || v_when,
        v_data);
    end if;
  end if;
  return new;
end;
$function$;
