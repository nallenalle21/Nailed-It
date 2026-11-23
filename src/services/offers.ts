import { supabase } from './supabase';
import { toMinutes, toTime, type Appointment } from './booking';

/** A booking offer a freelancer sends in a chat (see supabase/booking_offers.sql). */
export type BookingOffer = {
  id: string;
  chat_id: string;
  creator_id: string;
  customer_id: string;
  title: string;
  notes: string | null;
  offer_date: string;
  start_time: string;
  duration_minutes: number;
  place: string | null;
  price: number | string;
  status: 'pending' | 'accepted' | 'declined' | 'withdrawn';
  appointment_id: string | null;
  created_at: string;
};

export type NewOffer = {
  title: string;
  notes: string;
  date: string; // YYYY-MM-DD
  start: string; // HH:MM
  durationMinutes: number;
  place: string;
  price: number;
};

/** All offers in a chat (RLS: only the two people in it can read them). */
export async function fetchChatOffers(chatId: string): Promise<BookingOffer[]> {
  const { data, error } = await supabase.from('booking_offers').select('*').eq('chat_id', chatId);
  if (error) throw error;
  return (data ?? []) as BookingOffer[];
}

/** Sends an offer and posts the chat message that shows it. */
export async function sendBookingOffer(chatId: string, offer: NewOffer): Promise<BookingOffer> {
  const { data, error } = await supabase.rpc('send_booking_offer', {
    p_chat_id: chatId,
    p_title: offer.title,
    p_notes: offer.notes,
    p_date: offer.date,
    p_start: offer.start,
    p_duration: offer.durationMinutes,
    p_place: offer.place,
    p_price: offer.price,
  });
  if (error) throw error;
  return data as BookingOffer;
}

/** Customer's answer. Accepting books it and returns the new appointment. */
export async function respondToOffer(offerId: string, accept: boolean): Promise<Appointment | null> {
  const { data, error } = await supabase.rpc('respond_booking_offer', { p_offer: offerId, p_accept: accept });
  if (error) throw error;
  return accept ? ((data as { appointment: Appointment }).appointment ?? null) : null;
}

export async function withdrawOffer(offerId: string): Promise<void> {
  const { error } = await supabase.rpc('withdraw_booking_offer', { p_offer: offerId });
  if (error) throw error;
}

export const offerEndTime = (o: BookingOffer) => toTime(toMinutes(o.start_time) + o.duration_minutes);

/** A pending offer whose start time has passed can no longer be accepted. */
export function isOfferExpired(o: BookingOffer, now = new Date()) {
  if (o.status !== 'pending') return false;
  const [y, m, d] = o.offer_date.split('-').map(Number);
  const start = new Date(y, m - 1, d, Number(o.start_time.slice(0, 2)), Number(o.start_time.slice(3, 5)));
  return start <= now;
}
