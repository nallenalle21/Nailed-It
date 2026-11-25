import { useMemo, useRef } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { Text } from '../AppText';
import { colors, fonts } from '../../theme';

const ITEM_HEIGHT = 40;
const VISIBLE_ITEMS = 5; // the chosen time sits in the middle row
const pad = (n: number) => String(n).padStart(2, '0');

/** Every time of the day in `step`-minute steps: "00:00", "00:15", … "23:45". */
function timesOfDay(step: number) {
  const list: string[] = [];
  for (let m = 0; m < 24 * 60; m += step) list.push(`${pad(Math.floor(m / 60))}:${pad(m % 60)}`);
  return list;
}

type Props = {
  label: string;
  /** "HH:MM" on the step grid. */
  value: string;
  onChange: (value: string) => void;
  /** Minutes between choices (default 15). */
  step?: number;
};

/**
 * A scrollable time picker (a wheel): scroll up/down and the time in the middle is chosen,
 * or tap a time to jump to it. Same look on iPhone and Android.
 */
export default function TimeWheel({ label, value, onChange, step = 15 }: Props) {
  const times = useMemo(() => timesOfDay(step), [step]);
  const ref = useRef<ScrollView>(null);
  const index = Math.max(0, times.indexOf(value));

  const pick = (i: number) => {
    const clamped = Math.min(times.length - 1, Math.max(0, i));
    if (times[clamped] !== value) onChange(times[clamped]);
  };
  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) =>
    pick(Math.round(e.nativeEvent.contentOffset.y / ITEM_HEIGHT));

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.wheel}>
        {/* The band that marks the chosen time */}
        <View pointerEvents="none" style={styles.band} />
        <ScrollView
          ref={ref}
          showsVerticalScrollIndicator={false}
          snapToInterval={ITEM_HEIGHT}
          decelerationRate="fast"
          nestedScrollEnabled
          // Start at the current value
          onLayout={() => ref.current?.scrollTo({ y: index * ITEM_HEIGHT, animated: false })}
          onMomentumScrollEnd={onScrollEnd}
          onScrollEndDrag={(e) => { if (!e.nativeEvent.velocity || Math.abs(e.nativeEvent.velocity.y) < 0.05) onScrollEnd(e); }}
          contentContainerStyle={{ paddingVertical: ITEM_HEIGHT * Math.floor(VISIBLE_ITEMS / 2) }}
        >
          {times.map((t, i) => (
            <TouchableOpacity
              key={t}
              style={styles.item}
              onPress={() => { ref.current?.scrollTo({ y: i * ITEM_HEIGHT, animated: true }); pick(i); }}
              accessibilityRole="button"
              accessibilityState={{ selected: t === value }}
              accessibilityLabel={`${label} ${t}`}
            >
              <Text style={[styles.time, t === value && styles.timeChosen]}>{t}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center' },
  label: { fontSize: 12, color: colors.inkMuted, fontWeight: '600', textTransform: 'uppercase', marginBottom: 6 },
  wheel: { height: ITEM_HEIGHT * VISIBLE_ITEMS, alignSelf: 'stretch', overflow: 'hidden' },
  band: {
    position: 'absolute', left: 6, right: 6, top: ITEM_HEIGHT * Math.floor(VISIBLE_ITEMS / 2), height: ITEM_HEIGHT,
    borderRadius: 10, backgroundColor: colors.pinkTint, borderWidth: 1, borderColor: colors.pink,
  },
  item: { height: ITEM_HEIGHT, alignItems: 'center', justifyContent: 'center' },
  time: { fontSize: 17, color: colors.inkMuted },
  timeChosen: { fontSize: 20, color: colors.wine, fontFamily: fonts.title },
});
