import { useState } from 'react';
import { colors } from '../../theme';
import { Text } from '../../components/AppText';   // in src/components use './AppText'
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

type Slot = { start: string; end: string; service: string };

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const DEFAULT_SLOTS: Slot[] = [
  { start: '13:00', end: '15:00', service: 'Manicure' },
  { start: '15:00', end: '17:00', service: 'Manicure' },
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

export default function CalendarCreator() {
  const today = new Date();
  const todayKey = dateKey(today.getFullYear(), today.getMonth(), today.getDate());
  const nowTime = `${pad(today.getHours())}:${pad(today.getMinutes())}`;

  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [selected, setSelected] = useState(todayKey);
  // Days that have been changed. Days not in here use DEFAULT_SLOTS.
  const [slotsByDate, setSlotsByDate] = useState<Record<string, Slot[]>>({});

  const [modalVisible, setModalVisible] = useState(false);
  const [startInput, setStartInput] = useState('');
  const [endInput, setEndInput] = useState('');
  const [serviceInput, setServiceInput] = useState('');
  const [error, setError] = useState('');

  const getSlots = (key: string): Slot[] =>
    [...(slotsByDate[key] ?? DEFAULT_SLOTS)].sort((a, b) =>
      a.start.localeCompare(b.start)
    );

  const updateDay = (key: string, fn: (slots: Slot[]) => Slot[]) => {
    setSlotsByDate((prev) => ({
      ...prev,
      [key]: fn(prev[key] ?? DEFAULT_SLOTS),
    }));
  };

  // Find the closest upcoming booking (looks 120 days ahead + any edited days)
  const findNextUp = (): { key: string; slot: Slot } | null => {
    const keys = new Set<string>(Object.keys(slotsByDate));
    for (let i = 0; i < 120; i++) {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
      keys.add(dateKey(d.getFullYear(), d.getMonth(), d.getDate()));
    }
    const sortedKeys = [...keys].filter((k) => k >= todayKey).sort();
    for (const key of sortedKeys) {
      for (const slot of getSlots(key)) {
        if (key > todayKey || slot.start > nowTime) return { key, slot };
      }
    }
    return null;
  };
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

  const saveSlot = () => {
    if (!TIME_REGEX.test(startInput) || !TIME_REGEX.test(endInput)) {
      setError('Use the format HH:MM, e.g. 09:00');
      return;
    }
    const slot: Slot = {
      start: normalize(startInput),
      end: normalize(endInput),
      service: serviceInput.trim() || 'Booking',
    };
    if (slot.start >= slot.end) {
      setError('End time must be after start time');
      return;
    }
    if (getSlots(selected).some((s) => s.start === slot.start && s.end === slot.end)) {
      setError('That timeslot already exists');
      return;
    }
    updateDay(selected, (slots) => [...slots, slot]);
    setModalVisible(false);
  };

  const confirmRemove = (slot: Slot) => {
    Alert.alert(
      'Remove booking',
      `${longLabel(selected)}, ${slot.start}–${slot.end}\n${slot.service}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () =>
            updateDay(selected, (slots) =>
              slots.filter((s) => !(s.start === slot.start && s.end === slot.end))
            ),
        },
      ]
    );
  };

  const daySlots = getSlots(selected);

  return (
    <SafeAreaView style={styles.container}>
      {/* Header with + button */}
      <View style={styles.header}>
        <View style={{ width: 28 }} />
        <Text style={styles.title}>Calendar</Text>
        <TouchableOpacity onPress={openModal} hitSlop={10}>
          <Ionicons name="add" size={28} color= {colors.danger} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        {/* Next Up */}
        <View style={styles.nextUp}>
          <Text style={styles.nextUpLabel}>Next Up</Text>
          <Text style={styles.nextUpText}>
            {nextUp
              ? `${shortLabel(nextUp.key)} ${nextUp.slot.start}–${nextUp.slot.end}, ${nextUp.slot.service}`
              : 'No upcoming bookings'}
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

        {/* Bookings for selected day */}
        <View style={styles.slotsHeader}>
          <Text style={styles.slotsTitle}>my bookings · {longLabel(selected)}</Text>
        </View>
        <View style={{ paddingHorizontal: 16 }}>
          {daySlots.length === 0 && (
            <Text style={styles.empty}>hey babe, no bookings this day. Tap + to add one.</Text>
          )}
          {daySlots.map((slot) => (
            <View key={`${slot.start}-${slot.end}`} style={styles.slotWrap}>
              <View style={styles.slot}>
                <Ionicons name="time-outline" size={18} color="#555" />
                <View>
                  <Text style={styles.slotText}>
                    {slot.start} – {slot.end}
                  </Text>
                  <Text style={styles.slotService}>{slot.service}</Text>
                </View>
              </View>
              <TouchableOpacity
                style={styles.minus}
                onPress={() => confirmRemove(slot)}
                hitSlop={8}
              >
                <Ionicons name="remove" size={16} color="#fff" />
              </TouchableOpacity>
            </View>
          ))}
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
            <Text style={styles.modalTitle}>New booking · {longLabel(selected)}</Text>
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
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#ccc',
    marginTop: 8,
  },
  slotsTitle: { fontSize: 16, fontWeight: '600' },
  empty: { color: '#888', paddingVertical: 8 },
  slotWrap: { marginBottom: 10, paddingTop: 8 },
  slot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    paddingRight: 28,
    borderRadius: 10,
    backgroundColor: '#f0ece5',
  },
  slotText: { fontSize: 16, fontWeight: '600' },
  slotService: { fontSize: 14, color: '#666', marginTop: 2 },
  minus: {
    position: 'absolute',
    top: 0,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
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