import { Fragment, useCallback, useRef, useState, type ComponentRef } from 'react';
import { RefreshStar, useStarRefresh } from '../../components/SparkleStars';
import StarredTitle from '../../components/StarredTitle';
import { handle } from '../../utils/handle';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { colors, fonts } from '../../theme';
import { Text } from '../../components/AppText';
import {
  View,
  TouchableOpacity,
  ScrollView,
  Modal,
  TextInput,
  Alert,
  StyleSheet,
  RefreshControl,
  Platform,
  type AlertButton,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../services/supabase';
import { appointmentStart, canCancel, cancelAppointment, fetchMyAppointments, formatKr, type Appointment } from '../../services/booking';
import { markNoShow } from '../../services/insights';
import { addAppointmentToCalendar } from '../../services/deviceCalendar';
import { fetchBookingFlow, markBookingsSeen, respondToRequest } from '../../services/bookingRequests';
import BookingActivity from '../../components/BookingActivity';
import ReasonDialog from '../../components/ReasonDialog';
import MonthGrid from '../../components/calendar/MonthGrid';
import DayTimeline, { HOUR_HEIGHT } from '../../components/calendar/DayTimeline';
import { WeekHeader } from '../../components/calendar/WeekTimeline';
import TimeWheel from '../../components/calendar/TimeWheel';
import ViewMenu from '../../components/calendar/ViewMenu';
import { MONTH_VIEWS, eventsByDate, useCalendarView, type CalendarEvent } from '../../components/calendar/types';


type Slot = { id: string; date: string; start: string; end: string; service: string };
type BookedSlot = Slot & { customer: string };
type CreatorSlotRow = {
  id: string;
  slot_date: string;
  start_time: string;
  end_time: string;
  service: string;
  status: 'available' | 'booked';
  customer_name: string | null;
};

const SLOT_COLUMNS = 'id, slot_date, start_time, end_time, service, status, customer_name';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const TIME_REGEX = /^([01]?\d|2[0-3]):[0-5]\d$/;

const pad = (n: number) => String(n).padStart(2, '0');
const dateKey = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
const normalize = (t: string) => {
  const [h, m] = t.split(':');
  return `${pad(Number(h))}:${m}`;
};
const longLabel = (key: string) => {
  const [, m, d] = key.split('-');
  return `${Number(d)} ${MONTHS[Number(m) - 1]}`;
};
const toCalendarSlot = (row: CreatorSlotRow): Slot | BookedSlot => {
  const slot: Slot = {
    id: row.id,
    date: row.slot_date,
    start: row.start_time.slice(0, 5),
    end: row.end_time.slice(0, 5),
    service: row.service,
  };
  return row.status === 'booked'
    ? { ...slot, customer: row.customer_name ?? '' }
    : slot;
};
const getErrorMessage = (error: unknown, fallback: string): string => {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === '42501'
  ) {
    return 'Supabase denied calendar access. Check that this slot belongs to your signed-in account and that its RLS policy is installed.';
  }
  if (error instanceof Error) return error.message;
  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string'
  ) {
    return error.message;
  }
  return fallback;
};

export default function CalendarCreator() {
  // Pull down to refresh: spinning star instead of the system spinner.
  const pull = useStarRefresh();
  const today = new Date();
  const todayKey = dateKey(today.getFullYear(), today.getMonth(), today.getDate());
  const nowTime = `${pad(today.getHours())}:${pad(today.getMinutes())}`;

  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [selected, setSelected] = useState(todayKey);
  const [creatorId, setCreatorId] = useState<string | null>(null);
  const [availableSlots, setAvailableSlots] = useState<Slot[]>([]);
  const [bookedSlots, setBookedSlots] = useState<BookedSlot[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(true);
  const [slotsLoadError, setSlotsLoadError] = useState('');
  // Booking flow: requests to answer + recent bookings (see components/BookingFlow).
  const [flow, setFlow] = useState<Appointment[]>([]);
  const [flowLoading, setFlowLoading] = useState(true);
  const [busyRequestId, setBusyRequestId] = useState<string | null>(null);
  // Booking (or request) the freelancer is about to cancel/decline from the day list.
  const [cancelling, setCancelling] = useState<Appointment | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const navigation = useNavigation<any>();
  // Compact / Stacked / Details / Day, remembered on this phone.
  const [view, setView] = useCalendarView('calendarView.creator');
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);

  const [modalVisible, setModalVisible] = useState(false);
  const [startInput, setStartInput] = useState('');
  const [endInput, setEndInput] = useState('');
  const [error, setError] = useState('');

  // Reload on focus so appointments booked by customers show up.
  useFocusEffect(useCallback(() => {
    let isMounted = true;

    const loadCreatorSlots = async () => {
      try {
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError) throw authError;
        if (!user) throw new Error('No signed-in creator was found.');

        const [{ data, error }, appointmentRows, flowRows] = await Promise.all([
          supabase
            .from('creator_slots')
            .select(SLOT_COLUMNS)
            .eq('creator_id', user.id)
            .order('slot_date')
            .order('start_time'),
          // A missing appointments table must not stop the availability calendar from loading.
          // Pending requests hold their time, so they are loaded too.
          fetchMyAppointments('creator', ['confirmed', 'pending', 'no_show']).catch((e) => {
            console.warn('[Calendar] Could not load appointments:', e);
            return [] as Appointment[];
          }),
          fetchBookingFlow(user.id).catch((e) => {
            console.warn('[Calendar] Could not load the booking flow:', e);
            return null;
          }),
        ]);
        if (error) throw error;
        if (!isMounted) return;

        setAppointments(appointmentRows);
        if (flowRows) {
          // "New" happenings count as seen once the Booking activity pop-up is opened.
          setFlow(flowRows);
        }

        const rows = (data ?? []) as CreatorSlotRow[];
        setCreatorId(user.id);
        setAvailableSlots(
          rows
            .filter((row) => row.status === 'available')
            .map((row) => toCalendarSlot(row) as Slot)
        );
        setBookedSlots(
          rows
            .filter((row) => row.status === 'booked')
            .map((row) => toCalendarSlot(row) as BookedSlot)
        );
      } catch (error) {
        if (!isMounted) return;
        setSlotsLoadError(getErrorMessage(error, 'Could not load the creator calendar.'));
      } finally {
        if (isMounted) { setSlotsLoading(false); setFlowLoading(false); }
        pull.doneLoading();
      }
    };

    void loadCreatorSlots();
    return () => {
      isMounted = false;
    };
  }, [pull.refreshKey, reloadKey])); // eslint-disable-line react-hooks/exhaustive-deps

  const getAvailableSlots = (key: string): Slot[] =>
    availableSlots
      .filter((slot) => slot.date === key)
      .sort((a, b) => a.start.localeCompare(b.start));
  const getBookedSlots = (key: string): BookedSlot[] =>
    bookedSlots
      .filter((slot) => slot.date === key)
      .sort((a, b) => a.start.localeCompare(b.start));

  /**
   * What is still free on a day: each availability window minus that day's bookings.
   * A fully booked window disappears; a partly booked one shows only its free part
   * (e.g. 10:00–12:00 with a 10:00–11:30 booking → 11:30–12:00), matching what customers can book.
   * Each piece keeps its window's id, so removing it still removes the saved window.
   */
  const getFreeSlots = (key: string): Slot[] => {
    const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
    const toHHMM = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    const busy = [
      ...appointments.filter((a) => a.appointment_date === key).map((a) => [toMin(a.start_time), toMin(a.end_time)]),
      ...getBookedSlots(key).map((b) => [toMin(b.start), toMin(b.end)]),
    ].sort((a, b) => a[0] - b[0]);
    const free: Slot[] = [];
    for (const slot of getAvailableSlots(key)) {
      let cursor = toMin(slot.start);
      const end = toMin(slot.end);
      for (const [bs, be] of busy) {
        if (be <= cursor || bs >= end) continue;
        if (bs > cursor) free.push({ ...slot, start: toHHMM(cursor), end: toHHMM(bs) });
        cursor = Math.max(cursor, be);
      }
      if (cursor < end) free.push({ ...slot, start: toHHMM(cursor), end: toHHMM(end) });
    }
    return free;
  };

  // Find the next future appointment; availability alone is not a booking.
  type Upcoming = { date: string; start: string; end: string; label: string };
  const upcoming: Upcoming[] = [
    ...bookedSlots.map((s) => ({ date: s.date, start: s.start, end: s.end, label: `${s.service} · ${handle(s.customer)}` })),
    ...appointments.filter((a) => a.status === 'confirmed').map((a) => ({
      date: a.appointment_date,
      start: a.start_time.slice(0, 5),
      end: a.end_time.slice(0, 5),
      label: `${a.services.map((s) => s.name).join(', ')} · ${handle(a.customer_name)}`,
    })),
  ];
  const nextUp: Upcoming | null =
    upcoming
      .filter((slot) => slot.date > todayKey || (slot.date === todayKey && slot.start > nowTime))
      .sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start))[0] ?? null;
  const appointmentsForDay = appointments.filter((a) => a.appointment_date === selected);

  const answerRequest = async (a: Appointment, accept: boolean, reason?: string) => {
    setBusyRequestId(a.id);
    try {
      // Accepted or declined: the customer is told. (Adding to the phone calendar is the small button on the booking.)
      await respondToRequest(a.id, accept, reason);
    } catch (e) {
      Alert.alert(accept ? 'Could not accept' : 'Could not decline', getErrorMessage(e, 'Please try again.'));
    } finally {
      setBusyRequestId(null);
      setReloadKey((n) => n + 1);
    }
  };

  /** A past booking the client didn't come to (counts as money lost in Insights), or undo that. */
  const setNoShow = (a: Appointment, noShow: boolean) => {
    const run = async () => {
      setBusyRequestId(a.id);
      try {
        await markNoShow(a.id, noShow);
      } catch (e) {
        Alert.alert('Could not update', getErrorMessage(e, 'Please try again.'));
      } finally {
        setBusyRequestId(null);
        setReloadKey((n) => n + 1);
      }
    };
    if (!noShow) { void run(); return; }
    Alert.alert('Mark as no-show?', `${handle(a.customer_name)} didn’t come to this booking. It counts as money lost in your Insights. You can undo it.`, [
      { text: 'Back', style: 'cancel' },
      { text: 'Mark no-show', style: 'destructive', onPress: () => void run() },
    ]);
  };

  const cancelBooking = async (a: Appointment, reason: string) => {
    setBusyRequestId(a.id);
    try {
      await cancelAppointment(a.id, reason);
    } catch (e) {
      Alert.alert('Could not cancel', getErrorMessage(e, 'Please try again.'));
    } finally {
      setBusyRequestId(null);
      setReloadKey((n) => n + 1);
    }
  };

  const openChat = (a: Appointment) =>
    navigation.navigate('ChatRoom', {
      chatId: [a.creator_id, a.customer_id].sort().join('_'),
      customerName: a.customer_name,
      role: 'creator',
    });

  // What the calendar views draw: free time (soft), bookings (blue) and requests (wine).
  const events: CalendarEvent[] = [
    ...[...new Set(availableSlots.map((slot) => slot.date))].flatMap((date) =>
      getFreeSlots(date).map((slot) => ({
        id: slot.id, date, start: slot.start, end: slot.end, title: 'Available', kind: 'available' as const,
      }))),
    ...appointments.map((a) => ({
      id: a.id,
      date: a.appointment_date,
      start: a.start_time.slice(0, 5),
      end: a.end_time.slice(0, 5),
      title: handle(a.customer_name),
      subtitle: a.services.map((sv) => sv.name).join(', '),
      kind: a.status === 'pending' ? ('request' as const) : a.status === 'no_show' ? ('inactive' as const) : ('booked' as const),
    })),
    ...bookedSlots.map((slot) => ({
      id: slot.id, date: slot.date, start: slot.start, end: slot.end,
      title: handle(slot.customer), subtitle: slot.service, kind: 'booked' as const,
    })),
  ];
  const byDate = eventsByDate(events);

  const changeMonth = (delta: number) => {
    const d = new Date(year, month + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
  };

  /** Pick a day; the month shown follows it (so Day view and the month stay in step). */
  const selectDay = (key: string) => {
    const [y, m] = key.split('-').map(Number);
    setSelected(key);
    setYear(y);
    setMonth(m - 1);
  };
  const changeDay = (delta: number) => {
    const [y, m, d] = selected.split('-').map(Number);
    const next = new Date(y, m - 1, d + delta);
    selectDay(dateKey(next.getFullYear(), next.getMonth(), next.getDate()));
  };
  // Pinch on the month: Compact ↔ Stacked ↔ Details.
  // Choosing a view: Compact, Stacked and Details start at the top of the page
  // (the week view scrolls to the hours by itself).
  const chooseView = (next: typeof view) => {
    setView(next);
    if (next !== 'week') scrollRef.current?.scrollTo({ y: 0, animated: false });
  };
  const pinchView = (direction: 1 | -1) => {
    const i = MONTH_VIEWS.indexOf(view);
    const next = MONTH_VIEWS[Math.min(MONTH_VIEWS.length - 1, Math.max(0, i + direction))];
    if (next !== view) setView(next);
  };

  const openModal = () => {
    setEditingSlot(null);
    setStartInput('09:00');
    setEndInput('10:00');
    setError('');
    setModalVisible(true);
  };

  /** Long-press on the Day timeline: add availability from that time (one hour, adjustable). */
  // Day view: a time range marked by press, hold and drag → "add availability" with it filled in.
  const [selectingRange, setSelectingRange] = useState(false);
  // Tapping an availability slot: a small menu (Edit / Remove / Cancel). Edit reuses the add form.
  const [slotMenu, setSlotMenu] = useState<Slot | null>(null);
  const [editingSlot, setEditingSlot] = useState<Slot | null>(null);
  /** The saved availability a (possibly split-up) free piece belongs to. */
  const openSlotMenu = (piece: Slot) => setSlotMenu(availableSlots.find((s) => s.id === piece.id) ?? piece);
  const startEdit = (slot: Slot) => {
    setEditingSlot(slot);
    setStartInput(slot.start);
    setEndInput(slot.end);
    setError('');
    setSlotMenu(null);
    setModalVisible(true); // same pop-up: switches from the menu to the form
  };
  const removeFromMenu = (slot: Slot) => {
    setSlotMenu(null);
    setTimeout(() => confirmRemoveAvailable(slot), 350); // after the menu has closed
  };
  const openModalRange = (startMinutes: number, endMinutes: number) => {
    const hhmmOf = (m: number) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
    setEditingSlot(null);
    setStartInput(hhmmOf(startMinutes));
    setEndInput(hhmmOf(Math.min(endMinutes, 23 * 60 + 45)));
    setError('');
    setModalVisible(true);
  };

  /** Tap on something in the Day timeline. */
  const onDayEventPress = (e: CalendarEvent) => {
    if (e.kind === 'available') {
      const slot = getFreeSlots(e.date).find((sl) => sl.id === e.id && sl.start === e.start);
      if (slot) openSlotMenu(slot);
      return;
    }
    const a = appointments.find((x) => x.id === e.id);
    if (!a) {
      const legacy = bookedSlots.find((sl) => sl.id === e.id);
      if (legacy) confirmCancelBooking(legacy);
      return;
    }
    // Android shows at most three buttons; tapping outside closes it there.
    const close: AlertButton[] = Platform.OS === 'ios' ? [{ text: 'Close', style: 'cancel' }] : [];
    const started = appointmentStart(a) <= new Date();
    const buttons: AlertButton[] = a.status === 'no_show'
      ? [
          { text: 'Undo no-show', onPress: () => setNoShow(a, false) },
          { text: 'Chat', onPress: () => openChat(a) },
          ...close,
        ]
      : a.status === 'confirmed' && started
      ? [
          { text: 'Mark as no-show…', style: 'destructive', onPress: () => setNoShow(a, true) },
          { text: 'Chat', onPress: () => openChat(a) },
          ...close,
        ]
      : a.status === 'pending'
      ? [
          { text: 'Accept', onPress: () => void answerRequest(a, true) },
          { text: 'Decline…', style: 'destructive', onPress: () => setCancelling(a) },
          { text: 'Chat', onPress: () => openChat(a) },
          ...close,
        ]
      : [
          { text: 'Add to phone calendar', onPress: () => void addAppointmentToCalendar(a, 'creator') },
          { text: 'Chat', onPress: () => openChat(a) },
          ...(canCancel(a) ? [{ text: 'Cancel booking…', style: 'destructive' as const, onPress: () => setCancelling(a) }] : []),
          ...close,
        ];
    Alert.alert(
      `${handle(a.customer_name)} · ${e.start}–${e.end}`,
      [
        a.status === 'pending' ? 'Booking request, waiting for your answer' : null,
        e.subtitle,
        `${a.total_minutes} min · ${formatKr(a.total_price)}`,
        a.customer_note ? `“${a.customer_note}”` : null,
      ].filter(Boolean).join('\n'),
      buttons,
      { cancelable: true },
    );
  };

  const saveSlot = async () => {
    if (!TIME_REGEX.test(startInput) || !TIME_REGEX.test(endInput)) {
      setError('Use the format HH:MM, e.g. 09:00');
      return;
    }
    const slot: Omit<Slot, 'id'> = {
      date: editingSlot ? editingSlot.date : selected,
      start: normalize(startInput),
      end: normalize(endInput),
      service: 'Available',
    };
    if (slot.start >= slot.end) {
      setError('End time must be after start time');
      return;
    }
    if (!creatorId) {
      setError('The creator calendar is not ready. Try again shortly.');
      return;
    }
    const existingSlots = [...getAvailableSlots(slot.date), ...getBookedSlots(slot.date)]
      .filter((s) => s.id !== editingSlot?.id);
    if (existingSlots.some((s) => s.start === slot.start && s.end === slot.end)) {
      setError('That timeslot already exists');
      return;
    }
    if (editingSlot) {
      // Edit: move this availability to the new times.
      const { data, error } = await supabase
        .from('creator_slots')
        .update({ start_time: slot.start, end_time: slot.end })
        .eq('id', editingSlot.id)
        .eq('creator_id', creatorId)
        .eq('status', 'available')
        .select(SLOT_COLUMNS)
        .single();
      if (error) {
        setError(getErrorMessage(error, 'Could not save the changes.'));
        return;
      }
      const updated = toCalendarSlot(data as CreatorSlotRow) as Slot;
      setAvailableSlots((slots) => slots.map((s) => (s.id === editingSlot.id ? updated : s)));
      setEditingSlot(null);
      setModalVisible(false);
      return;
    }
    const { data, error } = await supabase
      .from('creator_slots')
      .insert({
        creator_id: creatorId,
        slot_date: slot.date,
        start_time: slot.start,
        end_time: slot.end,
        service: slot.service,
        status: 'available',
      })
      .select(SLOT_COLUMNS)
      .single();
    if (error) {
      setError(getErrorMessage(error, 'Could not save the available slot.'));
      return;
    }

    setAvailableSlots((slots) => [...slots, toCalendarSlot(data as CreatorSlotRow) as Slot]);
    setModalVisible(false);
  };

  const confirmRemoveAvailable = (slot: Slot) => {
    Alert.alert(
      'Remove available slot',
      `${longLabel(slot.date)}, ${slot.start}–${slot.end}\n${slot.service}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            if (!creatorId) return;
            const { error } = await supabase
              .from('creator_slots')
              .delete()
              .eq('id', slot.id)
              .eq('creator_id', creatorId)
              .eq('status', 'available');
            if (error) {
              Alert.alert(
                'Could not remove slot',
                getErrorMessage(error, 'The available slot could not be removed.')
              );
              return;
            }
            setAvailableSlots((slots) => slots.filter((item) => item.id !== slot.id));
          },
        },
      ]
    );
  };

  const confirmCancelBooking = (slot: BookedSlot) => {
    Alert.alert(
      'Cancel appointment',
      `${longLabel(slot.date)}, ${slot.start}–${slot.end}\n${slot.customer}`,
      [
        { text: 'Keep', style: 'cancel' },
        {
          text: 'Return to available',
          onPress: async () => {
            if (!creatorId) return;
            const { data, error } = await supabase
              .from('creator_slots')
              .update({ status: 'available', customer_name: null })
              .eq('id', slot.id)
              .eq('creator_id', creatorId)
              .eq('status', 'booked')
              .select(SLOT_COLUMNS)
              .single();
            if (error) {
              Alert.alert(
                'Could not cancel appointment',
                getErrorMessage(error, 'The appointment could not be cancelled.')
              );
              return;
            }
            const availableSlot = toCalendarSlot(data as CreatorSlotRow) as Slot;
            setBookedSlots((slots) => slots.filter((item) => item.id !== slot.id));
            setAvailableSlots((slots) => [...slots, availableSlot]);
          },
        },
      ]
    );
  };

  const renderSlot = (slot: Slot | BookedSlot) => {
    const isBooked = 'customer' in slot;

    return (
      <View key={slot.id} style={styles.slotWrap}>
        <TouchableOpacity
          style={[styles.slot, isBooked && styles.bookedSlot]}
          activeOpacity={0.7}
          disabled={isBooked}
          onPress={() => { if (!isBooked) openSlotMenu(slot); }}
          accessibilityLabel={isBooked ? undefined : `Available ${slot.start} to ${slot.end}. Tap to edit or remove`}
        >
          <Ionicons
            name="time-outline"
            size={18}
            color={isBooked ? colors.blue : colors.ink}
          />
          <View>
            <Text style={styles.slotText}>
              {slot.start} – {slot.end}
            </Text>
            <Text style={styles.slotService}>{slot.service}</Text>
            {isBooked && <Text style={styles.slotCustomer}>{slot.customer}</Text>}
          </View>
        </TouchableOpacity>
        <View style={styles.slotActions}>
          <TouchableOpacity
            style={[styles.slotAction, styles.removeAction]}
            onPress={() =>
              isBooked
                ? confirmCancelBooking(slot)
                : openSlotMenu(slot)
            }
            hitSlop={8}
            accessibilityLabel={isBooked ? 'Cancel appointment' : 'Edit or remove available slot'}
          >
            <Ionicons name={isBooked ? 'remove' : 'ellipsis-horizontal'} size={16} color={colors.background} />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const availableForDay = getFreeSlots(selected);
  // Booked and Available (under the month): everything on the chosen day, also on days that have passed.
  const bookedForDay = getBookedSlots(selected);
  const upcomingForDay = appointmentsForDay;

  return (
    <SafeAreaView style={styles.container}>
      {/* Header with + button */}
      <View style={styles.header}>
        {/* Week view: ← back to the month (Details) */}
        <View style={styles.headerSide}>
          {view === 'week' && (
            // Not a chevron (those step through days): a "Month" button with a grid icon
            <TouchableOpacity style={styles.monthButton} onPress={() => chooseView('details')} hitSlop={8} accessibilityLabel="Back to month">
              <Ionicons name="arrow-back" size={16} color={colors.wine} />
              <Ionicons name="grid-outline" size={15} color={colors.wine} />
            </TouchableOpacity>
          )}
        </View>
        <StarredTitle style={styles.title} star={false}>Calendar</StarredTitle>
        <View style={[styles.headerSide, { alignItems: 'flex-end' }]}>
          <ViewMenu view={view} onChange={chooseView} />
        </View>
      </View>

      {/* Week view: the week's days + the chosen day's date stay at the top; that one day, large, below */}
      {view === 'week' && (
        <WeekHeader dateKey={selected} todayKey={todayKey} onChangeDay={changeDay} onSelectDay={selectDay} />
      )}

      <ScrollView ref={scrollRef} scrollEnabled={!selectingRange} refreshControl={<RefreshControl {...pull.control} />} contentContainerStyle={{ paddingBottom: 32 }}>
        {/* Booking activity: one button; "See all" opens everything (requests, bookings, cancellations) */}
        <BookingActivity
          perspective="creator"
          userId={creatorId}
          isUnread={(a) => !a.seen_by_creator_at && a.status !== 'pending'}
          onOpened={() => { markBookingsSeen().catch(() => {}); }}
          items={flow}
          loading={flowLoading}
          busyId={busyRequestId}
          onAccept={(a) => answerRequest(a, true)}
          onDecline={(a, reason) => answerRequest(a, false, reason)}
          onCancel={cancelBooking}
          onChat={openChat}
        />

        {view === 'week' ? (
          // Opens scrolled to the morning.
          <View onLayout={(e) => scrollRef.current?.scrollTo({ y: e.nativeEvent.layout.y + 7.5 * HOUR_HEIGHT, animated: false })}>
            <DayTimeline
              showHeader={false}
              dateKey={selected}
              todayKey={todayKey}
              events={byDate[selected] ?? []}
              onChangeDay={changeDay}
              onEventPress={onDayEventPress}
              onSelectRange={openModalRange}
              onSelecting={setSelectingRange}
            />
          </View>
        ) : (
          <MonthGrid
            view={view}
            year={year}
            month={month}
            onChangeMonth={changeMonth}
            todayKey={todayKey}
            selected={selected}
            // Tap a day: open it in the day view
            // First tap: choose the day (same view). Tap the chosen day again: its week, hour by hour.
            onSelectDay={(key) => { if (key === selected) chooseView('week'); else selectDay(key); }}
            events={byDate}
            starDate={nextUp?.date}
            onPinch={pinchView}
          />
        )}

        {/* Under the month: what's booked (still to come), then what's available, for the chosen day */}
        {view !== 'week' && <>
        <View style={styles.slotsHeader}>
          <Text style={styles.slotsTitle}>Booked<Text style={styles.titleDot}> • </Text>{longLabel(selected)}</Text>
        </View>
        <View style={{ paddingHorizontal: 16 }}>
          {bookedForDay.length === 0 && upcomingForDay.length === 0 && (
            <Text style={styles.empty}>
              {slotsLoading ? 'Loading creator calendar...' : 'No booked appointments this day.'}
            </Text>
          )}
          {upcomingForDay.map((a) => (
            <View key={a.id} style={styles.slotWrap}>
              <View style={[styles.slot, styles.bookedSlot]}>
                <Ionicons name="calendar-outline" size={18} color={colors.blue} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.slotText}>
                    {a.start_time.slice(0, 5)} – {a.end_time.slice(0, 5)}
                  </Text>
                  <Text style={styles.slotService}>{a.services.map((s) => s.name).join(', ')}</Text>
                  <Text style={styles.slotCustomer}>
                    {a.customer_name} · {a.total_minutes} min · {formatKr(a.total_price)}
                  </Text>
                  {a.customer_note ? (
                    <Text style={styles.slotNote}>“{a.customer_note}”</Text>
                  ) : null}
                  {a.status === 'pending' && (
                    <Text style={styles.slotRequest}>Request · waiting for your answer</Text>
                  )}
                  {a.status === 'no_show' && (
                    <View style={styles.noShowRow}>
                      <Text style={styles.slotRequest}>No-show</Text>
                      <TouchableOpacity onPress={() => setNoShow(a, false)} hitSlop={8} disabled={busyRequestId === a.id}>
                        <Text style={styles.noShowLink}>Undo</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                  {a.status === 'confirmed' && appointmentStart(a) <= new Date() && (
                    <TouchableOpacity onPress={() => setNoShow(a, true)} hitSlop={8} disabled={busyRequestId === a.id}>
                      <Text style={styles.noShowLink}>Didn’t show up? Mark no-show</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
              <View style={styles.slotActions}>
                {/* Save to Apple/Google Calendar (not for days that have passed) */}
                {a.status === 'confirmed' && a.appointment_date >= todayKey && (
                  <TouchableOpacity
                    style={[styles.slotAction, styles.calendarAction]}
                    onPress={() => addAppointmentToCalendar(a, 'creator')}
                    hitSlop={8}
                    accessibilityLabel="Add to phone calendar"
                  >
                    <Ionicons name="calendar-outline" size={13} color={colors.background} />
                  </TouchableOpacity>
                )}
                {/* Cancel the booking (or decline the request) */}
                {canCancel(a) && busyRequestId !== a.id && (
                  <TouchableOpacity
                    style={[styles.slotAction, styles.calendarAction, styles.removeAction]}
                    onPress={() => setCancelling(a)}
                    hitSlop={8}
                    accessibilityLabel={a.status === 'pending' ? 'Decline request' : 'Cancel booking'}
                  >
                    <Ionicons name="close" size={15} color={colors.background} />
                  </TouchableOpacity>
                )}
              </View>
            </View>
          ))}
          {bookedForDay.map(renderSlot)}
        </View>

        <View style={styles.slotsHeader}>
          <Text style={styles.slotsTitle}>Available<Text style={styles.titleDot}> • </Text>{longLabel(selected)}</Text>
          <TouchableOpacity onPress={openModal} hitSlop={10} accessibilityLabel="Add available slot">
            <Ionicons name="add" size={26} color={colors.wine} />
          </TouchableOpacity>
        </View>
        <View style={{ paddingHorizontal: 16 }}>
          {slotsLoadError ? <Text style={styles.error}>{slotsLoadError}</Text> : null}
          {availableForDay.length === 0 && (
            <Text style={styles.empty}>
              {slotsLoading ? 'Loading creator calendar...' : 'No available slots this day.'}
            </Text>
          )}
          {availableForDay.map((slot) => <Fragment key={`${slot.id}-${slot.start}`}>{renderSlot(slot)}</Fragment>)}
        </View>
        </>}
      </ScrollView>

      {cancelling && (
        <ReasonDialog
          title={cancelling.status === 'pending' ? 'Decline request' : 'Cancel booking'}
          subtitle={`${handle(cancelling.customer_name)} · ${longLabel(cancelling.appointment_date)} ${cancelling.start_time.slice(0, 5)}`}
          confirmLabel={cancelling.status === 'pending' ? 'Decline' : 'Cancel booking'}
          placeholder="Message to the customer (optional)"
          onClose={() => setCancelling(null)}
          onConfirm={(reason) => {
            const a = cancelling;
            setCancelling(null);
            if (a.status === 'pending') void answerRequest(a, false, reason);
            else void cancelBooking(a, reason);
          }}
        />
      )}

      {/* Availability: the slot menu (Edit / Remove / Cancel) or the add/edit form, in one pop-up */}
      <Modal
        visible={modalVisible || slotMenu !== null}
        transparent
        animationType="fade"
        onRequestClose={() => { setModalVisible(false); setSlotMenu(null); setEditingSlot(null); }}
      >
        <View style={styles.modalBackdrop}>
          {slotMenu ? (
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Available</Text>
              <Text style={styles.modalDate}>{longLabel(slotMenu.date)} · {slotMenu.start}–{slotMenu.end}</Text>
              {/* Buttons stacked under each other */}
              <TouchableOpacity style={styles.menuPrimary} onPress={() => startEdit(slotMenu)}>
                <Ionicons name="create-outline" size={18} color={colors.wine} />
                <Text style={styles.menuPrimaryText}>Edit</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.menuDanger} onPress={() => removeFromMenu(slotMenu)}>
                <Ionicons name="trash-outline" size={18} color={colors.wine} />
                <Text style={styles.menuDangerText}>Remove</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.menuCancel} onPress={() => setSlotMenu(null)}>
                <Text style={styles.cancel}>Cancel</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>{editingSlot ? 'Edit availability' : 'Add availability'}</Text>
              <Text style={styles.modalDate}>{longLabel(editingSlot ? editingSlot.date : selected)}</Text>
              {/* Scroll to choose the times (15-minute steps) */}
              <View style={styles.wheels}>
                <TimeWheel label="Start" value={startInput} onChange={setStartInput} />
                <TimeWheel label="End" value={endInput} onChange={setEndInput} />
              </View>
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <View style={styles.modalButtons}>
                <TouchableOpacity onPress={() => { setModalVisible(false); setEditingSlot(null); }}>
                  <Text style={styles.cancel}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.saveButton} onPress={saveSlot}>
                  <Text style={styles.saveText}>{editingSlot ? 'Save' : 'Add'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </Modal>
      <RefreshStar refreshing={pull.refreshing} y={120} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  monthButton: { flexDirection: 'row', alignItems: 'center', gap: 3, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, backgroundColor: colors.pinkTint },
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  title: { fontSize: 20 },
  headerSide: { flex: 1 }, // up and to the right of the date/time // service · person
  slotsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    marginTop: 8,
  },
  slotsTitle: { fontSize: 13, color: colors.ink, fontFamily: fonts.title },
  // HORIZON draws no visible dot, so the separator uses the regular font
  titleDot: { fontFamily: fonts.regular, fontWeight: 'normal', color: colors.ink },
  empty: { color: colors.inkMuted, paddingVertical: 8 },
  bookingDetails: { color: colors.inkMuted, marginBottom: 12 },
  slotWrap: { marginBottom: 10, paddingTop: 8 },
  slot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    paddingRight: 52,
    borderRadius: 10,
    backgroundColor: colors.line,
  },
  bookedSlot: { backgroundColor: colors.blueTint },
  slotText: { fontSize: 16, fontWeight: '600' },
  slotService: { fontSize: 14, color: colors.inkMuted, marginTop: 2 },
  slotCustomer: { fontSize: 13, color: colors.blue, fontWeight: '600', marginTop: 4 },
  slotNote: { fontSize: 13, color: colors.ink, fontStyle: 'italic', marginTop: 4 }, // customer's comment
  slotRequest: { fontSize: 13, color: colors.wine, fontWeight: '700', marginTop: 4 },
  noShowRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  noShowLink: { fontSize: 13, color: colors.inkMuted, textDecorationLine: 'underline', marginTop: 4 },
  slotActions: {
    position: 'absolute',
    top: 0,
    right: -6,
    flexDirection: 'row',
    gap: 4,
  },
  slotAction: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.wine,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bookAction: { backgroundColor: colors.blue },
  calendarAction: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.blue },
  removeAction: { backgroundColor: 'crimson' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(11,21,14,0.4)',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: { backgroundColor: colors.background, borderRadius: 14, padding: 20 },
  wheels: { flexDirection: 'row', gap: 12, marginBottom: 8 },
  menuPrimary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.pink, borderRadius: 12, paddingVertical: 13, marginTop: 4 },
  menuPrimaryText: { color: colors.wine, fontSize: 16, fontWeight: '700' },
  menuDanger: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1.5, borderColor: colors.wine, borderRadius: 12, paddingVertical: 12, marginTop: 10 },
  menuDangerText: { color: colors.wine, fontSize: 16, fontWeight: '700' },
  menuCancel: { alignItems: 'center', paddingVertical: 12, marginTop: 6 },
  modalTitle: { fontSize: 17, color: colors.ink, fontFamily: fonts.title },
  modalDate: { fontSize: 15, marginTop: 4, marginBottom: 12, color: colors.ink }, // second row under the title
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 8,
    padding: 10,
    fontSize: 16,
    marginBottom: 10,
  },
  error: { color: 'crimson', marginBottom: 8 },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 20,
    marginTop: 4,
  },
  cancel: { fontSize: 16, color: colors.inkMuted },
  saveButton: {
    backgroundColor: colors.pink,
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 8,
  },
  saveText: { color: colors.wine, fontSize: 16, fontWeight: '600' },
});