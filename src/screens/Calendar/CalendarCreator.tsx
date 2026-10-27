import { useEffect, useState } from 'react';
import { colors } from '../../theme';
import { Text } from '../../components/AppText';
import {
  View,
  TouchableOpacity,
  ScrollView,
  Modal,
  TextInput,
  Alert,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../services/supabase';

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
  const today = new Date();
  const todayKey = dateKey(today.getFullYear(), today.getMonth(), today.getDate());
  const nowTime = `${pad(today.getHours())}:${pad(today.getMinutes())}`;

  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [selected, setSelected] = useState(todayKey);
  const [creatorId, setCreatorId] = useState<string | null>(null);
  const [availableSlots, setAvailableSlots] = useState<Slot[]>([]);
  const [bookedSlots, setBookedSlots] = useState<BookedSlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(true);
  const [slotsLoadError, setSlotsLoadError] = useState('');

  const [modalVisible, setModalVisible] = useState(false);
  const [bookingModalVisible, setBookingModalVisible] = useState(false);
  const [startInput, setStartInput] = useState('');
  const [endInput, setEndInput] = useState('');
  const [serviceInput, setServiceInput] = useState('');
  const [error, setError] = useState('');
  const [customerInput, setCustomerInput] = useState('');
  const [bookingError, setBookingError] = useState('');
  const [slotToBook, setSlotToBook] = useState<Slot | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadCreatorSlots = async () => {
      try {
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError) throw authError;
        if (!user) throw new Error('No signed-in creator was found.');

        const { data, error } = await supabase
          .from('creator_slots')
          .select(SLOT_COLUMNS)
          .eq('creator_id', user.id)
          .order('slot_date')
          .order('start_time');
        if (error) throw error;
        if (!isMounted) return;

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
      }
    };

    void loadCreatorSlots();
    return () => {
      isMounted = false;
    };
  }, []);

  const getAvailableSlots = (key: string): Slot[] =>
    availableSlots
      .filter((slot) => slot.date === key)
      .sort((a, b) => a.start.localeCompare(b.start));
  const getBookedSlots = (key: string): BookedSlot[] =>
    bookedSlots
      .filter((slot) => slot.date === key)
      .sort((a, b) => a.start.localeCompare(b.start));

  // Find the next future appointment; availability alone is not a booking.
  const findNextUp = (): BookedSlot | null =>
    bookedSlots
      .filter((slot) => slot.date > todayKey || (slot.date === todayKey && slot.start > nowTime))
      .sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start))[0] ?? null;
  const nextUp = findNextUp();

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
    setServiceInput('');
    setError('');
    setModalVisible(true);
  };

  const openBookingModal = (slot: Slot) => {
    setSlotToBook(slot);
    setCustomerInput('');
    setBookingError('');
    setBookingModalVisible(true);
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
      service: serviceInput.trim() || 'Booking',
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

  const saveBooking = async () => {
    const customer = customerInput.trim();
    if (!customer) {
      setBookingError('Enter the customer name');
      return;
    }
    if (!slotToBook) return;
    if (!creatorId) {
      setBookingError('The creator calendar is not ready. Try again shortly.');
      return;
    }

    const { data, error } = await supabase
      .from('creator_slots')
      .update({ status: 'booked', customer_name: customer })
      .eq('id', slotToBook.id)
      .eq('creator_id', creatorId)
      .eq('status', 'available')
      .select(SLOT_COLUMNS)
      .single();
    if (error) {
      setBookingError(getErrorMessage(error, 'Could not book this slot.'));
      return;
    }

    const bookedSlot = toCalendarSlot(data as CreatorSlotRow) as BookedSlot;
    setBookedSlots((slots) => [...slots, bookedSlot]);
    setAvailableSlots((slots) => slots.filter((slot) => slot.id !== bookedSlot.id));
    setBookingModalVisible(false);
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
            color={isBooked ? '#27834A' : '#555'}
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
          {!isBooked && (
            <TouchableOpacity
              style={[styles.slotAction, styles.bookAction]}
              onPress={() => openBookingModal(slot)}
              hitSlop={8}
              accessibilityLabel="Book this slot"
            >
              <Ionicons name="person-add-outline" size={14} color="#fff" />
            </TouchableOpacity>
          )}
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
            <Ionicons name="remove" size={16} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const availableForDay = getAvailableSlots(selected);
  const bookedForDay = getBookedSlots(selected);

  return (
    <SafeAreaView style={styles.container}>
      {/* Header with + button */}
      <View style={styles.header}>
        <View style={{ width: 28 }} />
        <Text style={styles.title}>Calendar</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        {/* Next Booking */}
        <View style={styles.nextUp}>
          <Text style={styles.nextUpLabel}>Next Booking</Text>
          <Text style={styles.nextUpText}>
            {nextUp
              ? `${shortLabel(nextUp.date)} ${nextUp.start}–${nextUp.end}, ${nextUp.service} · ${nextUp.customer}`
              : 'You have no upcoming booked appointments.'}
          </Text>
        </View>

        {/* Month switcher */}
        <View style={styles.monthRow}>
          <TouchableOpacity onPress={() => changeMonth(-1)} hitSlop={10}>
            <Ionicons name="chevron-back" size={22} color="#333" />
          </TouchableOpacity>
          <Text style={styles.monthText}>
            {MONTHS[month]} {year}
          </Text>
          <TouchableOpacity onPress={() => changeMonth(1)} hitSlop={10}>
            <Ionicons name="chevron-forward" size={22} color="#333" />
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
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Available slots for selected day */}
        <View style={styles.slotsHeader}>
          <Text style={styles.slotsTitle}>Available · {longLabel(selected)}</Text>
          <TouchableOpacity onPress={openModal} hitSlop={10} accessibilityLabel="Add available slot">
            <Ionicons name="add" size={26} color="tomato" />
          </TouchableOpacity>
        </View>
        <View style={{ paddingHorizontal: 16 }}>
          {slotsLoadError ? <Text style={styles.error}>{slotsLoadError}</Text> : null}
          {availableForDay.length === 0 && (
            <Text style={styles.empty}>
              {slotsLoading ? 'Loading creator calendar...' : 'No available slots this day.'}
            </Text>
          )}
          {availableForDay.map(renderSlot)}
        </View>

        <View style={styles.slotsHeader}>
          <Text style={styles.slotsTitle}>Booked · {longLabel(selected)}</Text>
        </View>
        <View style={{ paddingHorizontal: 16 }}>
          {bookedForDay.length === 0 && (
            <Text style={styles.empty}>
              {slotsLoading ? 'Loading creator calendar...' : 'No booked appointments this day.'}
            </Text>
          )}
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
            <Text style={styles.modalTitle}>Add availability · {longLabel(selected)}</Text>
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
            <TextInput
              style={styles.input}
              placeholder="Service (e.g. Pedicure)"
              value={serviceInput}
              onChangeText={setServiceInput}
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

      <Modal
        visible={bookingModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setBookingModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Book appointment</Text>
            {slotToBook && (
              <Text style={styles.bookingDetails}>
                {longLabel(slotToBook.date)} · {slotToBook.start}–{slotToBook.end} · {slotToBook.service}
              </Text>
            )}
            <TextInput
              style={styles.input}
              placeholder="Customer name"
              value={customerInput}
              onChangeText={setCustomerInput}
              autoCapitalize="words"
            />
            {bookingError ? <Text style={styles.error}>{bookingError}</Text> : null}
            <View style={styles.modalButtons}>
              <TouchableOpacity onPress={() => setBookingModalVisible(false)}>
                <Text style={styles.cancel}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveButton} onPress={saveBooking}>
                <Text style={styles.saveText}>Book</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  title: { fontSize: 20, fontWeight: '700' },
  nextUp: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 20,
    padding: 18,
    borderRadius: 14,
    backgroundColor: colors.primarySoft,
  },
  nextUpLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.danger,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  nextUpText: { fontSize: 24, fontWeight: '700', marginTop: 4, color: '#222' },
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  monthText: { fontSize: 18, fontWeight: '600' },
  weekRow: { flexDirection: 'row', paddingHorizontal: 8 },
  weekday: {
    width: `${100 / 7}%`,
    textAlign: 'center',
    color: '#888',
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
  todayCircle: { borderColor: colors.primary },
  selectedCircle: { backgroundColor: colors.primary, borderColor: colors.primary },
  dayText: { fontSize: 16, color: '#222' },
  todayText: { color: colors.text, fontWeight: '700' },
  selectedText: { color: colors.primarySoft, fontWeight: '700' },
  slotsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#ccc',
    marginTop: 8,
  },
  slotsTitle: { fontSize: 16, fontWeight: '600' },
  empty: { color: '#888', paddingVertical: 8 },
  bookingDetails: { color: '#666', marginBottom: 12 },
  slotWrap: { marginBottom: 10, paddingTop: 8 },
  slot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    paddingRight: 52,
    borderRadius: 10,
    backgroundColor: '#f0ece5',
  },
  bookedSlot: { backgroundColor: '#eaf6ee' },
  slotText: { fontSize: 16, fontWeight: '600' },
  slotService: { fontSize: 14, color: '#666', marginTop: 2 },
  slotCustomer: { fontSize: 13, color: '#27834A', fontWeight: '600', marginTop: 4 },
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
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bookAction: { backgroundColor: '#27834A' },
  removeAction: { backgroundColor: 'crimson' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: { backgroundColor: '#fff', borderRadius: 14, padding: 20 },
  modalTitle: { fontSize: 17, fontWeight: '600', marginBottom: 12 },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
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
  cancel: { fontSize: 16, color: '#666' },
  saveButton: {
    backgroundColor: colors.danger,
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 8,
  },
  saveText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});