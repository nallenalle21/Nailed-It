import { useRef, useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '../AppText';
import { colors, fonts } from '../../theme';
import { EVENT_COLORS, toMin, type CalendarEvent } from './types';

/** Height of one hour on the timeline. */
export const HOUR_HEIGHT = 52;
const GUTTER = 50; // hour labels on the left
const HOURS = Array.from({ length: 24 }, (_, h) => h);
const pad = (n: number) => String(n).padStart(2, '0');

const dayTitle = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
};

/**
 * Side-by-side columns for overlapping bookings (like Apple Calendar): each event gets a
 * column within its group of overlapping events, and the group's column count.
 */
export function layoutColumns(events: CalendarEvent[]) {
  const placed: { e: CalendarEvent; col: number; cols: number }[] = [];
  let group: typeof placed = [];
  let groupEnd = -1;
  const closeGroup = () => {
    const cols = Math.max(1, ...group.map((p) => p.col + 1));
    group.forEach((p) => { p.cols = cols; });
    group = [];
  };
  for (const e of [...events].sort((a, b) => a.start.localeCompare(b.start))) {
    if (toMin(e.start) >= groupEnd) { closeGroup(); groupEnd = -1; }
    const taken = new Set(group.filter((p) => toMin(p.e.end) > toMin(e.start)).map((p) => p.col));
    let col = 0;
    while (taken.has(col)) col++;
    const p = { e, col, cols: 1 };
    group.push(p);
    placed.push(p);
    groupEnd = Math.max(groupEnd, toMin(e.end));
  }
  closeGroup();
  return placed;
}

type Props = {
  dateKey: string;
  todayKey: string;
  /** Everything on this day. Free time is drawn softly behind the bookings. */
  events: CalendarEvent[];
  onChangeDay: (delta: number) => void;
  onEventPress: (e: CalendarEvent) => void;
  /**
   * Freelancers: press and hold on the day, then drag up/down to mark a time range (on a 15-min grid);
   * letting go calls this with the range in minutes after midnight. Holding without dragging marks 1 hour.
   */
  onSelectRange?: (startMinutes: number, endMinutes: number) => void;
  /** True while a range is being dragged (the page shouldn't scroll meanwhile). */
  onSelecting?: (selecting: boolean) => void;
  /** False when the screen shows <DayHeader> itself, fixed at the top of the page. */
  showHeader?: boolean;
};

/** The day's date with ← → for the previous/next day. Screens keep it fixed at the top in the day view. */
export function DayHeader({ dateKey, onChangeDay }: { dateKey: string; onChangeDay: (delta: number) => void }) {
  return (
    <View style={styles.header}>
      <TouchableOpacity onPress={() => onChangeDay(-1)} hitSlop={10} accessibilityLabel="Previous day">
        <Ionicons name="chevron-back" size={22} color={colors.ink} />
      </TouchableOpacity>
      <Text style={styles.title}>{dayTitle(dateKey)}</Text>
      <TouchableOpacity onPress={() => onChangeDay(1)} hitSlop={10} accessibilityLabel="Next day">
        <Ionicons name="chevron-forward" size={22} color={colors.ink} />
      </TouchableOpacity>
    </View>
  );
}

const DAY_END = 24 * 60;
const hhmm = (m: number) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;

/** One day, hour by hour, like Apple Calendar's day view. Swipe sideways for the next/previous day. */
export default function DayTimeline({ dateKey, todayKey, events, onChangeDay, onEventPress, onSelectRange, onSelecting, showHeader = true }: Props) {
  const free = events.filter((e) => e.kind === 'available');
  const bookings = layoutColumns(events.filter((e) => e.kind !== 'available'));
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  const swipe = Gesture.Pan()
    .runOnJS(true)
    .activeOffsetX([-25, 25])
    .failOffsetY([-12, 12])
    .onEnd((e) => {
      if (e.translationX < -60) onChangeDay(1);
      else if (e.translationX > 60) onChangeDay(-1);
    });

  // ---- Press, hold and drag to mark a time range (e.g. 10:00–13:00) ----
  const [range, setRange] = useState<{ start: number; end: number } | null>(null);
  const rangeRef = useRef<{ start: number; end: number } | null>(null);
  const anchor = useRef(0);
  const showRange = (r: { start: number; end: number } | null) => { rangeRef.current = r; setRange(r); };
  const quarterAt = (y: number) => Math.min(DAY_END - 15, Math.max(0, Math.floor((y / HOUR_HEIGHT) * 4) * 15));
  const select = Gesture.Pan()
    .runOnJS(true)
    .enabled(!!onSelectRange)
    .activateAfterLongPress(300)
    .onStart((e) => {
      anchor.current = quarterAt(e.y);
      showRange({ start: anchor.current, end: Math.min(DAY_END, anchor.current + 60) }); // just holding = 1 hour
      onSelecting?.(true);
    })
    .onUpdate((e) => {
      if (Math.abs(e.translationY) < 8) return; // still holding: keep the 1 hour
      const at = quarterAt(e.y);
      showRange(at >= anchor.current
        ? { start: anchor.current, end: Math.min(DAY_END, at + 15) }   // dragged down
        : { start: at, end: anchor.current + 15 });                     // dragged up
    })
    .onEnd(() => {
      const r = rangeRef.current;
      if (r && onSelectRange) onSelectRange(r.start, Math.min(r.end, DAY_END - 1));
    })
    .onFinalize(() => {
      showRange(null);
      onSelecting?.(false);
    });
  // Holding still marks a range; a quick sideways swipe changes the day. Whichever starts first wins.
  const gestures = Gesture.Race(swipe, select);

  const top = (t: string) => (toMin(t) / 60) * HOUR_HEIGHT;
  const height = (e: CalendarEvent) => Math.max(18, ((toMin(e.end) - toMin(e.start)) / 60) * HOUR_HEIGHT - 2);

  return (
    <View>
      {showHeader && <DayHeader dateKey={dateKey} onChangeDay={onChangeDay} />}

      <GestureDetector gesture={gestures}>
        <View style={{ height: 24 * HOUR_HEIGHT, marginTop: 8 }}>
          {/* Hour lines and labels */}
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            {HOURS.map((h) => (
              <View key={h} style={[styles.hourRow, { top: h * HOUR_HEIGHT }]}>
                <Text style={styles.hourText}>{pad(h)}:00</Text>
                <View style={styles.hourLine} />
              </View>
            ))}
          </View>

          {/* Free time, behind the bookings */}
          {free.map((e) => (
            <TouchableOpacity
              key={e.id + e.start}
              style={[styles.freeBlock, { top: top(e.start), height: height(e) }]}
              onPress={() => onEventPress(e)}
              accessibilityLabel={`Available ${e.start} to ${e.end}`}
            >
              <Text style={styles.freeText}>Available {e.start}–{e.end}</Text>
            </TouchableOpacity>
          ))}

          {/* Bookings and requests, side by side when they overlap */}
          <View style={styles.eventLayer} pointerEvents="box-none">
            {bookings.map(({ e, col, cols }) => (
              <TouchableOpacity
                key={e.id + e.start}
                style={[styles.event, {
                  top: top(e.start),
                  height: height(e),
                  left: `${(col / cols) * 100}%`,
                  width: `${100 / cols}%`,
                  backgroundColor: EVENT_COLORS[e.kind].fill,
                }]}
                onPress={() => onEventPress(e)}
                accessibilityLabel={`${e.title}, ${e.start} to ${e.end}`}
              >
                <Text style={[styles.eventTitle, { color: EVENT_COLORS[e.kind].text }, e.kind === 'inactive' && styles.struck]} numberOfLines={1}>
                  {e.title}
                </Text>
                <Text style={[styles.eventMeta, { color: EVENT_COLORS[e.kind].text }]} numberOfLines={2}>
                  {e.start}–{e.end}{e.subtitle ? ` · ${e.subtitle}` : ''}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* The range being marked (press, hold and drag) */}
          {range && (
            <View pointerEvents="none" style={[styles.range, {
              top: (range.start / 60) * HOUR_HEIGHT,
              height: ((range.end - range.start) / 60) * HOUR_HEIGHT,
            }]}>
              <Text style={styles.rangeText}>{hhmm(range.start)}–{hhmm(Math.min(range.end, DAY_END - 1))}</Text>
            </View>
          )}

          {/* Now */}
          {dateKey === todayKey && (
            <View pointerEvents="none" style={[styles.nowLine, { top: (nowMinutes / 60) * HOUR_HEIGHT }]}>
              <View style={styles.nowDot} />
            </View>
          )}
        </View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingVertical: 12 },
  title: { fontSize: 16, color: colors.ink, fontFamily: fonts.title, textAlign: 'center' },
  range: { position: 'absolute', left: GUTTER + 2, right: 14, borderRadius: 6, backgroundColor: 'rgba(250,137,171,0.45)', borderWidth: 2, borderColor: colors.wine, paddingHorizontal: 6, paddingTop: 2 },
  rangeText: { fontSize: 12, fontWeight: '700', color: colors.wine },
  hourRow: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', alignItems: 'flex-start' },
  hourText: { width: GUTTER, fontSize: 11, color: colors.inkMuted, textAlign: 'right', paddingRight: 8, marginTop: -7 },
  hourLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.line, marginRight: 12 },
  freeBlock: { position: 'absolute', left: GUTTER + 2, right: 14, borderRadius: 6, backgroundColor: colors.pinkTint, borderWidth: 1, borderColor: colors.line, borderStyle: 'dashed', paddingHorizontal: 6, paddingTop: 2 },
  freeText: { fontSize: 11, color: colors.inkMuted },
  eventLayer: { position: 'absolute', top: 0, bottom: 0, left: GUTTER + 8, right: 18 },
  event: { position: 'absolute', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3, borderWidth: 1, borderColor: colors.background, overflow: 'hidden' },
  eventTitle: { fontSize: 13, fontWeight: '700' },
  eventMeta: { fontSize: 11 },
  struck: { textDecorationLine: 'line-through' },
  nowLine: { position: 'absolute', left: GUTTER - 4, right: 12, height: 2, backgroundColor: colors.wine },
  nowDot: { position: 'absolute', left: -4, top: -3, width: 8, height: 8, borderRadius: 4, backgroundColor: colors.wine },
});
