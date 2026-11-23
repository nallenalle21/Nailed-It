-- ============================================================================
-- Nailed It: "Book" view on Explore — freelancers with their next free times
-- Applied to the project as migration "find_bookable_creators". Kept here for reference.
--
-- find_bookable_creators(p_date, p_service, p_creator, p_times):
--   every freelancer who has at least one service (matching p_service, if given), with
--   - the service the times are for (their shortest matching one), so booking can pre-select it
--   - up to p_times next start times (on the same 15-minute grid as the booking sheet) where
--     that service fits inside one availability window and overlaps no booking or request
--   - from-price, service names, public city and avatar, for the card
-- Window: the next 14 days, or only p_date. With p_date, freelancers without a time that day
-- are left out. p_creator limits it to one freelancer (the photo sheet).
-- ============================================================================

create or replace function public.find_bookable_creators(
  p_date date default null,
  p_service text default null,
  p_creator uuid default null,
  p_times int default 3
)
returns table (
  id uuid,
  username text,
  avatar_path text,
  city text,
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
    select p.id, p.username
      from public.profiles p
     where p.role = 'creator' and (p_creator is null or p.id = p_creator)
  ),
  -- The service each freelancer's times are calculated for: their shortest matching one.
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
        -- first 15-minute mark at or after the window start
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
         va.storage_path,
         nullif(trim(u.raw_user_meta_data ->> 'city'), ''),
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
