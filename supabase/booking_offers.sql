-- ============================================================================
-- Nailed It: booking offers in the chat
-- Paste into Supabase → SQL Editor → New query → Run. Safe to run again.
--
-- A freelancer sends an offer (header, notes, date, start time, length, place, price) in a chat.
-- It shows up as a card; the customer accepts or declines it, the freelancer can withdraw it.
-- Accepting creates a normal appointment, so it appears in both calendars in the app.
--
-- Adds:
--   1. booking_offers table (readable by the two people in the chat, changed only via 4–6)
--   2. messages.offer_id (the chat message that shows the offer card)
--      appointments.place (where an offered booking happens)
--   3. offer_slot_taken(): does a time overlap one of the freelancer's bookings?
--   4. send_booking_offer()     freelancer
--   5. respond_booking_offer()  customer: accept → appointment, or decline
--   6. withdraw_booking_offer() freelancer
-- Times are wall-clock times in Sweden (Europe/Stockholm), like the rest of the bookings.
-- Nothing existing is changed or removed.
-- ============================================================================

-- 1. Offers
create table if not exists public.booking_offers (
  id               uuid primary key default gen_random_uuid(),
  chat_id          text not null,
  creator_id       uuid not null references auth.users (id) on delete cascade,
  customer_id      uuid not null references auth.users (id) on delete cascade,
  title            text not null check (char_length(title) between 1 and 80),
  notes            text check (char_length(notes) <= 300),
  offer_date       date not null,
  start_time       time not null,
  duration_minutes int  not null check (duration_minutes between 15 and 720),
  place            text check (char_length(place) <= 200),
  price            numeric(10, 2) not null check (price >= 0),
  status           text not null default 'pending'
                   check (status in ('pending', 'accepted', 'declined', 'withdrawn')),
  appointment_id   uuid,
  created_at       timestamptz not null default now(),
  responded_at     timestamptz
);

create index if not exists booking_offers_chat_id_idx on public.booking_offers (chat_id);

alter table public.booking_offers enable row level security;

drop policy if exists "Chat members can read offers" on public.booking_offers;
create policy "Chat members can read offers" on public.booking_offers
  for select to authenticated
  using (auth.uid() = creator_id or auth.uid() = customer_id);
-- No insert/update/delete policies on purpose: offers only change through the functions below.

-- Live updates in the chat (accepted / declined / withdrawn)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'booking_offers'
  ) then
    alter publication supabase_realtime add table public.booking_offers;
  end if;
end;
$$;

-- 2. Links to the offer
alter table public.messages add column if not exists offer_id uuid
  references public.booking_offers (id) on delete set null;
alter table public.appointments add column if not exists place text;

-- 3. Overlap with the freelancer's confirmed appointments (and old-style booked slots, if that table exists)
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
       and status = 'confirmed'
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

revoke all on function public.offer_slot_taken(uuid, date, time, time) from public, anon, authenticated;

-- 4. Send (freelancer). Also posts the chat message that shows the card.
create or replace function public.send_booking_offer(
  p_chat_id text,
  p_title text,
  p_notes text,
  p_date date,
  p_start time,
  p_duration int,
  p_place text,
  p_price numeric
)
returns public.booking_offers
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  members text[] := string_to_array(p_chat_id, '_');
  customer uuid;
  offer public.booking_offers;
begin
  if me is null then
    raise exception 'Please sign in again.';
  end if;
  if coalesce(array_length(members, 1), 0) <> 2 or not (me::text = any (members)) then
    raise exception 'You are not part of this chat.';
  end if;
  customer := (case when members[1] = me::text then members[2] else members[1] end)::uuid;
  if customer = me then
    raise exception 'You can''t send an offer to yourself.';
  end if;
  if not exists (select 1 from public.profiles where id = me and role = 'creator') then
    raise exception 'Only freelancers can send booking offers.';
  end if;

  if nullif(trim(p_title), '') is null then
    raise exception 'Add a header for the offer.';
  end if;
  if p_date is null or p_start is null or p_duration is null or p_duration < 15 or p_duration > 720 then
    raise exception 'Pick a date, a start time and a length.';
  end if;
  if extract(epoch from p_start) / 60 + p_duration >= 24 * 60 then
    raise exception 'The appointment has to end before midnight.';
  end if;
  if p_date + p_start <= (now() at time zone 'Europe/Stockholm') then
    raise exception 'Pick a time in the future.';
  end if;
  if p_price is null or p_price < 0 then
    raise exception 'Enter a price.';
  end if;
  if public.offer_slot_taken(me, p_date, p_start, p_start + make_interval(mins => p_duration)) then
    raise exception 'You already have a booking at that time.';
  end if;

  insert into public.booking_offers
    (chat_id, creator_id, customer_id, title, notes, offer_date, start_time, duration_minutes, place, price)
  values
    (p_chat_id, me, customer, left(trim(p_title), 80), nullif(left(trim(p_notes), 300), ''),
     p_date, p_start, p_duration, nullif(left(trim(p_place), 200), ''), round(p_price, 2))
  returning * into offer;

  insert into public.messages (chat_id, sender_id, text, offer_id)
  values (p_chat_id, me, 'Booking offer: ' || offer.title, offer.id);

  return offer;
end;
$$;

revoke all on function public.send_booking_offer(text, text, text, date, time, int, text, numeric) from public, anon;
grant execute on function public.send_booking_offer(text, text, text, date, time, int, text, numeric) to authenticated;

-- 5. Accept or decline (customer). Accepting books it: { status, appointment }.
create or replace function public.respond_booking_offer(p_offer uuid, p_accept boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  offer public.booking_offers;
  appointment public.appointments;
  end_at time;
begin
  select * into offer from public.booking_offers where id = p_offer for update;
  if not found or offer.customer_id is distinct from me then
    raise exception 'Offer not found.';
  end if;
  if offer.status <> 'pending' then
    raise exception 'This offer has already been %.', offer.status;
  end if;

  if not p_accept then
    update public.booking_offers set status = 'declined', responded_at = now() where id = offer.id;
    insert into public.messages (chat_id, sender_id, text)
    values (offer.chat_id, me, 'Declined the booking offer: ' || offer.title);
    return jsonb_build_object('status', 'declined');
  end if;

  if offer.offer_date + offer.start_time <= (now() at time zone 'Europe/Stockholm') then
    raise exception 'This offer has expired. Ask for a new one.';
  end if;
  end_at := offer.start_time + make_interval(mins => offer.duration_minutes);
  if public.offer_slot_taken(offer.creator_id, offer.offer_date, offer.start_time, end_at) then
    raise exception 'That time is no longer free. Ask for a new offer.';
  end if;

  insert into public.appointments
    (creator_id, customer_id, creator_name, customer_name, appointment_date, start_time, end_time,
     total_minutes, total_price, services, status, customer_note, place)
  values (
    offer.creator_id,
    offer.customer_id,
    coalesce((select username from public.profiles where id = offer.creator_id), ''),
    coalesce((select username from public.profiles where id = offer.customer_id), ''),
    offer.offer_date,
    offer.start_time,
    end_at,
    offer.duration_minutes,
    offer.price,
    jsonb_build_array(jsonb_build_object(
      'id', offer.id, 'name', offer.title, 'duration_minutes', offer.duration_minutes, 'price', offer.price)),
    'confirmed',
    offer.notes,
    offer.place
  )
  returning * into appointment;

  update public.booking_offers
     set status = 'accepted', appointment_id = appointment.id, responded_at = now()
   where id = offer.id;
  insert into public.messages (chat_id, sender_id, text)
  values (offer.chat_id, me, 'Accepted the booking offer: ' || offer.title);

  return jsonb_build_object('status', 'accepted', 'appointment', to_jsonb(appointment));
end;
$$;

revoke all on function public.respond_booking_offer(uuid, boolean) from public, anon;
grant execute on function public.respond_booking_offer(uuid, boolean) to authenticated;

-- 6. Withdraw a pending offer (freelancer)
create or replace function public.withdraw_booking_offer(p_offer uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  offer public.booking_offers;
begin
  select * into offer from public.booking_offers where id = p_offer for update;
  if not found or offer.creator_id is distinct from me then
    raise exception 'Offer not found.';
  end if;
  if offer.status <> 'pending' then
    raise exception 'This offer has already been %.', offer.status;
  end if;

  update public.booking_offers set status = 'withdrawn', responded_at = now() where id = offer.id;
  insert into public.messages (chat_id, sender_id, text)
  values (offer.chat_id, me, 'Withdrew the booking offer: ' || offer.title);
end;
$$;

revoke all on function public.withdraw_booking_offer(uuid) from public, anon;
grant execute on function public.withdraw_booking_offer(uuid) to authenticated;

-- Make the API see the new functions right away
notify pgrst, 'reload schema';
