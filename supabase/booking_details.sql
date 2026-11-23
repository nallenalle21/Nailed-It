-- ============================================================================
-- Nailed It: booking details ("View" in the customer calendar)
-- Paste into Supabase → SQL Editor → New query → Run. Safe to run again.
--
-- Adds:
--   1. appointments.customer_note: the optional comment written when booking
--   2. set_appointment_note(): lets a customer save a comment on their own booking
--   3. get_studio_address(): a freelancer's studio address from Business → Work Locations,
--      readable by customers (only the address, nothing else from that table)
-- Nothing existing is changed or removed.
-- ============================================================================

-- 1. The comment
alter table public.appointments add column if not exists customer_note text;

-- 2. Save a comment (customer only, on their own booking, max 300 characters)
create or replace function public.set_appointment_note(p_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.appointments
     set customer_note = nullif(left(trim(p_note), 300), '')
   where id = p_id
     and customer_id = auth.uid();
  if not found then
    raise exception 'Booking not found.';
  end if;
end;
$$;

revoke all on function public.set_appointment_note(uuid, text) from public, anon;
grant execute on function public.set_appointment_note(uuid, text) to authenticated;

-- 3. Studio address for the booking card. Finds the column that links work_locations to the
--    freelancer (user_id, creator_id, vendor_id …) so it works with your table as it is.
create or replace function public.get_studio_address(p_creator uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  owner_column text;
  address text;
begin
  select column_name into owner_column
    from information_schema.columns
   where table_schema = 'public'
     and table_name = 'work_locations'
     and column_name in ('user_id', 'creator_id', 'vendor_id', 'owner_id', 'profile_id')
   order by array_position(array['user_id', 'creator_id', 'vendor_id', 'owner_id', 'profile_id'], column_name::text)
   limit 1;
  if owner_column is null then
    return null;
  end if;

  execute format(
    'select studio_address from public.work_locations
      where %I = $1 and coalesce(studio_enabled, true)
      order by updated_at desc nulls last
      limit 1', owner_column)
    into address
    using p_creator;

  return nullif(trim(address), '');
end;
$$;

revoke all on function public.get_studio_address(uuid) from public, anon;
grant execute on function public.get_studio_address(uuid) to authenticated;
