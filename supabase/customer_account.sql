-- ============================================================================
-- Nailed It: customer account settings
-- Run once in the Supabase SQL editor (safe to run again).
--
--   1. username_changes: a log of username changes (owner can read their own)
--   2. username_change_status(): how many changes are left this week, and when the next opens
--   3. change_my_username(): at most 2 changes in any 7 days; unique (ignoring case)
--   4. update_my_name(): a customer's own name (profiles.display_name) shown on their profile
-- The location is saved on the login account (user_metadata.city), so it needs nothing here.
-- ============================================================================

-- 1. Log of username changes
create table if not exists public.username_changes (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  old_username text,
  new_username text not null,
  changed_at timestamptz not null default now()
);
create index if not exists username_changes_user_idx on public.username_changes (user_id, changed_at desc);
alter table public.username_changes enable row level security;
drop policy if exists "Owner reads own username changes" on public.username_changes;
create policy "Owner reads own username changes" on public.username_changes
  for select to authenticated
  using (user_id = (select auth.uid()));

-- 2. Changes left this week (2 per rolling 7 days)
create or replace function public.username_change_status()
returns table (changes_left int, next_change_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  with recent as (
    select changed_at from username_changes
     where user_id = auth.uid() and changed_at > now() - interval '7 days'
  )
  select greatest(0, 2 - count(*))::int,
         case when count(*) >= 2 then min(changed_at) + interval '7 days' end
    from recent;
$$;

revoke all on function public.username_change_status() from public, anon;
grant execute on function public.username_change_status() to authenticated;

-- 3. Change username
create or replace function public.change_my_username(p_username text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  v text := trim(coalesce(p_username, ''));
  v_old text;
  n int;
begin
  if me is null then
    raise exception 'Please sign in.';
  end if;
  if v !~ '^[A-Za-z0-9._]{3,30}$' then
    raise exception 'Usernames are 3–30 characters: letters, numbers, dots and underscores.';
  end if;

  select username into v_old from profiles where id = me for update;
  if v_old = v then
    return;
  end if;

  -- Two people picking the same name at the same moment: one waits for the other.
  perform pg_advisory_xact_lock(hashtext('username:' || lower(v)));
  if exists (select 1 from profiles where lower(username) = lower(v) and id <> me) then
    raise exception 'That username is taken.';
  end if;

  select count(*) into n from username_changes
   where user_id = me and changed_at > now() - interval '7 days';
  if n >= 2 then
    raise exception 'You can change your username twice a week. Try again in a few days.';
  end if;

  update profiles set username = v where id = me;
  insert into username_changes (user_id, old_username, new_username) values (me, v_old, v);
end;
$$;

revoke all on function public.change_my_username(text) from public, anon;
grant execute on function public.change_my_username(text) to authenticated;

-- 4. A customer's own name (freelancers set theirs under Business details)
create or replace function public.update_my_name(p_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  v text := nullif(trim(coalesce(p_name, '')), '');
begin
  if me is null then
    raise exception 'Please sign in.';
  end if;
  if exists (select 1 from profiles where id = me and role = 'creator') then
    raise exception 'Freelancers change their name under Business details.';
  end if;
  if char_length(v) > 50 then
    raise exception 'Keep your name under 50 characters.';
  end if;
  update profiles set display_name = v where id = me;
end;
$$;

revoke all on function public.update_my_name(text) from public, anon;
grant execute on function public.update_my_name(text) to authenticated;

notify pgrst, 'reload schema';
