import { Fragment, useCallback, useState } from 'react';
import { RefreshStar, useStarRefresh } from '../../components/SparkleStars';
import StarredTitle from '../../components/StarredTitle';
import { handle } from '../../utils/handle';

const STAR = require('../../../assets/images/star.png');
import { useFocusEffect } from '@react-navigation/native';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../services/supabase';
import { fetchMyAppointments, formatKr, type Appointment } from '../../services/booking';

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

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
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

        const [{ data, error }, appointmentRows] = await Promise.all([
          supabase
            .from('creator_slots')
            .select(SLOT_COLUMNS)
            .eq('creator_id', user.id)
            .order('slot_date')
            .order('start_time'),
          // A missing appointments table must not stop the availability calendar from loading.
          fetchMyAppointments('creator').catch((e) => {
            console.warn('[Calendar] Could not load appointments:', e);
            return [] as Appointment[];
          }),
        ]);
        if (error) throw error;
        if (!isMounted) return;

        setAppointments(appointmentRows);

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
        if (isMounted) setSlotsLoading(false);
        pull.doneLoading();
      }
    };

    void loadCreatorSlots();
    return () => {
      isMounted = false;
    };
  }, [pull.refreshKey])); // eslint-disable-line react-hooks/exhaustive-deps

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
    ...appointments.map((a) => ({
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

  // Month grid (weeks start on Monday)
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const offset = (new Date(year, month, 1).getDay() + 6) % 7;
  const cells: (number | null)[] = [
    ...Array(offset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const changeMonth = (delta: number) => {
    const d = new Date(year, month + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
  };

  const openModal = () => {
    setStartInput('');
    setEndInput('');
    setError('');
    setModalVisible(true);
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
        <View style={{ width: 28 }} />
        <StarredTitle style={styles.title} star={false}>Calendar</StarredTitle>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView refreshControl={<RefreshControl {...pull.control} />} contentContainerStyle={{ paddingBottom: 32 }}>
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

        {/* Month switcher */}
        <View style={styles.monthRow}>
          <TouchableOpacity onPress={() => changeMonth(-1)} hitSlop={10}>
            <Ionicons name="chevron-back" size={22} color={colors.ink} />
          </TouchableOpacity>
          <Text style={styles.monthText}>
            {MONTHS[month]} {year}
          </Text>
          <TouchableOpacity onPress={() => changeMonth(1)} hitSlop={10}>
            <Ionicons name="chevron-forward" size={22} color={colors.ink} />
          </TouchableOpacity>
        </View>

        {/* Weekday labels */}
        <View style={styles.weekRow}>
          {WEEKDAYS.map((d) => (
            <Text key={d} style={styles.weekday}>
              {d}
            </Text>
          ))}
        </View>

        {/* Day grid */}
        <View style={styles.grid}>
          {cells.map((day, i) => {
            if (day === null) return <View key={i} style={styles.cell} />;
            const key = dateKey(year, month, day);
            const isToday = key === todayKey;
            const isSelected = key === selected;
            const isNextBooking = key === nextUp?.date;
            return (
              <TouchableOpacity key={i} style={styles.cell} onPress={() => setSelected(key)}>
                <View
                  style={[
                    styles.dayCircle,
                    isToday && styles.todayCircle,
                    isSelected && styles.selectedCircle,
                  ]}
                >
                  <Text
                    style={[
                      styles.dayText,
                      isSelected && styles.selectedText,
                      isToday && !isSelected && styles.todayText,
                    ]}
                  >
                    {day}
                  </Text>
                  {/* Small yellow star on the day of the next booking */}
                  {isNextBooking && <Image source={STAR} style={styles.nextStar} />}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Available slots for selected day */}
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
                </View>
              </View>
            </View>
          ))}
          {bookedForDay.map(renderSlot)}
        </View>
      </ScrollView>

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
  nextStar: { position: 'absolute', top: 4, right: -4, width: 14, height: 14 }, // up and to the right of the number
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  monthText: { fontSize: 18, color: colors.ink, fontFamily: fonts.title },
  weekRow: { flexDirection: 'row', paddingHorizontal: 8 },
  weekday: {
    width: `${100 / 7}%`,
    textAlign: 'center',
    color: colors.inkMuted,
    fontSize: 13,
    paddingBottom: 6,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 8 },
  cell: {
    width: `${100 / 7}%`,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  todayCircle: { borderColor: colors.wine },
  selectedCircle: { backgroundColor: colors.pink, borderColor: colors.pink },
  dayText: { fontSize: 16, color: colors.ink },
  todayText: { color: colors.ink, fontWeight: '700' },
  selectedText: { color: colors.wine, fontWeight: '700' },
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