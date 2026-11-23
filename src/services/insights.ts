import { supabase } from './supabase';
import { toDateKey, type Appointment } from './booking';

/** Everything on the Business Insights screen (see supabase/business_insights.sql for definitions). */
export type Insights = {
  from: string;
  to: string;
  money: {
    completed: number;
    revenue: number;
    avg_value: number | null;
    fee_set: boolean;
    fee_percent: number | null;
    fee_fixed_kr: number | null;
    fees: number | null;
    earnings_after_fees: number | null;
    no_shows: number;
    no_show_value: number;
    no_show_rate: number | null;
    cancelled: number;
    cancelled_by_client: number;
    cancelled_by_you: number;
    late_cancels: number;
    late_cancel_value: number;
    cancellation_rate: number | null;
    money_lost: number;
    upcoming_in_period: number;
    upcoming_in_period_value: number;
  };
  clients: {
    clients: number;
    new: number;
    returning: number;
    rebook_rate: number | null;
    avg_days_between_visits: number | null;
  };
  services: { name: string; bookings: number; revenue: number }[];
  /** Bookings per start hour, 0–23 */
  hours: number[];
  /** Bookings per weekday, Monday first */
  weekdays: number[];
  fullness: { available_minutes: number; booked_minutes: number; booked_in_availability_minutes: number; rate: number | null };
  series: { start: string; revenue: number; bookings: number }[];
  series_unit: 'week' | 'month';
  upcoming: { next_7_days: number; next_7_days_bookings: number; next_30_days: number; next_30_days_bookings: number; all: number; all_bookings: number };
  lead_time: { same_day: number; within_week: number; within_month: number; later: number; median_days: number | null };
  requests: {
    total: number;
    accepted: number;
    declined: number;
    expired: number;
    withdrawn: number;
    waiting: number;
    acceptance_rate: number | null;
    avg_response_minutes: number | null;
  };
};

export type PeriodKey = 'month' | '30d' | '3m' | 'year' | 'all';

export const PERIOD_LABELS: Record<PeriodKey, string> = {
  month: 'This month',
  '30d': 'Last 30 days',
  '3m': 'Last 3 months',
  year: 'This year',
  all: 'All time',
};

/**
 * The chosen period as [from, to) dates, and the period of the same length right before it
 * (for the ↑↓ comparison). "All time" has nothing to compare with.
 */
export function periodRange(key: PeriodKey, now = new Date()) {
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  const day = (yy: number, mm: number, dd: number) => toDateKey(new Date(yy, mm, dd));
  switch (key) {
    case 'month':
      return { from: day(y, m, 1), to: day(y, m + 1, 1), prevFrom: day(y, m - 1, 1), prevTo: day(y, m, 1) };
    case '30d':
      return { from: day(y, m, d - 29), to: day(y, m, d + 1), prevFrom: day(y, m, d - 59), prevTo: day(y, m, d - 29) };
    case '3m':
      return { from: day(y, m - 3, d + 1), to: day(y, m, d + 1), prevFrom: day(y, m - 6, d + 1), prevTo: day(y, m - 3, d + 1) };
    case 'year':
      return { from: day(y, 0, 1), to: day(y + 1, 0, 1), prevFrom: day(y - 1, 0, 1), prevTo: day(y, 0, 1) };
    case 'all':
      return { from: null, to: null, prevFrom: null, prevTo: null };
  }
}

/** Insights for the signed-in freelancer; null dates = from their first booking / up to today. */
export async function fetchInsights(from: string | null, to: string | null): Promise<Insights> {
  const { data, error } = await supabase.rpc('business_insights', { p_from: from, p_to: to });
  if (error) throw error;
  return data as Insights;
}

/** The freelancer marks a past booking as a no-show (or undoes it). */
export async function markNoShow(id: string, noShow: boolean): Promise<Appointment> {
  const { data, error } = await supabase.rpc('mark_no_show', { p_id: id, p_no_show: noShow });
  if (error) throw error;
  return data as Appointment;
}
