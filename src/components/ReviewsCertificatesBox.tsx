import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from './AppText';
import { colors, fonts } from '../theme';

// PROTOTYPE: fixed numbers shown on every profile until reviews/certificates are real.
export const PROTOTYPE_RATING = '5.0';
export const PROTOTYPE_CERTIFICATES = 2;

export type Stat = { icon: keyof typeof Ionicons.glyphMap; title: string; value: string };

/** White box with icon + HORIZON title + value per column, divided by thin lines. */
export function StatsBox({ items, style }: { items: Stat[]; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.box, style]}>
      {items.map((item, i) => (
        <View key={item.title} style={styles.column}>
          {i > 0 && <View style={styles.divider} />}
          <View style={styles.stat}>
            <Ionicons name={item.icon} size={20} color={colors.wine} />
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.sub}>{item.value}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

/** Reviews | Certificates summary, shared by the public profile and the creator's own profile. */
export default function ReviewsCertificatesBox({ style }: { style?: StyleProp<ViewStyle> }) {
  return (
    <StatsBox
      style={style}
      items={[
        { icon: 'star-outline', title: 'Reviews', value: PROTOTYPE_RATING },
        { icon: 'ribbon-outline', title: 'Certificates', value: `${PROTOTYPE_CERTIFICATES} submitted` },
      ]}
    />
  );
}

const BORDER = '#E9DFE6';

const styles = StyleSheet.create({
  box: { backgroundColor: '#FFFFFF', borderRadius: 17, borderWidth: 1, borderColor: BORDER, flexDirection: 'row', paddingVertical: 18 },
  column: { flex: 1, flexDirection: 'row' },
  stat: { flex: 1, alignItems: 'center', gap: 5 },
  title: { color: '#271D2B', fontSize: 15, fontFamily: fonts.title },
  sub: { color: '#786B7A', fontSize: 12 },
  divider: { width: 1, backgroundColor: BORDER },
});
