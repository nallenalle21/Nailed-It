-- ============================================================================
-- Nailed It: approximate location for the Find Service map
-- Run once in the Supabase SQL editor (safe to run again).
--
-- The exact address stays private (creator_private). Customers instead see a 200 m circle
-- on the map. Its centre is the address moved 40–150 m in a random direction, so:
--   - the real address is always inside the circle (150 m < 200 m), and
--   - the centre of the circle never gives the address away.
-- The random shift is chosen once per address (a new one only when the address changes),
-- so it can't be averaged out by reloading the map.
-- ============================================================================

alter table public.profiles add column if not exists approx_lat double precision;
alter table public.profiles add column if not exists approx_lng double precision;

create or replace function public._set_approx_location()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  d double precision := 40 + random() * 110;   -- metres
  a double precision := random() * 2 * pi();   -- direction
begin
  if new.address_lat is null or new.address_lng is null then
    update profiles set approx_lat = null, approx_lng = null where id = new.user_id;
    return new;
  end if;
  if tg_op = 'UPDATE'
     and new.address_lat is not distinct from old.address_lat
     and new.address_lng is not distinct from old.address_lng then
    return new;
  end if;
  update profiles
     set approx_lat = new.address_lat + (d * cos(a)) / 111320.0,
         approx_lng = new.address_lng + (d * sin(a)) / (111320.0 * cos(radians(new.address_lat)))
   where id = new.user_id;
  return new;
end;
$$;

drop trigger if exists creator_private_approx_location on public.creator_private;
create trigger creator_private_approx_location
  after insert or update of address_lat, address_lng on public.creator_private
  for each row execute function public._set_approx_location();

-- Freelancers who already have an address
update public.profiles p
   set approx_lat = c.address_lat + (c.d * cos(c.a)) / 111320.0,
       approx_lng = c.address_lng + (c.d * sin(c.a)) / (111320.0 * cos(radians(c.address_lat)))
  from (
    select user_id, address_lat, address_lng, 40 + random() * 110 as d, random() * 2 * pi() as a
      from public.creator_private
     where address_lat is not null and address_lng is not null
  ) c
 where p.id = c.user_id and p.approx_lat is null;

notify pgrst, 'reload schema';
