import { supabase } from './supabase';
import type { Appointment } from './booking';

/** How far back the freelancer's booking flow goes. */
export const FLOW_DAYS = 14;

/** The freelancer's choice in Settings: true = bookings are confirmed straight away. */
export async function fetchAutoAcceptBookings(): Promise<boolean> {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!user) throw new Error('Please sign in again.');
  const { data, error } = await supabase.from('profiles').select('auto_accept_bookings').eq('id', user.id).single();
  if (error) throw error;
  return (data as { auto_accept_bookings: boolean | null }).auto_accept_bookings ?? true;
}

export async function setAutoAcceptBookings(value: boolean): Promise<void> {
  const { error } = await supabase.rpc('set_auto_accept_bookings', { p_auto: value });
  if (error) throw error;
}

/**
 * The freelancer's booking flow: every pending request, plus everything booked (or answered)
 * in the last FLOW_DAYS days. Newest first; the screen pins the requests on top.
 */
export async function fetchBookingFlow(creatorId: string, now = new Date()): Promise<Appointment[]> {
  const since = new Date(now.getTime() - FLOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('appointments')
    .select('*')
    .eq('creator_id', creatorId)
    .or(`status.eq.pending,created_at.gte.${since}`)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Appointment[];
}

/** Accept or decline a pending request; the customer gets a chat message (and a push) either way. */
export async function respondToRequest(id: string, accept: boolean, reason?: string): Promise<Appointment> {
  const { data, error } = await supabase.rpc('respond_booking_request', {
    p_id: id,
    p_accept: accept,
    p_reason: reason?.trim() || null,
  });
  if (error) throw error;
  return data as Appointment;
}

/** The flow has been looked at: no more "new" dots next time. */
export async function markBookingsSeen(): Promise<void> {
  const { error } = await supabase.rpc('mark_bookings_seen');
  if (error) throw error;
}
