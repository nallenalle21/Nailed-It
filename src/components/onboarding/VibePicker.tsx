import { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '../AppText';
import { VIBES } from '../../data/vibes';
import { colors, fonts } from '../../theme';

const STAR = require('../../../assets/images/star.png');
const MIN_PICKS = 3;
const SIDE = 20;
const GAP = 8;

type Props = {
  onBack: () => void;
  onSkip: () => void;
  onDone: (vibeIds: string[]) => void;
};

/** "Pick your vibe": a 3 × 3 grid of looks. Needs at least 3 picks to continue. */
export default function VibePicker({ onBack, onSkip, onDone }: Props) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [picked, setPicked] = useState<string[]>([]);
  const tileW = (width - SIDE * 2 - GAP * 2) / 3;
  const tileH = tileW * 1.4;
  const ready = picked.length >= MIN_PICKS;

  const toggle = (id: string) =>
    setPicked(cur => (cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id]));

  return (
    <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        <View style={styles.topRow}>
          <TouchableOpacity style={styles.backBtn} onPress={onBack} accessibilityRole="button" accessibilityLabel="back">
            <Ionicons name="chevron-back" size={22} color={colors.background} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.skip} onPress={onSkip} accessibilityRole="button">
            <Text style={styles.skipText}>skip</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.titleRow}>
          <Text style={styles.title}>pick your vibe</Text>
          <Image source={STAR} style={styles.titleStar} />
        </View>
        <Text style={styles.subtitle}>tap 3 or more. we'll fill your explore with nail techs who do them.</Text>
      </View>

      <ScrollView contentContainerStyle={styles.grid}>
        {VIBES.map(v => {
          const on = picked.includes(v.id);
          return (
            <Pressable
              key={v.id}
              onPress={() => toggle(v.id)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              accessibilityLabel={v.label}
              style={[styles.tile, { width: tileW, height: tileH }, on && styles.tileOn]}
            >
              <Image source={v.photo} style={styles.photo} resizeMode="cover" />
              <View style={styles.label}>
                <Text style={styles.labelText} numberOfLines={1}>{v.label}</Text>
              </View>
              {on ? (
                <View style={styles.check}>
                  <Ionicons name="checkmark" size={15} color={colors.ink} />
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        {ready ? (
          <TouchableOpacity style={styles.primaryBtn} onPress={() => onDone(picked)} accessibilityRole="button">
            <Text style={styles.primaryBtnText}>show me my nail techs ({picked.length})</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.disabledBtn} accessibilityRole="button" accessibilityState={{ disabled: true }}>
            <Text style={styles.disabledText}>pick {MIN_PICKS - picked.length} more</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.blueMuted },
  header: { paddingHorizontal: SIDE, paddingBottom: 18, gap: 10 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  backBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(250,249,246,0.18)' },
  skip: { height: 36, paddingHorizontal: 16, borderRadius: 999, justifyContent: 'center', backgroundColor: 'rgba(250,249,246,0.2)' },
  skipText: { color: colors.background, fontSize: 14, fontWeight: 'bold' },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 6 },
  title: { fontFamily: fonts.title, fontSize: 28, color: colors.background },
  titleStar: { width: 20, height: 20, marginTop: -6 },
  subtitle: { color: colors.background, fontSize: 15, lineHeight: 21 },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP, paddingHorizontal: SIDE, paddingBottom: 12 },
  tile: { borderRadius: 14, overflow: 'hidden', borderWidth: 3, borderColor: 'transparent', backgroundColor: 'rgba(250,249,246,0.15)' },
  tileOn: { borderColor: colors.pink, transform: [{ scale: 0.96 }] },
  photo: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' },
  label: { position: 'absolute', left: 6, bottom: 6, maxWidth: '85%', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: colors.background },
  labelText: { fontSize: 10, fontWeight: 'bold', color: colors.ink },
  check: { position: 'absolute', top: 6, right: 6, width: 24, height: 24, borderRadius: 12, backgroundColor: colors.pink, alignItems: 'center', justifyContent: 'center' },

  footer: { paddingHorizontal: SIDE, paddingTop: 12 },
  primaryBtn: { height: 56, borderRadius: 999, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
  primaryBtnText: { color: colors.grey, fontSize: 17, fontWeight: 'bold' },
  disabledBtn: { height: 56, borderRadius: 999, borderWidth: 1.5, borderColor: 'rgba(250,249,246,0.6)', alignItems: 'center', justifyContent: 'center' },
  disabledText: { color: colors.background, fontSize: 17, fontWeight: 'bold' },
});
