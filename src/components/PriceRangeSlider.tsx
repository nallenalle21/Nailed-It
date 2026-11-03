import { useRef, useState } from 'react';
import { PanResponder, StyleSheet, View } from 'react-native';
import { Text } from './AppText';
import { colors } from '../theme';

type Range = [number, number];

type Props = {
  min: number;
  max: number;
  step: number;
  value: Range;
  onChange: (value: Range) => void;
};

const THUMB = 28;

/** Two-handle slider for picking a min–max price. Built on PanResponder, so no native dependency. */
export default function PriceRangeSlider({ min, max, step, value, onChange }: Props) {
  const [width, setWidth] = useState(0);

  // PanResponders are created once, so they read the latest props through refs.
  const latest = useRef({ value, width, onChange });
  latest.current = { value, width, onChange };

  const makeResponder = (thumb: 0 | 1) => {
    let start = 0;
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false, // keep the drag even if the sheet wants it
      onPanResponderGrant: () => { start = latest.current.value[thumb]; },
      onPanResponderMove: (_, g) => {
        const { value: [lo, hi], width: w, onChange: emit } = latest.current;
        if (!w) return;
        const raw = start + (g.dx / w) * (max - min);
        const snapped = Math.round(raw / step) * step;
        if (thumb === 0) {
          const next = Math.min(Math.max(snapped, min), hi - step);
          if (next !== lo) emit([next, hi]);
        } else {
          const next = Math.max(Math.min(snapped, max), lo + step);
          if (next !== hi) emit([lo, next]);
        }
      },
    });
  };
  const loResponder = useRef(makeResponder(0)).current;
  const hiResponder = useRef(makeResponder(1)).current;

  const toX = (v: number) => ((v - min) / (max - min)) * width;
  const loX = toX(value[0]);
  const hiX = toX(value[1]);

  return (
    <View>
      <View style={styles.labels}>
        <Text style={styles.label}>{value[0]} kr</Text>
        <Text style={styles.label}>{value[1] === max ? `${max}+` : value[1]} kr</Text>
      </View>
      <View style={styles.trackArea} onLayout={e => setWidth(e.nativeEvent.layout.width)}>
        <View style={styles.track} />
        <View style={[styles.trackActive, { left: loX, width: Math.max(hiX - loX, 0) }]} />
        <View {...loResponder.panHandlers} hitSlop={12} style={[styles.thumb, { left: loX - THUMB / 2 }]} />
        <View {...hiResponder.panHandlers} hitSlop={12} style={[styles.thumb, { left: hiX - THUMB / 2 }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  labels: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 },
  label: { fontSize: 16, fontWeight: '600', color: colors.ink },
  // Side margins keep the thumbs fully on screen at the ends of the track.
  trackArea: { height: THUMB, justifyContent: 'center', marginHorizontal: THUMB / 2 },
  track: { height: 4, borderRadius: 2, backgroundColor: colors.border },
  trackActive: { position: 'absolute', height: 4, borderRadius: 2, backgroundColor: colors.blue },
  thumb: {
    position: 'absolute',
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    backgroundColor: colors.background,
    borderWidth: 3,
    borderColor: colors.blue,
  },
});
