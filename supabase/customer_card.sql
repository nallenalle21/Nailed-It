-- ============================================================================
-- Nailed It: a customer's profile card, as freelancers see it
-- Run once in the Supabase SQL editor (safe to run again).
--
-- get_customer_card(p_customer): the same info the customer sees on "My profile":
-- name, username, location, bookings, collections and when they joined.
-- Only for the customer themselves, or a freelancer who has a chat or a booking with them.
-- Never the email.
-- ============================================================================

create or replace function public.get_customer_card(p_customer uuid)
returns table (
  name text,
  username text,
  city text,
  member_since timestamptz,
  bookings int,
  collections int
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'Please sign in.';
  end if;
  if me <> p_customer and not (
       exists (select 1 from profiles where id = me and role = 'creator')
       and (
         exists (select 1 from appointments where creator_id = me and customer_id = p_customer)
         or exists (select 1 from messages where chat_id = public.chat_id_for(me, p_customer))
       )
     ) then
    raise exception 'Customer not found.';
  end if;

  return query
  select nullif(trim(p.display_name), ''),
         p.username,
         nullif(trim(u.raw_user_meta_data ->> 'city'), ''),
         u.created_at,
         (select count(*) from appointments a where a.customer_id = p.id and a.status = 'confirmed')::int,
         (select count(*) from wishlist_boards b where b.user_id = p.id)::int
    from profiles p
    left join auth.users u on u.id = p.id
   where p.id = p_customer;
end;
$$;

revoke all on function public.get_customer_card(uuid) from public, anon;
grant execute on function public.get_customer_card(uuid) to authenticated;

notify pgrst, 'reload schema';
