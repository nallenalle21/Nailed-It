import { supabase } from './supabase';

/** The signed-in person's account details, for the profile and Account settings. */
export type MyAccount = {
  id: string;
  name: string | null;        // profiles.display_name
  username: string;
  email: string | null;
  city: string | null;        // login account metadata
  memberSince: string | null; // when the account was created (ISO)
};

export async function getMyAccount(): Promise<MyAccount | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase.from('profiles').select('username, display_name, email').eq('id', user.id).single();
  if (error) throw error;
  return {
    id: user.id,
    name: data?.display_name?.trim() || null,
    username: data?.username ?? '',
    email: data?.email ?? user.email ?? null,
    city: (user.user_metadata?.city as string | undefined)?.trim() || null,
    memberSince: user.created_at ?? null,
  };
}

const message = (e: unknown) => (e instanceof Error ? e.message : String((e as any)?.message ?? e));

export async function saveMyName(name: string) {
  const { error } = await supabase.rpc('update_my_name', { p_name: name });
  if (error) throw new Error(message(error));
}

export async function saveMyCity(city: string) {
  const { error } = await supabase.auth.updateUser({ data: { city: city.trim() || null } });
  if (error) throw new Error(message(error));
}

export async function changeMyUsername(username: string) {
  const { error } = await supabase.rpc('change_my_username', { p_username: username });
  if (error) throw new Error(message(error));
}

/** Usernames can change twice in any 7 days. */
export async function getUsernameChangeStatus(): Promise<{ left: number; nextAt: Date | null }> {
  const { data, error } = await supabase.rpc('username_change_status');
  if (error) throw new Error(message(error));
  const row = Array.isArray(data) ? data[0] : data;
  return { left: row?.changes_left ?? 2, nextAt: row?.next_change_at ? new Date(row.next_change_at) : null };
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'june', 'july', 'aug', 'sept', 'oct', 'nov', 'dec'];

/** "22 sept 2026" */
export function formatDayMonthYear(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** What a freelancer sees of a customer (same as the customer's own card; never the email). */
export type CustomerCard = {
  name: string | null;
  username: string;
  city: string | null;
  memberSince: string | null;
  bookings: number;
  collections: number;
};

export async function getCustomerCard(customerId: string): Promise<CustomerCard | null> {
  const { data, error } = await supabase.rpc('get_customer_card', { p_customer: customerId });
  if (error) throw new Error(message(error));
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  return {
    name: row.name ?? null,
    username: row.username ?? '',
    city: row.city ?? null,
    memberSince: row.member_since ?? null,
    bookings: row.bookings ?? 0,
    collections: row.collections ?? 0,
  };
}
