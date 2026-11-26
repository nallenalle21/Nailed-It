-- ============================================================================
-- Nailed It: unread chats
-- Run once in the Supabase SQL editor (safe to run again).
--
-- chat_reads: per person and chat, when they last read it, and whether they marked it
-- "unread" themselves (swipe in the chat list). A chat is unread when its newest message is
-- from the other person and newer than last_read_at, or when it's marked unread.
-- Existing chats start as read (so nobody gets a wall of old "new" messages).
-- ============================================================================

create table if not exists public.chat_reads (
  user_id uuid not null references auth.users(id) on delete cascade,
  chat_id text not null,
  last_read_at timestamptz not null default now(),
  marked_unread boolean not null default false,
  primary key (user_id, chat_id)
);

alter table public.chat_reads enable row level security;

drop policy if exists "Own chat reads" on public.chat_reads;
create policy "Own chat reads" on public.chat_reads
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

revoke all on public.chat_reads from anon;
grant select, insert, update, delete on public.chat_reads to authenticated;

-- Start clean: every existing chat counts as read for both people in it.
-- (chat_id is "<user id>_<user id>".)
insert into public.chat_reads (user_id, chat_id, last_read_at)
select p.user_id, c.chat_id, now()
  from (select distinct chat_id from public.messages) c
  cross join lateral (
    values (split_part(c.chat_id, '_', 1)), (split_part(c.chat_id, '_', 2))
  ) as ids(raw)
  join auth.users u on u.id::text = ids.raw
  cross join lateral (select u.id as user_id) p
on conflict (user_id, chat_id) do nothing;

-- Read / unread, with the server's clock (so a phone whose clock is a bit off can't leave
-- a chat looking unread after it's been opened).
create or replace function public.mark_chat_read(p_chat_id text)
returns void
language sql
security invoker
set search_path = public
as $$
  insert into public.chat_reads (user_id, chat_id, last_read_at, marked_unread)
  values (auth.uid(), p_chat_id, now(), false)
  on conflict (user_id, chat_id) do update set last_read_at = now(), marked_unread = false;
$$;

create or replace function public.mark_chat_unread(p_chat_id text)
returns void
language sql
security invoker
set search_path = public
as $$
  insert into public.chat_reads (user_id, chat_id, marked_unread)
  values (auth.uid(), p_chat_id, true)
  on conflict (user_id, chat_id) do update set marked_unread = true;
$$;

revoke all on function public.mark_chat_read(text) from public, anon;
revoke all on function public.mark_chat_unread(text) from public, anon;
grant execute on function public.mark_chat_read(text) to authenticated;
grant execute on function public.mark_chat_unread(text) to authenticated;

-- Live updates for the unread badge (when read/unread changes on another phone).
do $$
begin
  alter publication supabase_realtime add table public.chat_reads;
exception when others then null; -- already added, or no realtime publication
end $$;

notify pgrst, 'reload schema';
