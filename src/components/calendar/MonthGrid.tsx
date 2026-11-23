import { Image, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '../AppText';
import { colors, fonts } from '../../theme';
import { EVENT_COLORS, type CalendarEvent, type CalendarView } from './types';

const STAR = require('../../../assets/images/star.png');

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const pad = (n: number) => String(n).padStart(2, '0');
const dateKey = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;

// How tall a day is in each density, and how many bookings fit before "+N".
const CELL_HEIGHT = { compact: 46, stacked: 66, details: 104 } as const;
const MAX_BARS = 5;
const MAX_LINES = 4;

type Props = {
  view: Exclude<CalendarView, 'day'>;
  year: number;
  month: number;
  onChangeMonth: (delta: number) => void;
  todayKey: string;
  selected: string;
  onSelectDay: (key: string) => void;
  events: Record<string, CalendarEvent[]>;
  /** Small yellow star on this day (the next booking). */
  starDate?: string | null;
  /** Pinch out → more detail (+1), pinch in → more compact (-1). */
  onPinch: (direction: 1 | -1) => void;
};

/** The month grid in three densities, like Apple Calendar: Compact, Stacked and Details. */
export default function MonthGrid({ view, year, month, onChangeMonth, todayKey, selected, onSelectDay, events, starDate, onPinch }: Props) {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const offset = (new Date(year, month, 1).getDay() + 6) % 7; // weeks start on Monday
  const cells: (number | null)[] = [...Array(offset).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7 !== 0) cells.push(null);

  const pinch = Gesture.Pinch()
    .runOnJS(true)
    .onEnd((e) => {
      if (e.scale > 1.15) onPinch(1);
      else if (e.scale < 0.87) onPinch(-1);
    });

  return (
    <View>
      <View style={styles.monthRow}>
        <TouchableOpacity onPress={() => onChangeMonth(-1)} hitSlop={10} accessibilityLabel="Previous month">
          <Ionicons name="chevron-back" size={22} color={colors.ink} />
        </TouchableOpacity>
        <Text style={styles.monthText}>{MONTHS[month]} {year}</Text>
        <TouchableOpacity onPress={() => onChangeMonth(1)} hitSlop={10} accessibilityLabel="Next month">
          <Ionicons name="chevron-forward" size={22} color={colors.ink} />
        </TouchableOpacity>
      </View>

      <View style={styles.weekRow}>
        {WEEKDAYS.map((d) => <Text key={d} style={styles.weekday}>{d}</Text>)}
      </View>

      <GestureDetector gesture={pinch}>
        <View style={[styles.grid, view !== 'compact' && styles.gridLines]}>
          {cells.map((day, i) => {
            if (day === null) return <View key={i} style={[styles.cell, { height: CELL_HEIGHT[view] }, view !== 'compact' && styles.cellLined]} />;
            const key = dateKey(year, month, day);
            return (
              <DayCell
                key={i}
                view={view}
                day={day}
                isToday={key === todayKey}
                isSelected={key === selected}
                hasStar={key === starDate}
                events={events[key] ?? []}
                onPress={() => onSelectDay(key)}
              />
            );
          })}
        </View>
      </GestureDetector>
    </View>
  );
}

function DayCell({ view, day, isToday, isSelected, hasStar, events, onPress }: {
  view: Exclude<CalendarView, 'day'>;
  day: number;
  isToday: boolean;
  isSelected: boolean;
  hasStar: boolean;
  events: CalendarEvent[];
  onPress: () => void;
}) {
  const bookings = events.filter((e) => e.kind !== 'available');
  const compact = view === 'compact';

  return (
    <TouchableOpacity
      style={[styles.cell, { height: CELL_HEIGHT[view] }, !compact && styles.cellLined, !compact && styles.cellTop]}
      onPress={onPress}
      accessibilityLabel={`${day}, ${bookings.length} ${bookings.length === 1 ? 'booking' : 'bookings'}`}
    >
      <View style={[compact ? styles.dayCircle : styles.dayCircleSmall, isToday && styles.todayCircle, isSelected && styles.selectedCircle]}>
        <Text style={[compact ? styles.dayText : styles.dayTextSmall, isSelected && styles.selectedText, isToday && !isSelected && styles.todayText]}>
          {day}
        </Text>
        {hasStar && <Image source={STAR} style={compact ? styles.star : styles.starSmall} />}
      </View>

      {/* Compact: one dot when there is something booked that day */}
      {compact && bookings.length > 0 && !hasStar && (
        <View style={[styles.dot, { backgroundColor: EVENT_COLORS[bookings.some((b) => b.kind === 'request') ? 'request' : bookings[0].kind].fill }]} />
      )}

      {/* Stacked: a thin bar per booking (and free time), in time order */}
      {view === 'stacked' && (
        <View style={styles.bars}>
          {events.slice(0, MAX_BARS).map((e) => (
            <View key={e.id + e.start} style={[styles.bar, { backgroundColor: EVENT_COLORS[e.kind].fill }]} />
          ))}
          {events.length > MAX_BARS && <Text style={styles.more}>+{events.length - MAX_BARS}</Text>}
        </View>
      )}

      {/* Details: start time + name of each booking */}
      {view === 'details' && (
        <View style={styles.lines}>
          {events.slice(0, MAX_LINES).map((e) => (
            <View key={e.id + e.start} style={[styles.chip, { backgroundColor: EVENT_COLORS[e.kind].fill }]}>
              <Text
                style={[styles.chipText, { color: EVENT_COLORS[e.kind].text }, e.kind === 'inactive' && styles.struck]}
                numberOfLines={1}
              >
                {e.start} {e.kind === 'available' ? 'free' : e.title}
              </Text>
            </View>
          ))}
          {events.length > MAX_LINES && <Text style={styles.more}>+{events.length - MAX_LINES} more</Text>}
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingVertical: 12 },
  monthText: { fontSize: 18, color: colors.ink, fontFamily: fonts.title },
  weekRow: { flexDirection: 'row', paddingHorizontal: 8 },
  weekday: { width: `${100 / 7}%`, textAlign: 'center', color: colors.inkMuted, fontSize: 13, paddingBottom: 6 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 8 },
  gridLines: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  cell: { width: `${100 / 7}%`, alignItems: 'center', justifyContent: 'center' },
  cellLined: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  cellTop: { justifyContent: 'flex-start', paddingTop: 3 },
  dayCircle: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'transparent' },
  dayCircleSmall: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: 'transparent' },
  todayCircle: { borderColor: colors.wine },
  selectedCircle: { backgroundColor: colors.pink, borderColor: colors.pink },
  dayText: { fontSize: 16, color: colors.ink },
  dayTextSmall: { fontSize: 13, color: colors.ink },
  todayText: { color: colors.ink, fontWeight: '700' },
  selectedText: { color: colors.wine, fontWeight: '700' },
  star: { position: 'absolute', top: 4, right: -4, width: 14, height: 14 }, // up and to the right of the number
  starSmall: { position: 'absolute', top: -3, right: -6, width: 11, height: 11 },
  dot: { width: 5, height: 5, borderRadius: 3, marginTop: -4 },
  bars: { alignSelf: 'stretch', paddingHorizontal: 4, marginTop: 4, gap: 2 },
  bar: { height: 4, borderRadius: 2 },
  lines: { alignSelf: 'stretch', paddingHorizontal: 2, marginTop: 3, gap: 2 },
  chip: { borderRadius: 3, paddingHorizontal: 2, paddingVertical: 1 },
  chipText: { fontSize: 9, fontWeight: '600' },
  struck: { textDecorationLine: 'line-through' },
  more: { fontSize: 9, color: colors.inkMuted, textAlign: 'center' },
});
