import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { colors } from '../../theme';
import { Text } from '../../components/AppText';   // in src/components use './AppText'
import {
  View,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { fetchMyAppointments, formatKr, type Appointment } from '../../services/booking';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const pad = (n: number) => String(n).padStart(2, '0');
const dateKey = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
const shortLabel = (key: string) => {
  const [, m, d] = key.split('-');
  return `${Number(d)} ${MONTHS[Number(m) - 1].slice(0, 3)}`;
};
const longLabel = (key: string) => {
  const [, m, d] = key.split('-');
  return `${Number(d)} ${MONTHS[Number(m) - 1]}`;
};
const hhmm = (t: string) => t.slice(0, 5);

export default function CalendarUser() {
  const today = new Date();
  const todayKey = dateKey(today.getFullYear(), today.getMonth(), today.getDate());
  const nowTime = `${pad(today.getHours())}:${pad(today.getMinutes())}`;

  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [selected, setSelected] = useState(todayKey);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  // Reload on focus so a freshly confirmed booking shows up.
  useFocusEffect(useCallback(() => {
    let active = true;
    fetchMyAppointments('customer')
      .then((rows) => {
        if (!active) return;
        setAppointments(rows);
        setLoadError('');
      })
      .catch((e) => active && setLoadError(e instanceof Error ? e.message : String(e?.message ?? e)))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []));

  const nextUp =
    appointments
      .filter((a) => a.appointment_date > todayKey || (a.appointment_date === todayKey && hhmm(a.start_time) > nowTime))
      .sort((a, b) => a.appointment_date.localeCompare(b.appointment_date) || a.start_time.localeCompare(b.start_time))[0] ?? null;
  const daySlots = appointments.filter((a) => a.appointment_date === selected);

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

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={{ width: 28 }} />
        <Text style={styles.title}>Calendar</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        {/* Next Up */}
        <View style={styles.nextUp}>
          <Text style={styles.nextUpLabel}>Next Up</Text>
          <Text style={styles.nextUpText}>
            {nextUp
              ? `${shortLabel(nextUp.appointment_date)} ${hhmm(nextUp.start_time)}–${hhmm(nextUp.end_time)}, ${nextUp.creator_name}`
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
          {loadError ? <Text style={styles.error}>{loadError}</Text> : null}
          {daySlots.length === 0 && !loadError && (
            <Text style={styles.empty}>
              {loading ? 'Loading your bookings...' : 'No bookings this day. Find a creator in Explore to book one.'}
            </Text>
          )}
          {daySlots.map((a) => (
            <View key={a.id} style={styles.slotWrap}>
              <View style={styles.slot}>
                <Ionicons name="time-outline" size={18} color="#555" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.slotText}>
                    {hhmm(a.start_time)} – {hhmm(a.end_time)} · {a.creator_name}
                  </Text>
                  <Text style={styles.slotService}>{a.services.map((s) => s.name).join(', ')}</Text>
                  <Text style={styles.slotService}>{a.total_minutes} min · {formatKr(a.total_price)}</Text>
                </View>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
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
    backgroundColor: '#f4f4f4',
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