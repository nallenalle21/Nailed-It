-- ============================================================================
-- Nailed It: Instagram-style freelancer search (Explore search bar)
-- Applied to the project as migration "search_creators". Kept here for reference.
--
-- search_creators(p_query, p_limit): freelancers whose username contains the text, best
-- matches first (exact, then starts-with, then shorter names). Returns only what a result
-- row shows: username, avatar path, public city and lowest service price.
-- The city comes from the freelancer's account details (not readable by other users
-- directly), so only that one field is exposed, and only for freelancers.
-- ============================================================================

create or replace function public.search_creators(p_query text, p_limit int default 20)
returns table (id uuid, username text, avatar_path text, city text, from_price numeric)
language sql
stable
security definer
set search_path = public
as $$
  with q as (
    -- Treat % and _ literally; ignore a leading @ (people type "@anna").
    select lower(regexp_replace(trim(ltrim(trim(coalesce(p_query, '')), '@')), '([%_\\])', '\\\1', 'g')) as text
  )
  select p.id,
         p.username,
         va.storage_path,
         nullif(trim(u.raw_user_meta_data ->> 'city'), ''),
         (select min(coalesce(s.discount_price, s.price)) from public.services s where s.user_id = p.id)
    from public.profiles p
    cross join q
    left join auth.users u on u.id = p.id
    left join public.vendor_avatars va on va.vendor_id = p.id
   where p.role = 'creator'
     and q.text <> ''
     and lower(p.username) like '%' || q.text || '%'
   order by lower(p.username) = q.text desc,
            lower(p.username) like q.text || '%' desc,
            length(p.username),
            p.username
   limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;

revoke all on function public.search_creators(text, int) from public, anon;
grant execute on function public.search_creators(text, int) to authenticated;
