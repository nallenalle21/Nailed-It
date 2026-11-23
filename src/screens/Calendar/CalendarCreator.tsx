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
  Image,
  Platform,
  type AlertButton,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../services/supabase';
import { canCancel, cancelAppointment, fetchMyAppointments, formatKr, type Appointment } from '../../services/booking';
import { addAppointmentToCalendar } from '../../services/deviceCalendar';
import { fetchBookingFlow, markBookingsSeen, respondToRequest } from '../../services/bookingRequests';
import BookingFlow from '../../components/BookingFlow';
import ReasonDialog from '../../components/ReasonDialog';
import MonthGrid from '../../components/calendar/MonthGrid';
import DayTimeline, { HOUR_HEIGHT } from '../../components/calendar/DayTimeline';
import ViewMenu from '../../components/calendar/ViewMenu';
import { MONTH_VIEWS, eventsByDate, useCalendarView, type CalendarEvent } from '../../components/calendar/types';

const STAR = require('../../../assets/images/star.png');

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
const shortLabel = (key: string) => {
  const [, m, d] = key.split('-');
  return `${Number(d)} ${MONTHS[Number(m) - 1].slice(0, 3)}`;
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
          fetchMyAppointments('creator', ['confirmed', 'pending']).catch((e) => {
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
          setFlow(flowRows);
          // Dots stay on screen for this visit; next time these count as seen.
          if (flowRows.some((a) => !a.seen_by_creator_at && a.status !== 'pending')) {
            markBookingsSeen().catch(() => {});
          }
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
      const updated = await respondToRequest(a.id, accept, reason);
      if (accept) {
        Alert.alert('Booking accepted', `${handle(a.customer_name)} has been told. Add it to your phone calendar?`, [
          { text: 'Not now', style: 'cancel' },
          { text: 'Add to calendar', onPress: () => addAppointmentToCalendar(updated, 'creator') },
        ]);
      }
    } catch (e) {
      Alert.alert(accept ? 'Could not accept' : 'Could not decline', getErrorMessage(e, 'Please try again.'));
    } finally {
      setBusyRequestId(null);
      setReloadKey((n) => n + 1);
    }
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
      kind: a.status === 'pending' ? ('request' as const) : ('booked' as const),
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
  const pinchView = (direction: 1 | -1) => {
    const i = MONTH_VIEWS.indexOf(view);
    const next = MONTH_VIEWS[Math.min(MONTH_VIEWS.length - 1, Math.max(0, i + direction))];
    if (next !== view) setView(next);
  };

  const openModal = () => {
    setStartInput('');
    setEndInput('');
    setError('');
    setModalVisible(true);
  };

  /** Long-press on the Day timeline: add availability from that time (one hour, adjustable). */
  const openModalAt = (minutes: number) => {
    const hhmmOf = (m: number) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
    setStartInput(hhmmOf(minutes));
    setEndInput(hhmmOf(Math.min(minutes + 60, 23 * 60 + 59)));
    setError('');
    setModalVisible(true);
  };

  /** Tap on something in the Day timeline. */
  const onDayEventPress = (e: CalendarEvent) => {
    if (e.kind === 'available') {
      const slot = getFreeSlots(e.date).find((sl) => sl.id === e.id && sl.start === e.start);
      if (slot) confirmRemoveAvailable(slot);
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
    const buttons: AlertButton[] = a.status === 'pending'
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
      date: selected,
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
    const existingSlots = [...getAvailableSlots(selected), ...getBookedSlots(selected)];
    if (existingSlots.some((s) => s.start === slot.start && s.end === slot.end)) {
      setError('That timeslot already exists');
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
        <View style={[styles.slot, isBooked && styles.bookedSlot]}>
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
        </View>
        <View style={styles.slotActions}>
          <TouchableOpacity
            style={[styles.slotAction, styles.removeAction]}
            onPress={() =>
              isBooked
                ? confirmCancelBooking(slot)
                : confirmRemoveAvailable(slot)
            }
            hitSlop={8}
            accessibilityLabel={isBooked ? 'Cancel appointment' : 'Remove available slot'}
          >
            <Ionicons name="remove" size={16} color={colors.background} />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const availableForDay = getFreeSlots(selected);
  const bookedForDay = getBookedSlots(selected);

  return (
    <SafeAreaView style={styles.container}>
      {/* Header with + button */}
      <View style={styles.header}>
        <View style={styles.headerSide} />
        <StarredTitle style={styles.title} star={false}>Calendar</StarredTitle>
        <View style={[styles.headerSide, { alignItems: 'flex-end' }]}>
          <ViewMenu view={view} onChange={setView} />
        </View>
      </View>

      <ScrollView ref={scrollRef} refreshControl={<RefreshControl {...pull.control} />} contentContainerStyle={{ paddingBottom: 32 }}>
        {/* Next Booking */}
        <View style={styles.nextUp}>
          <Text style={styles.nextUpLabel}>Next Booking</Text>
          {/* Row 1: date + time. Row 2 (smaller): service · customer */}
          <View style={styles.nextUpRow}>
            <Text style={styles.nextUpText}>
              {nextUp ? `${shortLabel(nextUp.date)} ${nextUp.start}–${nextUp.end}` : 'You have no upcoming booked appointments.'}
            </Text>
            {nextUp && <Image source={STAR} style={styles.nextUpStar} />}
          </View>
          {nextUp && <Text style={styles.nextUpDetail}>{nextUp.label}</Text>}
        </View>

        <BookingFlow
          items={flow}
          loading={flowLoading}
          busyId={busyRequestId}
          onAccept={(a) => answerRequest(a, true)}
          onDecline={(a, reason) => answerRequest(a, false, reason)}
          onCancel={cancelBooking}
          onChat={openChat}
        />

        {view === 'day' ? (
          // Opens scrolled to the morning.
          <View onLayout={(e) => scrollRef.current?.scrollTo({ y: e.nativeEvent.layout.y + 7.5 * HOUR_HEIGHT, animated: false })}>
            <DayTimeline
              dateKey={selected}
              todayKey={todayKey}
              events={byDate[selected] ?? []}
              onChangeDay={changeDay}
              onToday={() => selectDay(todayKey)}
              onEventPress={onDayEventPress}
              onLongPressTime={openModalAt}
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
            onSelectDay={setSelected}
            events={byDate}
            starDate={nextUp?.date}
            onPinch={pinchView}
          />
        )}

        {/* Available slots for selected day */}
        {view !== 'day' && <>
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

        <View style={styles.slotsHeader}>
          <Text style={styles.slotsTitle}>Booked<Text style={styles.titleDot}> • </Text>{longLabel(selected)}</Text>
        </View>
        <View style={{ paddingHorizontal: 16 }}>
          {bookedForDay.length === 0 && appointmentsForDay.length === 0 && (
            <Text style={styles.empty}>
              {slotsLoading ? 'Loading creator calendar...' : 'No booked appointments this day.'}
            </Text>
          )}
          {appointmentsForDay.map((a) => (
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
                </View>
              </View>
              <View style={styles.slotActions}>
                {/* Save to Apple/Google Calendar */}
                {a.status === 'confirmed' && (
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

      {/* Add booking modal */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Add availability</Text>
            <Text style={styles.modalDate}>{longLabel(selected)}</Text>
            <TextInput
              style={styles.input}
              placeholder="Start (e.g. 09:00)"
              value={startInput}
              onChangeText={setStartInput}
              keyboardType="numbers-and-punctuation"
              maxLength={5}
            />
            <TextInput
              style={styles.input}
              placeholder="End (e.g. 11:00)"
              value={endInput}
              onChangeText={setEndInput}
              keyboardType="numbers-and-punctuation"
              maxLength={5}
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <View style={styles.modalButtons}>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Text style={styles.cancel}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveButton} onPress={saveSlot}>
                <Text style={styles.saveText}>Add</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      <RefreshStar refreshing={pull.refreshing} y={120} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  title: { fontSize: 20 },
  headerSide: { flex: 1 },
  nextUp: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 20,
    padding: 18,
    borderRadius: 14,
    backgroundColor: colors.blue,
  },
  nextUpLabel: { fontSize: 12, fontFamily: fonts.title, color: colors.blueDeep, textTransform: 'uppercase' },
  nextUpText: { fontSize: 24, fontWeight: '700', marginTop: 6, color: colors.background },
  nextUpRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  nextUpStar: { width: 18, height: 18, alignSelf: 'flex-start', marginTop: -2, marginLeft: -5 }, // up and to the right of the date/time
  nextUpDetail: { fontSize: 15, marginTop: 4, color: colors.background }, // service · person
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