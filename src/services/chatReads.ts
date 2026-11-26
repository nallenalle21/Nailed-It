import { useCallback, useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { supabase } from './supabase';

/**
 * Unread chats (supabase/chat_reads.sql): per chat, when you last read it and whether you
 * marked it unread. A chat is unread when its newest message is from the other person and
 * newer than when you last read it, or when you marked it unread (swipe in the chat list).
 */
export type ChatRead = { last_read_at: string; marked_unread: boolean };
type LatestMessage = { chat_id: string; sender_id: string; created_at: string };

// Screens that show unread state (chat list, tab bar badge) refresh when this changes.
const listeners = new Set<() => void>();
export function onChatReadsChanged(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
const changed = () => listeners.forEach((l) => l());

/** Your read/unread state for all your chats. Empty until chat_reads.sql has been run. */
export async function fetchChatReads(): Promise<Map<string, ChatRead>> {
  const { data, error } = await supabase.from('chat_reads').select('chat_id, last_read_at, marked_unread');
  if (error) return new Map(); // table missing: no unread marks yet, chats still work
  return new Map((data ?? []).map((r: any) => [r.chat_id as string, { last_read_at: r.last_read_at, marked_unread: r.marked_unread }]));
}

/** Is this chat unread for me, given its newest message? */
export function isChatUnread(latest: LatestMessage | undefined, read: ChatRead | undefined, myId: string): boolean {
  if (read?.marked_unread) return true;
  if (!latest || latest.sender_id === myId) return false;
  // Never opened (and not from before unread tracking started): new.
  if (!read) return true;
  return new Date(latest.created_at).getTime() > new Date(read.last_read_at).getTime();
}

// Shown once if read/unread can't be saved (usually: chat_reads.sql hasn't been run yet).
let warned = false;
function warnOnce(message: string) {
  console.warn('[chatReads] Could not save:', message);
  if (warned) return;
  warned = true;
  Alert.alert('Unread marks not saved', `Run supabase/chat_reads.sql in the Supabase SQL editor.\n\n(${message})`);
}

/**
 * Saves read/unread with the server's clock (mark_chat_read / mark_chat_unread), so a phone
 * whose clock is a little off can't leave a chat looking unread after it's been opened.
 */
async function save(chatId: string, read: boolean) {
  const { error } = await supabase.rpc(read ? 'mark_chat_read' : 'mark_chat_unread', { p_chat_id: chatId });
  if (error) warnOnce(error.message);
  changed();
}

/** Opened (or reading) the chat: read now, and no longer marked unread. */
export const markChatRead = (chatId: string) => save(chatId, true);

/** Swipe in the chat list: keep it as unread to deal with later. */
export const markChatUnread = (chatId: string) => save(chatId, false);

/**
 * How many of your chats are unread (for the badge on the Chats tab). Updates when messages
 * arrive and when chats are read or marked unread (also from your other phone).
 */
export function useUnreadChatCount(): number {
  const [count, setCount] = useState(0);
  const refresh = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return setCount(0);
    const [{ data }, reads] = await Promise.all([
      supabase.from('messages').select('chat_id, sender_id, created_at')
        .like('chat_id', `%${user.id}%`).order('created_at', { ascending: false }),
      fetchChatReads(),
    ]);
    const latestByChat = new Map<string, LatestMessage>();
    for (const m of (data ?? []) as LatestMessage[]) if (!latestByChat.has(m.chat_id)) latestByChat.set(m.chat_id, m);
    const chatIds = new Set([...latestByChat.keys(), ...reads.keys()]);
    setCount([...chatIds].filter((id) => isChatUnread(latestByChat.get(id), reads.get(id), user.id)).length);
  }, []);

  useEffect(() => {
    void refresh();
    const off = onChatReadsChanged(() => void refresh());
    // New messages, and read/unread changes from another phone.
    const channel = supabase
      .channel(`unread-chats-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => void refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_reads' }, () => void refresh())
      .subscribe();
    return () => {
      off();
      supabase.removeChannel(channel);
    };
  }, [refresh]);

  return count;
}
