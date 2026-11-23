import { Alert, Platform } from 'react-native';
import { handle } from '../utils/handle';
import { fetchStudioAddress, formatKr, type Appointment } from './booking';

/**
 * Opens the phone's own "new event" screen pre-filled with a booking, so it can be saved to
 * Apple Calendar (iCloud), Google Calendar or any other calendar on the phone. The user picks
 * the calendar there; nothing is saved if they cancel.
 *
 * Uses the system dialog from expo-calendar's legacy entry point: on iOS 17+ and Android it
 * needs no calendar permission. expo-calendar is not in Expo Go, so the module is loaded on
 * demand and the rest of the app still runs there.
 */
export async function addAppointmentToCalendar(a: Appointment, role: 'customer' | 'creator'): Promise<void> {
  let Calendar: typeof import('expo-calendar/legacy');
  try {
    Calendar = await import('expo-calendar/legacy');
  } catch {
    Alert.alert('Not available here', 'Adding to your calendar needs the development build of the app (it does not work in Expo Go).');
    return;
  }

  try {
    // Before iOS 17 the dialog needs calendar access.
    if (Platform.OS === 'ios' && Number(Platform.Version) < 17) {
      const { granted } = await Calendar.requestCalendarPermissionsAsync();
      if (!granted) {
        Alert.alert('No calendar access', 'Allow calendar access for Nailed It in Settings to add bookings.');
        return;
      }
    }

    // An offer's own place, else the studio. Best effort: the event is still useful without one.
    const address = a.place || (await fetchStudioAddress(a.creator_id).catch(() => null));
    const services = a.services.map((s) => s.name).join(', ');
    const notes = [
      services,
      `${a.total_minutes} min · ${formatKr(a.total_price)}`,
      a.customer_note?.trim() ? `Comment: ${a.customer_note.trim()}` : null,
      'Booked in Nailed It',
    ].filter(Boolean).join('\n');

    await Calendar.createEventInCalendarAsync({
      title: role === 'customer' ? `Nails with ${handle(a.creator_name)}` : `${handle(a.customer_name)} · ${services}`,
      startDate: toLocalDate(a.appointment_date, a.start_time),
      endDate: toLocalDate(a.appointment_date, a.end_time),
      location: address ?? undefined,
      notes,
    });
  } catch (e) {
    Alert.alert('Could not open your calendar', e instanceof Error ? e.message : String(e));
  }
}

/** "2026-11-23" + "14:30:00" → that time on the phone's clock, like the rest of the app shows it. */
const toLocalDate = (dateKey: string, time: string) => {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(y, m - 1, d, Number(time.slice(0, 2)), Number(time.slice(3, 5)));
};
