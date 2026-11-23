-- ============================================================================
-- Nailed It: freelancer onboarding (required before a profile goes live)
-- Applied to the project as migration "freelancer_onboarding". Kept here for reference.
--
-- Required: display name, categories (nails/lashes/brows), workplace type(s) + address
-- (+ travel distance when mobile), phone + email (private), accepted terms & guidelines.
--
--   1. profiles: public onboarding fields (display name, categories, workplace types, the
--      approximate area + its map point, travel distance) and progress; is_live = done
--   2. creator_private: phone, email and the exact address — only the freelancer can read it
--   3. work_locations: was readable by anyone; now only by its owner
--   4. get_studio_address(): the exact address only for the freelancer and customers with a
--      confirmed booking (it was readable by any signed-in user)
--   5. get_my_onboarding(), save_onboarding(), complete_onboarding()
--   6. Hidden until live: portfolio photos, search, Book view, Explore date filter, booking
-- ============================================================================

-- 1. Public profile fields + progress
alter table public.profiles add column if not exists display_name text;
alter table public.profiles add column if not exists categories text[] not null default '{}';
alter table public.profiles add column if not exists workplace_types text[] not null default '{}';
alter table public.profiles add column if not exists area text;               -- e.g. 'Södermalm' (public)
alter table public.profiles add column if not exists area_lat double precision; -- the area's point, never the address
alter table public.profiles add column if not exists area_lng double precision;
alter table public.profiles add column if not exists travel_km int;
alter table public.profiles add column if not exists terms_accepted_at timestamptz;
alter table public.profiles add column if not exists terms_version text;
alter table public.profiles add column if not exists onboarding_step int not null default 0;
alter table public.profiles add column if not exists onboarding_completed_at timestamptz;
alter table public.profiles add column if not exists is_live boolean
  generated always as (role = 'creator' and onboarding_completed_at is not null) stored;

alter table public.profiles drop constraint if exists profiles_categories_check;
alter table public.profiles add constraint profiles_categories_check
  check (categories <@ array['nails', 'lashes', 'brows']);
alter table public.profiles drop constraint if exists profiles_workplace_types_check;
alter table public.profiles add constraint profiles_workplace_types_check
  check (workplace_types <@ array['home_studio', 'salon_chair', 'mobile']);
alter table public.profiles drop constraint if exists profiles_travel_km_check;
alter table public.profiles add constraint profiles_travel_km_check
  check (travel_km is null or travel_km between 1 and 100);

-- 2. Private details
create table if not exists public.creator_private (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  phone text,
  contact_email text,
  address text,
  address_lat double precision,
  address_lng double precision,
  updated_at timestamptz not null default now()
);
alter table public.creator_private enable row level security;
drop policy if exists "Owner reads own private details" on public.creator_private;
create policy "Owner reads own private details" on public.creator_private
  for select to authenticated using (user_id = (select auth.uid()));
-- No write policies: changes go through save_onboarding().

-- 3. work_locations: owner only (inserts get the owner automatically)
alter table public.work_locations alter column user_id set default auth.uid();
alter table public.work_locations enable row level security;
drop policy if exists "Owner manages own work locations" on public.work_locations;
create policy "Owner manages own work locations" on public.work_locations
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- 4. Exact address: the freelancer, and customers with a confirmed booking with them
create or replace function public.get_studio_address(p_creator uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_address text;
begin
  if auth.uid() is distinct from p_creator and not exists (
    select 1 from appointments
     where creator_id = p_creator and customer_id = auth.uid() and status in ('confirmed', 'no_show')
  ) then
    return null;
  end if;

  select nullif(trim(address), '') into v_address from creator_private where user_id = p_creator;
  if v_address is null then
    select nullif(trim(studio_address), '') into v_address
      from work_locations
     where user_id = p_creator and coalesce(studio_enabled, true)
     order by updated_at desc nulls last
     limit 1;
  end if;
  return v_address;
end;
$$;

revoke all on function public.get_studio_address(uuid) from public, anon;
grant execute on function public.get_studio_address(uuid) to authenticated;

-- 5. Onboarding
create or replace function public.get_my_onboarding()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'display_name', p.display_name,
    'username', p.username,
    'categories', to_jsonb(p.categories),
    'workplace_types', to_jsonb(p.workplace_types),
    'area', p.area,
    'area_lat', p.area_lat,
    'area_lng', p.area_lng,
    'travel_km', p.travel_km,
    'terms_accepted', p.terms_accepted_at is not null,
    'step', p.onboarding_step,
    'completed', p.onboarding_completed_at is not null,
    'phone', c.phone,
    'contact_email', coalesce(c.contact_email, p.email),
    'address', c.address,
    'address_lat', c.address_lat,
    'address_lng', c.address_lng)
  from profiles p
  left join creator_private c on c.user_id = p.id
  where p.id = auth.uid();
$$;

revoke all on function public.get_my_onboarding() from public, anon;
grant execute on function public.get_my_onboarding() to authenticated;

-- Saves whatever fields are in p_data (each checked), and remembers the furthest step reached.
create or replace function public.save_onboarding(p_step int, p_data jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  v text;
  arr text[];
begin
  if me is null or not exists (select 1 from profiles where id = me and role = 'creator') then
    raise exception 'Only freelancers have this setup.';
  end if;
  p_data := coalesce(p_data, '{}'::jsonb);

  if p_data ? 'display_name' then
    v := trim(p_data ->> 'display_name');
    if v is null or char_length(v) not between 2 and 40 then
      raise exception 'Your display name needs 2–40 characters.';
    end if;
    update profiles set display_name = v where id = me;
  end if;

  if p_data ? 'categories' then
    select coalesce(array_agg(distinct x), '{}') into arr from jsonb_array_elements_text(p_data -> 'categories') x;
    if cardinality(arr) = 0 or not arr <@ array['nails', 'lashes', 'brows'] then
      raise exception 'Choose at least one category.';
    end if;
    update profiles set categories = arr where id = me;
  end if;

  if p_data ? 'workplace_types' then
    select coalesce(array_agg(distinct x), '{}') into arr from jsonb_array_elements_text(p_data -> 'workplace_types') x;
    if cardinality(arr) = 0 or not arr <@ array['home_studio', 'salon_chair', 'mobile'] then
      raise exception 'Choose at least one type of workplace.';
    end if;
    update profiles set workplace_types = arr,
                        travel_km = case when 'mobile' = any (arr) then travel_km end
     where id = me;
  end if;

  if p_data ? 'travel_km' and p_data ->> 'travel_km' is not null then
    if (p_data ->> 'travel_km')::int not between 1 and 100 then
      raise exception 'Travel distance must be 1–100 km.';
    end if;
    update profiles set travel_km = (p_data ->> 'travel_km')::int where id = me;
  end if;

  if p_data ? 'area' then
    v := trim(p_data ->> 'area');
    if v is null or char_length(v) not between 2 and 60 then
      raise exception 'Add the area customers will see (e.g. Södermalm).';
    end if;
    update profiles set area = v,
                        area_lat = (p_data ->> 'area_lat')::double precision,
                        area_lng = (p_data ->> 'area_lng')::double precision
     where id = me;
  end if;

  if p_data ? 'address' or p_data ? 'phone' or p_data ? 'contact_email' then
    insert into creator_private (user_id) values (me) on conflict (user_id) do nothing;
  end if;

  if p_data ? 'address' then
    v := trim(p_data ->> 'address');
    if v is null or char_length(v) not between 5 and 200 then
      raise exception 'Add your full address.';
    end if;
    update creator_private set address = v,
                               address_lat = (p_data ->> 'address_lat')::double precision,
                               address_lng = (p_data ->> 'address_lng')::double precision,
                               updated_at = now()
     where user_id = me;
  end if;

  if p_data ? 'phone' then
    v := trim(p_data ->> 'phone');
    if v is null or v !~ '^\+?[0-9][0-9 ()-]{6,19}$' then
      raise exception 'Add a valid phone number.';
    end if;
    update creator_private set phone = v, updated_at = now() where user_id = me;
  end if;

  if p_data ? 'contact_email' then
    v := lower(trim(p_data ->> 'contact_email'));
    if v is null or v !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
      raise exception 'Add a valid email address.';
    end if;
    update creator_private set contact_email = v, updated_at = now() where user_id = me;
  end if;

  if coalesce((p_data ->> 'accept_terms')::boolean, false) then
    update profiles set terms_accepted_at = now(), terms_version = '2026-11-draft' where id = me;
  end if;

  update profiles set onboarding_step = greatest(onboarding_step, coalesce(p_step, 0)) where id = me;
  return get_my_onboarding();
end;
$$;

revoke all on function public.save_onboarding(int, jsonb) from public, anon;
grant execute on function public.save_onboarding(int, jsonb) to authenticated;

-- Goes live when everything required is there; otherwise lists what is missing.
create or replace function public.complete_onboarding()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  p profiles;
  c creator_private;
  missing text[] := '{}';
begin
  select * into p from profiles where id = me and role = 'creator';
  if not found then
    raise exception 'Only freelancers have this setup.';
  end if;
  select * into c from creator_private where user_id = me;

  if coalesce(char_length(trim(p.display_name)), 0) < 2 then missing := array_append(missing, 'display_name'); end if;
  if cardinality(p.categories) = 0 then missing := array_append(missing, 'categories'); end if;
  if cardinality(p.workplace_types) = 0 then missing := array_append(missing, 'workplace_types'); end if;
  if 'mobile' = any (p.workplace_types) and p.travel_km is null then missing := array_append(missing, 'travel_km'); end if;
  if coalesce(char_length(trim(c.address)), 0) < 5 then missing := array_append(missing, 'address'); end if;
  if coalesce(char_length(trim(p.area)), 0) < 2 then missing := array_append(missing, 'area'); end if;
  if c.phone is null then missing := array_append(missing, 'phone'); end if;
  if c.contact_email is null then missing := array_append(missing, 'contact_email'); end if;
  if p.terms_accepted_at is null then missing := array_append(missing, 'terms'); end if;

  if cardinality(missing) = 0 then
    update profiles set onboarding_completed_at = coalesce(onboarding_completed_at, now()) where id = me;
  end if;
  return jsonb_build_object('live', cardinality(missing) = 0, 'missing', to_jsonb(missing));
end;
$$;

revoke all on function public.complete_onboarding() from public, anon;
grant execute on function public.complete_onboarding() to authenticated;

-- 6. Hidden until live
-- Portfolio photos: only from live freelancers (and always your own)
drop policy if exists "vendor posts read" on public.vendor_posts;
create policy "vendor posts read" on public.vendor_posts
  for select
  using (vendor_id = (select auth.uid())
         or exists (select 1 from public.profiles p where p.id = vendor_posts.vendor_id and p.is_live));

-- Booking needs a live freelancer
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

-- Explore date filter: live freelancers only
create or replace function public.creators_available_on(p_date date)
returns setof uuid
language sql
stable security definer
set search_path to 'public'
as $function$
  select distinct s.creator_id
    from creator_slots s
    join profiles pr on pr.id = s.creator_id and pr.is_live
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

-- Search: live freelancers only; now also returns display name and the public area
drop function if exists public.search_creators(text, int);
create function public.search_creators(p_query text, p_limit int default 20)
returns table (id uuid, username text, display_name text, avatar_path text, city text, from_price numeric)
language sql
stable
security definer
set search_path = public
as $$
  with q as (
    select lower(regexp_replace(trim(ltrim(trim(coalesce(p_query, '')), '@')), '([%_\\])', '\\\1', 'g')) as text
  )
  select p.id,
         p.username,
         p.display_name,
         va.storage_path,
         coalesce(p.area, nullif(trim(u.raw_user_meta_data ->> 'city'), '')),
         (select min(coalesce(s.discount_price, s.price)) from public.services s where s.user_id = p.id)
    from public.profiles p
    cross join q
    left join auth.users u on u.id = p.id
    left join public.vendor_avatars va on va.vendor_id = p.id
   where p.role = 'creator' and p.is_live
     and q.text <> ''
     and (lower(p.username) like '%' || q.text || '%' or lower(coalesce(p.display_name, '')) like '%' || q.text || '%')
   order by lower(p.username) = q.text or lower(coalesce(p.display_name, '')) = q.text desc,
            lower(p.username) like q.text || '%' or lower(coalesce(p.display_name, '')) like q.text || '%' desc,
            length(p.username),
            p.username
   limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;

revoke all on function public.search_creators(text, int) from public, anon;
grant execute on function public.search_creators(text, int) to authenticated;

-- Book view: live freelancers only; also display name, area + its map point, categories, workplaces
drop function if exists public.find_bookable_creators(date, text, uuid, int);
create function public.find_bookable_creators(
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
     where p.role = 'creator' and p.is_live and (p_creator is null or p.id = p_creator)
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
