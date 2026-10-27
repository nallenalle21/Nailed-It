import { supabase } from './supabase';

export type CreatorService = {
  id: string;
  user_id: string;
  name: string;
  category: string | null;
  duration_minutes: number;
  price: number | string;
  discount_price: number | string | null;
};

export type ScheduleEntry = {
  kind: 'available' | 'busy';
  slot_date: string;
  start_time: string;
  end_time: string;
};

export type BookingQuote =
  | { ok: true; total_minutes: number; total_price: number; end_time: string }
  | { ok: false; reason: string };

export type Appointment = {
  id: string;
  creator_id: string;
  customer_id: string;
  creator_name: string;
  customer_name: string;
  appointment_date: string;
  start_time: string;
  end_time: string;
  total_minutes: number;
  total_price: number | string;
  services: { id: string; name: string; duration_minutes: number; price: number }[];
  status: 'confirmed' | 'cancelled';
};

export const START_STEP_MINUTES = 15;

const pad = (n: number) => String(n).padStart(2, '0');

export const toDateKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const toMinutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
export const toTime = (minutes: number) => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
export const formatKr = (amount: number | string) => `${Number(amount).toLocaleString('sv-SE')} kr`;
export const effectivePrice = (s: Pick<CreatorService, 'price' | 'discount_price'>) =>
  Number(s.discount_price ?? s.price);

const SERVICE_COLUMNS = 'id, user_id, name, category, duration_minutes, price, discount_price';
const APPOINTMENT_COLUMNS =
  'id, creator_id, customer_id, creator_name, customer_name, appointment_date, start_time, end_time, total_minutes, total_price, services, status';

export async function fetchCreatorServices(creatorId: string): Promise<CreatorService[]> {
  const { data, error } = await supabase
    .from('services')
    .select(SERVICE_COLUMNS)
    .eq('user_id', creatorId)
    .order('name');
  if (error) throw error;
  return (data ?? []) as CreatorService[];
}

export async function fetchSchedule(creatorId: string, from: string, to: string): Promise<ScheduleEntry[]> {
  const { data, error } = await supabase.rpc('get_creator_schedule', {
    p_creator: creatorId,
    p_from: from,
    p_to: to,
  });
  if (error) throw error;
  return (data ?? []) as ScheduleEntry[];
}

export async function fetchCreatorsAvailableOn(dateKey: string, now = new Date()): Promise<Set<string>> {
  const isToday = dateKey === toDateKey(now);
  const { data, error } = await supabase.rpc('creators_available_on', {
    p_date: dateKey,
    p_after: isToday ? `${pad(now.getHours())}:${pad(now.getMinutes())}` : null,
  });
  if (error) throw error;
  return new Set((data ?? []) as string[]);
}

/**
 * Possible start times (on a 15-minute grid) for one day: inside an availability window
 * and not inside an existing booking. Whether the chosen services fit is checked by the server.
 */
export function startTimesForDay(entries: ScheduleEntry[], dateKey: string, now = new Date()): string[] {
  const dayEntries = entries.filter((e) => e.slot_date === dateKey);
  const busy = dayEntries
    .filter((e) => e.kind === 'busy')
    .map((e) => [toMinutes(e.start_time), toMinutes(e.end_time)] as const);
  const earliest = dateKey === toDateKey(now) ? now.getHours() * 60 + now.getMinutes() : 0;

  const times = new Set<number>();
  for (const e of dayEntries.filter((x) => x.kind === 'available')) {
    const start = toMinutes(e.start_time);
    const end = toMinutes(e.end_time);
    const first = Math.ceil(start / START_STEP_MINUTES) * START_STEP_MINUTES;
    for (let t = first; t < end; t += START_STEP_MINUTES) {
      if (t < earliest) continue;
      if (busy.some(([bs, be]) => t >= bs && t < be)) continue;
      times.add(t);
    }
  }
  return [...times].sort((a, b) => a - b).map(toTime);
}

export function availableDates(entries: ScheduleEntry[], now = new Date()): string[] {
  const dates = new Set<string>();
  for (const e of entries) {
    if (e.kind !== 'available') continue;
    if (startTimesForDay(entries, e.slot_date, now).length > 0) dates.add(e.slot_date);
  }
  return [...dates].sort();
}

export async function quoteBooking(
  creatorId: string,
  dateKey: string,
  startTime: string,
  serviceIds: string[],
): Promise<BookingQuote> {
  const { data, error } = await supabase.rpc('quote_booking', {
    p_creator: creatorId,
    p_date: dateKey,
    p_start: startTime,
    p_service_ids: serviceIds,
  });
  if (error) throw error;
  return data as BookingQuote;
}

export async function bookAppointment(
  creatorId: string,
  dateKey: string,
  startTime: string,
  serviceIds: string[],
): Promise<Appointment> {
  const { data, error } = await supabase.rpc('book_appointment', {
    p_creator: creatorId,
    p_date: dateKey,
    p_start: startTime,
    p_service_ids: serviceIds,
  });
  if (error) throw error;
  return data as Appointment;
}

/** Confirmed appointments where the signed-in user is the customer or the creator (RLS-scoped). */
export async function fetchMyAppointments(role: 'customer' | 'creator'): Promise<Appointment[]> {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!user) throw new Error('Please sign in again.');
  const { data, error } = await supabase
    .from('appointments')
    .select(APPOINTMENT_COLUMNS)
    .eq(role === 'customer' ? 'customer_id' : 'creator_id', user.id)
    .eq('status', 'confirmed')
    .order('appointment_date')
    .order('start_time');
  if (error) throw error;
  return (data ?? []) as Appointment[];
}
