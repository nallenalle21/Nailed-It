import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors } from '../../theme';

/** Like Apple Calendar's "View" menu: three month densities, or one day as a timeline. */
export type CalendarView = 'compact' | 'stacked' | 'details' | 'day';
export const MONTH_VIEWS: CalendarView[] = ['compact', 'stacked', 'details'];

export const VIEW_LABELS: Record<CalendarView, string> = {
  compact: 'Compact',
  stacked: 'Stacked',
  details: 'Details',
  day: 'Day',
};

/**
 * Something shown in the calendar. Times are 'HH:MM', dates 'YYYY-MM-DD'.
 * - booked: a confirmed booking
 * - request: a booking waiting for the freelancer's answer
 * - available: a freelancer's free time (drawn softly, behind bookings)
 * - inactive: cancelled / declined / expired (greyed out)
 */
export type CalendarEvent = {
  id: string;
  date: string;
  start: string;
  end: string;
  /** Short text for the month "Details" view and the timeline, e.g. "@anna" or "Gel nails". */
  title: string;
  subtitle?: string;
  kind: 'booked' | 'request' | 'available' | 'inactive';
};

export const EVENT_COLORS: Record<CalendarEvent['kind'], { fill: string; text: string }> = {
  booked: { fill: colors.blue, text: colors.background },
  request: { fill: colors.wine, text: colors.background },
  available: { fill: colors.line, text: colors.ink },
  inactive: { fill: 'rgba(11,21,14,0.15)', text: colors.inkMuted },
};

export const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

/** Events grouped by date, each day sorted by start time (availability first when equal). */
export function eventsByDate(events: CalendarEvent[]): Record<string, CalendarEvent[]> {
  const byDate: Record<string, CalendarEvent[]> = {};
  for (const e of events) (byDate[e.date] ??= []).push(e);
  for (const list of Object.values(byDate)) {
    list.sort((a, b) => a.start.localeCompare(b.start) || Number(b.kind === 'available') - Number(a.kind === 'available'));
  }
  return byDate;
}

/**
 * The chosen view, remembered on this phone (separately for the customer and freelancer
 * calendars). Starts as Compact, today's look.
 */
export function useCalendarView(storageKey: string): [CalendarView, (view: CalendarView) => void] {
  const [view, setView] = useState<CalendarView>('compact');

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(storageKey)
      .then((saved) => {
        if (active && saved && saved in VIEW_LABELS) setView(saved as CalendarView);
      })
      .catch(() => {});
    return () => { active = false; };
  }, [storageKey]);

  const choose = (next: CalendarView) => {
    setView(next);
    AsyncStorage.setItem(storageKey, next).catch(() => {});
  };
  return [view, choose];
}
