import { useCallback, useState } from 'react';
import { RefreshStar, useStarRefresh } from '../../components/SparkleStars';
import StarredTitle from '../../components/StarredTitle';
import { handle } from '../../utils/handle';

const STAR = require('../../../assets/images/star.png');
import { useFocusEffect } from '@react-navigation/native';
import { colors, fonts } from '../../theme';
import { Text } from '../../components/AppText';   // in src/components use './AppText'
import {
  View,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  RefreshControl,
  Image,
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
  // Pull down to refresh: spinning star instead of the system spinner.
  const pull = useStarRefresh();
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
      .finally(() => { if (active) setLoading(false); pull.doneLoading(); });
    return () => { active = false; };
  }, [pull.refreshKey])); // eslint-disable-line react-hooks/exhaustive-deps

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
        <StarredTitle style={styles.title} star={false}>Calendar</StarredTitle>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView refreshControl={<RefreshControl {...pull.control} />} contentContainerStyle={{ paddingBottom: 32 }}>
        {/* Next Up */}
        <View style={styles.nextUp}>
          <Text style={styles.nextUpLabel}>Next Booking</Text>
          {/* Row 1: date + time. Row 2 (smaller): service · nail tech */}
          <View style={styles.nextUpRow}>
            <Text style={styles.nextUpText}>
              {nextUp ? `${shortLabel(nextUp.appointment_date)} ${hhmm(nextUp.start_time)}–${hhmm(nextUp.end_time)}` : 'No upcoming bookings'}
            </Text>
            {nextUp && <Image source={STAR} style={styles.nextUpStar} />}
          </View>
          {nextUp && (
            <Text style={styles.nextUpDetail}>
              {nextUp.services.map((s) => s.name).join(', ')} · {handle(nextUp.creator_name)}
            </Text>
          )}
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
            const isNextBooking = key === nextUp?.appointment_date;
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

        {/* Bookings for selected day */}
        <View style={styles.slotsHeader}>
          <Text style={styles.slotsTitle}>my bookings<Text style={styles.titleDot}> • </Text>{longLabel(selected)}</Text>
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
                <Ionicons name="time-outline" size={18} color={colors.ink} />
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
  slotWrap: { marginBottom: 10, paddingTop: 8 },
  slot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    paddingRight: 28,
    borderRadius: 10,
    backgroundColor: colors.background,
  },
  slotText: { fontSize: 16, fontWeight: '600' },
  slotService: { fontSize: 14, color: colors.inkMuted, marginTop: 2 },
  minus: {
    position: 'absolute',
    top: 0,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.wine,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(11,21,14,0.4)',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: { backgroundColor: colors.background, borderRadius: 14, padding: 20 },
  modalTitle: { fontSize: 17, marginBottom: 12, color: colors.ink, fontFamily: fonts.title },
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
    backgroundColor: colors.wine,
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 8,
  },
  saveText: { color: colors.background, fontSize: 16, fontWeight: '600' },
});