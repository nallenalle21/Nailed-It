import { useRef, useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '../AppText';
import { colors, fonts } from '../../theme';
import { EVENT_COLORS, toMin, type CalendarEvent } from './types';
import { layoutColumns } from './DayTimeline';

/** Height of one hour in the week view. */
export const WEEK_HOUR_HEIGHT = 48;
const GUTTER = 44; // hour labels on the left
const HOURS = Array.from({ length: 24 }, (_, h) => h);
const DAY_END = 24 * 60;
const LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const pad = (n: number) => String(n).padStart(2, '0');
const hhmm = (m: number) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
const keyOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dateOf = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
};

/** The 7 days (Monday → Sunday) of the week that `key` is in. */
export function weekDays(key: string): string[] {
  const d = dateOf(key);
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => keyOf(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i)));
}

/**
 * Top of the week view (kept fixed while the hours scroll), like Apple Calendar: the week's
 * 7 days (tap one to see it), and the chosen day's date with ‹ › for the previous/next day.
 * The chosen day is a filled circle (wine if it's today); today is also marked in wine.
 */
export function WeekHeader({ dateKey, todayKey, onChangeDay, onSelectDay }: {
  dateKey: string;
  todayKey: string;
  /** ‹ › : -1 = previous day, 1 = next day. */
  onChangeDay: (delta: number) => void;
  onSelectDay: (key: string) => void;
}) {
  const days = weekDays(dateKey);
  const title = dateOf(dateKey).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  return (
    <View style={styles.headerWrap}>
      <View style={styles.daysRow}>
        {days.map((key, i) => {
          const isToday = key === todayKey;
          const isSelected = key === dateKey;
          return (
            <TouchableOpacity
              key={key}
              style={styles.dayCell}
              onPress={() => onSelectDay(key)}
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={dateOf(key).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
            >
              <Text style={[styles.dayLetter, isToday && styles.todayLetter]}>{LETTERS[i]}</Text>
              {/* Like Apple: chosen day = filled circle (wine if it's today); today otherwise = wine number */}
              <View style={[styles.dayCircle, isSelected && (isToday ? styles.selectedToday : styles.selectedCircle)]}>
                <Text style={[styles.dayNumber, isToday && styles.todayNumber, isSelected && styles.selectedNumber]}>
                  {dateOf(key).getDate()}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
      {/* The chosen day, with ‹ › one day back / forward */}
      <View style={styles.titleRow}>
        <TouchableOpacity onPress={() => onChangeDay(-1)} hitSlop={10} accessibilityLabel="Previous day">
          <Ionicons name="chevron-back" size={22} color={colors.ink} />
        </TouchableOpacity>
        <Text style={styles.title}>{title}</Text>
        <TouchableOpacity onPress={() => onChangeDay(1)} hitSlop={10} accessibilityLabel="Next day">
          <Ionicons name="chevron-forward" size={22} color={colors.ink} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

type Props = {
  /** The chosen day: its week is shown and its column is tinted. */
  dateKey: string;
  todayKey: string;
  /** Everything in the calendar, by date. */
  byDate: Record<string, CalendarEvent[]>;
  /** Swipe sideways: -1 = previous week, 1 = next week. */
  onChangeWeek: (delta: number) => void;
  onEventPress: (e: CalendarEvent) => void;
  /** Freelancers: press, hold and drag in a day's column to mark a time range on that day. */
  onSelectRange?: (dateKey: string, startMinutes: number, endMinutes: number) => void;
  /** True while a range is being dragged (the page shouldn't scroll meanwhile). */
  onSelecting?: (selecting: boolean) => void;
};

/** The week, hour by hour, one column per day (like Apple Calendar's week view). */
export default function WeekTimeline({ dateKey, todayKey, byDate, onChangeWeek, onEventPress, onSelectRange, onSelecting }: Props) {
  const days = weekDays(dateKey);
  const [gridWidth, setGridWidth] = useState(0);
  const colWidth = gridWidth > GUTTER ? (gridWidth - GUTTER) / 7 : 0;
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const todayCol = days.indexOf(todayKey);
  const selectedCol = days.indexOf(dateKey);

  const swipe = Gesture.Pan()
    .runOnJS(true)
    .activeOffsetX([-25, 25])
    .failOffsetY([-12, 12])
    .onEnd((e) => {
      if (e.translationX < -60) onChangeWeek(1);
      else if (e.translationX > 60) onChangeWeek(-1);
    });

  // ---- Press, hold and drag in a column to mark a time range on that day ----
  const [range, setRange] = useState<{ col: number; start: number; end: number } | null>(null);
  const rangeRef = useRef<typeof range>(null);
  const anchor = useRef({ col: 0, min: 0 });
  const showRange = (r: typeof range) => { rangeRef.current = r; setRange(r); };
  const quarterAt = (y: number) => Math.min(DAY_END - 15, Math.max(0, Math.floor((y / WEEK_HOUR_HEIGHT) * 4) * 15));
  const colAt = (x: number) => Math.min(6, Math.max(0, Math.floor((x - GUTTER) / (colWidth || 1))));
  const select = Gesture.Pan()
    .runOnJS(true)
    .enabled(!!onSelectRange)
    .activateAfterLongPress(300)
    .onStart((e) => {
      anchor.current = { col: colAt(e.x), min: quarterAt(e.y) };
      showRange({ col: anchor.current.col, start: anchor.current.min, end: Math.min(DAY_END, anchor.current.min + 60) });
      onSelecting?.(true);
    })
    .onUpdate((e) => {
      if (Math.abs(e.translationY) < 8) return; // just holding: 1 hour
      const at = quarterAt(e.y);
      const { col, min } = anchor.current;
      showRange(at >= min ? { col, start: min, end: Math.min(DAY_END, at + 15) } : { col, start: at, end: min + 15 });
    })
    .onEnd(() => {
      const r = rangeRef.current;
      if (r && onSelectRange) onSelectRange(days[r.col], r.start, Math.min(r.end, DAY_END - 1));
    })
    .onFinalize(() => {
      showRange(null);
      onSelecting?.(false);
    });
  const gestures = Gesture.Race(swipe, select);

  const top = (t: string) => (toMin(t) / 60) * WEEK_HOUR_HEIGHT;
  const height = (e: CalendarEvent) => Math.max(16, ((toMin(e.end) - toMin(e.start)) / 60) * WEEK_HOUR_HEIGHT - 2);
  const colLeft = (i: number) => GUTTER + i * colWidth;

  return (
    <GestureDetector gesture={gestures}>
      <View style={{ height: 24 * WEEK_HOUR_HEIGHT, marginTop: 6 }} onLayout={(e) => setGridWidth(e.nativeEvent.layout.width)}>
        {/* The chosen day's column, lightly tinted */}
        {selectedCol >= 0 && colWidth > 0 && (
          <View pointerEvents="none" style={[styles.selectedColumn, { left: colLeft(selectedCol), width: colWidth }]} />
        )}

        {/* Hour lines + labels, and lines between the days */}
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          {HOURS.map((h) => (
            <View key={h} style={[styles.hourRow, { top: h * WEEK_HOUR_HEIGHT }]}>
              <Text style={styles.hourText}>{pad(h)}:00</Text>
              <View style={styles.hourLine} />
            </View>
          ))}
          {colWidth > 0 && days.map((d, i) => (
            <View key={d} style={[styles.dayLine, { left: colLeft(i) }]} />
          ))}
        </View>

        {colWidth > 0 && days.map((d, i) => {
          const events = byDate[d] ?? [];
          const free = events.filter((e) => e.kind === 'available');
          const bookings = layoutColumns(events.filter((e) => e.kind !== 'available'));
          return (
            <View key={d} pointerEvents="box-none" style={StyleSheet.absoluteFill}>
              {/* Free time, behind the bookings */}
              {free.map((e) => (
                <TouchableOpacity
                  key={e.id + e.start}
                  style={[styles.free, { top: top(e.start), height: height(e), left: colLeft(i) + 1, width: colWidth - 2 }]}
                  onPress={() => onEventPress(e)}
                  accessibilityLabel={`Available ${e.start} to ${e.end}`}
                />
              ))}
              {/* Bookings and requests, side by side when they overlap */}
              {bookings.map(({ e, col, cols }) => (
                <TouchableOpacity
                  key={e.id + e.start}
                  style={[styles.event, {
                    top: top(e.start),
                    height: height(e),
                    left: colLeft(i) + 1 + (col * (colWidth - 2)) / cols,
                    width: (colWidth - 2) / cols - 1,
                    backgroundColor: EVENT_COLORS[e.kind].fill,
                  }]}
                  onPress={() => onEventPress(e)}
                  accessibilityLabel={`${e.title}, ${e.start} to ${e.end}`}
                >
                  <Text style={[styles.eventTime, { color: EVENT_COLORS[e.kind].text }]} numberOfLines={1}>{e.start}</Text>
                  <Text style={[styles.eventTitle, { color: EVENT_COLORS[e.kind].text }, e.kind === 'inactive' && styles.struck]} numberOfLines={2}>
                    {e.title}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          );
        })}

        {/* The range being marked */}
        {range && colWidth > 0 && (
          <View pointerEvents="none" style={[styles.range, {
            top: (range.start / 60) * WEEK_HOUR_HEIGHT,
            height: ((range.end - range.start) / 60) * WEEK_HOUR_HEIGHT,
            left: colLeft(range.col) + 1,
            width: colWidth - 2,
          }]}>
            <Text style={styles.rangeText}>{hhmm(range.start)}</Text>
            <Text style={styles.rangeText}>{hhmm(Math.min(range.end, DAY_END - 1))}</Text>
          </View>
        )}

        {/* Now (in today's column) */}
        {todayCol >= 0 && colWidth > 0 && (
          <View pointerEvents="none" style={[styles.nowLine, { top: (nowMinutes / 60) * WEEK_HOUR_HEIGHT, left: colLeft(todayCol), width: colWidth }]}>
            <View style={styles.nowDot} />
          </View>
        )}
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  headerWrap: { paddingTop: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line, backgroundColor: colors.background },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 8 },
  title: { fontSize: 15, color: colors.ink, fontFamily: fonts.title },
  daysRow: { flexDirection: 'row', paddingHorizontal: 8 },
  dayCell: { flex: 1, alignItems: 'center', gap: 3 },
  dayLetter: { fontSize: 11, color: colors.inkMuted, fontWeight: '600' },
  todayLetter: { color: colors.wine },
  dayCircle: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  selectedCircle: { backgroundColor: colors.ink },
  selectedToday: { backgroundColor: colors.wine },
  dayNumber: { fontSize: 15, color: colors.ink, fontWeight: '600' },
  selectedNumber: { color: colors.background, fontWeight: '800' },
  todayNumber: { color: colors.wine, fontWeight: '800' },
  selectedColumn: { position: 'absolute', top: 0, bottom: 0, backgroundColor: 'rgba(250,137,171,0.08)' },
  hourRow: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', alignItems: 'flex-start' },
  hourText: { width: GUTTER, fontSize: 10, color: colors.inkMuted, textAlign: 'right', paddingRight: 6, marginTop: -6 },
  hourLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.line },
  dayLine: { position: 'absolute', top: 0, bottom: 0, width: StyleSheet.hairlineWidth, backgroundColor: colors.line },
  free: { position: 'absolute', borderRadius: 4, backgroundColor: colors.pinkTint, borderWidth: 1, borderColor: colors.line, borderStyle: 'dashed' },
  event: { position: 'absolute', borderRadius: 4, paddingHorizontal: 2, paddingVertical: 1, overflow: 'hidden' },
  eventTime: { fontSize: 9, fontWeight: '700' },
  eventTitle: { fontSize: 9 },
  struck: { textDecorationLine: 'line-through' },
  range: { position: 'absolute', borderRadius: 4, backgroundColor: 'rgba(250,137,171,0.45)', borderWidth: 2, borderColor: colors.wine, paddingHorizontal: 2 },
  rangeText: { fontSize: 9, fontWeight: '800', color: colors.wine },
  nowLine: { position: 'absolute', height: 2, backgroundColor: colors.wine },
  nowDot: { position: 'absolute', left: -3, top: -3, width: 8, height: 8, borderRadius: 4, backgroundColor: colors.wine },
});
