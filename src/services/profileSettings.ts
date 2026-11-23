import { supabase } from './supabase';
import { formatKr } from './booking';

/** A freelancer's profile settings (see supabase/profile_settings.sql). All shown to customers. */
export type ProfileSettings = {
  bio: string | null;
  languages: string[];
  accessibility: Accessibility[];
  accessibility_note: string | null;
  paused: boolean;
  pause_from: string | null;
  pause_until: string | null;
  cancel_notice_hours: CancelNotice;
  deposit_enabled: boolean;
  deposit_type: 'kr' | 'percent' | null;
  deposit_amount: number | null;
  deposit_instructions: string | null;
  returning_discount_percent: number | null;
  weekly_schedule: ScheduleEntry[];
  auto_accept_bookings: boolean;
};

export type Accessibility = 'step_free' | 'elevator' | 'stairs' | 'parking' | 'public_transport' | 'wheelchair';
export type CancelNotice = 0 | 24 | 48 | 168;
/** Regular hours for one weekday (1 = Monday … 7 = Sunday). */
export type ScheduleEntry = { day: number; start: string; end: string };
export type Bundle = { id: string; user_id: string; name: string; service_ids: string[]; duration_minutes: number; price: number | string };
export type NotificationSettings = { new_bookings: boolean; booking_requests: boolean; cancellations: boolean; reminders: boolean };

export const SETTINGS_COLUMNS =
  'bio, languages, accessibility, accessibility_note, paused, pause_from, pause_until, cancel_notice_hours, ' +
  'deposit_enabled, deposit_type, deposit_amount, deposit_instructions, returning_discount_percent, weekly_schedule, auto_accept_bookings';

export const LANGUAGE_OPTIONS = [
  'Swedish', 'English', 'Arabic', 'Persian', 'Spanish', 'Finnish', 'Polish', 'Somali',
  'Turkish', 'German', 'French', 'Thai', 'Vietnamese', 'Tigrinya', 'Kurdish', 'Bosnian/Croatian/Serbian',
];

export const ACCESSIBILITY_LABELS: Record<Accessibility, string> = {
  step_free: 'Step-free entrance',
  elevator: 'Elevator',
  stairs: 'Stairs only',
  parking: 'Parking nearby',
  public_transport: 'Close to public transport',
  wheelchair: 'Wheelchair accessible',
};

export const CANCEL_NOTICE_LABELS: Record<CancelNotice, string> = {
  0: 'Flexible: cancel any time before',
  24: 'At least 24 hours before',
  48: 'At least 48 hours before',
  168: 'At least 7 days before',
};

/** Suggestions when tagging portfolio photos (their own services are suggested too). */
export const STYLE_TAGS = ['French', 'Chrome', 'Almond', 'Coffin', 'Ombré', 'Glitter', 'Minimal', '3D art', 'Pastel', 'Natural', 'Bridal'];

export async function fetchMySettings(): Promise<ProfileSettings & { id: string }> {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!user) throw new Error('Please sign in again.');
  const { data, error } = await supabase.from('profiles').select(`id, ${SETTINGS_COLUMNS}`).eq('id', user.id).single();
  if (error) throw error;
  return data as unknown as ProfileSettings & { id: string };
}

/** Saves the given fields; the server checks each one. */
export async function updateMyProfile(fields: Partial<Record<keyof ProfileSettings, unknown>>): Promise<void> {
  const { error } = await supabase.rpc('update_my_profile', { p_data: fields });
  if (error) throw error;
}

/** Copies the weekly hours into the calendar for the coming weeks; returns how many slots were added. */
export async function fillWeeklySchedule(weeks = 4): Promise<number> {
  const { data, error } = await supabase.rpc('fill_weekly_schedule', { p_weeks: weeks });
  if (error) throw error;
  return data as number;
}

// ---- Combined treatments ----
export async function fetchBundles(userId: string): Promise<Bundle[]> {
  const { data, error } = await supabase.from('service_bundles').select('*').eq('user_id', userId).order('created_at');
  if (error) throw error;
  return (data ?? []) as Bundle[];
}
export async function addBundle(b: Omit<Bundle, 'id' | 'user_id'>): Promise<void> {
  const { error } = await supabase.from('service_bundles').insert(b);
  if (error) throw error;
}
export async function deleteBundle(id: string): Promise<void> {
  const { error } = await supabase.from('service_bundles').delete().eq('id', id);
  if (error) throw error;
}

// ---- Notifications (everyone) ----
export async function fetchNotificationSettings(): Promise<NotificationSettings> {
  const { data, error } = await supabase.from('notification_settings').select('new_bookings, booking_requests, cancellations, reminders').maybeSingle();
  if (error) throw error;
  return (data as NotificationSettings | null) ?? { new_bookings: true, booking_requests: true, cancellations: true, reminders: true };
}
export async function saveNotificationSettings(s: NotificationSettings): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Please sign in again.');
  const { error } = await supabase.from('notification_settings')
    .upsert({ user_id: user.id, ...s, updated_at: new Date().toISOString() });
  if (error) throw error;
}

// ---- Portfolio tags ----
export async function setPostTags(postId: string, tags: string[]): Promise<void> {
  const { error } = await supabase.from('vendor_posts').update({ tags }).eq('id', postId);
  if (error) throw error;
}

// ---- How customers see the booking rules ----
export function depositText(s: Pick<ProfileSettings, 'deposit_enabled' | 'deposit_type' | 'deposit_amount'>): string | null {
  if (!s.deposit_enabled || s.deposit_amount == null) return null;
  return s.deposit_type === 'percent' ? `Deposit ${Number(s.deposit_amount)} % of the price` : `Deposit ${formatKr(s.deposit_amount)}`;
}

export function cancelPolicyText(hours: number | null | undefined): string {
  return !hours ? 'Free cancellation any time before the appointment'
    : hours >= 168 ? 'Free cancellation up to 7 days before'
    : `Free cancellation up to ${hours} hours before`;
}

/** "Taking a break until 12 Jan" when a pause covers today, else null. */
export function pauseText(s: Pick<ProfileSettings, 'paused' | 'pause_from' | 'pause_until'>, today = new Date()): string | null {
  if (!s.paused) return null;
  const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const t = key(today);
  const label = (k: string) => {
    const [y, m, d] = k.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  };
  if (s.pause_from && s.pause_from > t) return `Taking a break ${label(s.pause_from)}–${s.pause_until ? label(s.pause_until) : '…'}`;
  if (s.pause_until && s.pause_until < t) return null;
  return s.pause_until ? `Taking a break until ${label(s.pause_until)}` : 'Taking a break: not taking bookings right now';
}
