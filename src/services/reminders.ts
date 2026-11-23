import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { fetchMyAppointments, type Appointment } from './booking';
import { handle } from '../utils/handle';

/**
 * Booking reminders, scheduled as local notifications on the customer's phone:
 * 36 h before and 2 h before the appointment. A booking made with less than 36 h left
 * only gets the 2 h reminder (a reminder whose time has already passed is skipped).
 *
 * Local notifications work in Expo Go — no push server or development build needed.
 * The phone's reminders are re-synced from Supabase every time the app is opened, so
 * bookings that were cancelled or moved get their reminders removed/updated.
 */

const CHANNEL_ID = 'booking-reminders';
const KIND = 'booking-reminder';
const HOUR = 60 * 60 * 1000;
// iOS keeps at most 64 scheduled notifications per app; stay well below that.
const MAX_SCHEDULED = 50;
// Don't schedule a reminder that would fire within the next minute.
const MIN_LEAD_MS = 60 * 1000;
// The 36 h reminder shouldn't wake anyone up: if it lands between 21:00 and 09:00
// it's moved to 09:00 that morning (still at least 24 h before the appointment).
const QUIET_FROM_HOUR = 21;
const QUIET_UNTIL_HOUR = 9;

type ReminderKind = {
  hoursBefore: number;
  avoidNight: boolean;
  title: string;
  body: (a: Appointment, when: string) => string;
};

const REMINDERS: ReminderKind[] = [
  {
    hoursBefore: 36,
    avoidNight: true,
    title: 'nail appointment coming up 💅',
    body: (a, when) => `${when} with ${handle(a.creator_name)}. need to change something? send them a message in the app.`,
  },
  {
    hoursBefore: 2,
    avoidNight: false,
    title: 'see you soon 💅',
    body: (a, when) => `your appointment with ${handle(a.creator_name)} starts ${when}. tap to see the address.`,
  },
];

const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** "2026-11-25" + "14:30:00" → Date in the phone's local time. */
export function appointmentStart(a: Pick<Appointment, 'appointment_date' | 'start_time'>): Date {
  const [y, m, d] = a.appointment_date.split('-').map(Number);
  const [h, min] = a.start_time.split(':').map(Number);
  return new Date(y, m - 1, d, h, min);
}

/** "wed 25 nov at 14:30" (36 h reminder) or "at 14:30" (2 h reminder). */
function describeWhen(start: Date, withDate: boolean): string {
  const time = `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`;
  if (!withDate) return `at ${time}`;
  return `${DAYS[start.getDay()]} ${start.getDate()} ${MONTHS[start.getMonth()]} at ${time}`;
}

/** Moves a time between 21:00 and 09:00 to 09:00 the following morning. */
function afterQuietHours(t: Date): Date {
  const h = t.getHours();
  if (h >= QUIET_UNTIL_HOUR && h < QUIET_FROM_HOUR) return t;
  const morning = new Date(t.getFullYear(), t.getMonth(), t.getDate(), QUIET_UNTIL_HOUR, 0);
  if (h >= QUIET_FROM_HOUR) morning.setDate(morning.getDate() + 1);
  return morning;
}

export type PlannedReminder = {
  identifier: string;
  fireAt: Date;
  title: string;
  body: string;
  appointmentId: string;
};

/** Which reminders a list of bookings should have right now (pure — no phone APIs). */
export function planReminders(appointments: Appointment[], now = new Date()): PlannedReminder[] {
  const planned: PlannedReminder[] = [];
  for (const a of appointments) {
    if (a.status !== 'confirmed') continue;
    const start = appointmentStart(a);
    for (const r of REMINDERS) {
      const due = new Date(start.getTime() - r.hoursBefore * HOUR);
      // Booked with less than 36 h left → no 36 h reminder (only the 2 h one).
      if (due.getTime() - now.getTime() < MIN_LEAD_MS) continue;
      const fireAt = r.avoidNight ? afterQuietHours(due) : due;
      planned.push({
        identifier: `${KIND}-${a.id}-${r.hoursBefore}h`,
        fireAt,
        title: r.title,
        body: r.body(a, describeWhen(start, r.hoursBefore > 12)),
        appointmentId: a.id,
      });
    }
  }
  return planned.sort((x, y) => x.fireAt.getTime() - y.fireAt.getTime()).slice(0, MAX_SCHEDULED);
}

/** Shows reminders as a banner even when the app is open. Call once, at app start. */
export function configureNotifications() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

/**
 * Checks (and optionally asks for) notification permission.
 * We only ask right after a booking — that's when the user understands why.
 */
export async function ensureNotificationPermission(askIfNeeded: boolean): Promise<boolean> {
  if (Platform.OS === 'android') {
    // Android 13+ only shows the permission prompt once a channel exists.
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Booking reminders',
      importance: Notifications.AndroidImportance.HIGH,
    });
  }
  const current = await Notifications.getPermissionsAsync();
  if (current.granted || current.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL) return true;
  if (!askIfNeeded || !current.canAskAgain) return false;
  const asked = await Notifications.requestPermissionsAsync();
  return asked.granted || asked.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
}

/** Removes every booking reminder from this phone (e.g. on sign out). */
export async function clearBookingReminders() {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((n) => n.identifier.startsWith(KIND))
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
  );
}

let syncing: Promise<void> | null = null;
let syncAgain = false;
let askNext = false;

/**
 * Makes the phone's scheduled reminders match the user's confirmed bookings in Supabase.
 * Safe to call often: on app open, when the app comes back to the foreground, after booking.
 */
export function syncBookingReminders(options: { askPermission?: boolean } = {}): Promise<void> {
  askNext = askNext || !!options.askPermission;
  // A sync is already running: run once more when it's done, so a booking made
  // just now isn't missed.
  if (syncing) {
    syncAgain = true;
    return syncing;
  }
  syncing = (async () => {
    do {
      syncAgain = false;
      const ask = askNext;
      askNext = false;
      await syncOnce(ask);
    } while (syncAgain);
    syncing = null;
  })();
  return syncing;
}

async function syncOnce(askPermission: boolean) {
  try {
    if (!(await ensureNotificationPermission(askPermission))) return;
    const planned = planReminders(await fetchMyAppointments('customer'));
    await clearBookingReminders();
    for (const p of planned) {
      await Notifications.scheduleNotificationAsync({
        identifier: p.identifier,
        content: {
          title: p.title,
          body: p.body,
          sound: true,
          data: { kind: KIND, appointmentId: p.appointmentId },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: p.fireAt,
          channelId: CHANNEL_ID,
        },
      });
    }
  } catch (e) {
    // Reminders are a nice-to-have: never let them break the app.
    console.warn('[reminders] Could not sync booking reminders:', e instanceof Error ? e.message : e);
  }
}

/** True if a tapped notification is one of our booking reminders. */
export function isBookingReminder(response: Notifications.NotificationResponse | null | undefined): boolean {
  return response?.notification.request.content.data?.kind === KIND;
}
