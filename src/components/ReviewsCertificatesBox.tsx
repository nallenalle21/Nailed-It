import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from './AppText';
import { colors, fonts } from '../theme';

// PROTOTYPE: fixed numbers shown on every profile until reviews/certificates are real.
export const PROTOTYPE_RATING = '5.0';
export const PROTOTYPE_CERTIFICATES = 2;

/** Reviews | Certificates summary box, shared by the public profile and the creator's own profile. */
export default function ReviewsCertificatesBox({ style }: { style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.box, style]}>
      <View style={styles.stat}>
        <Ionicons name="star-outline" size={20} color={colors.wine} />
        <Text style={styles.title}>Reviews</Text>
        <Text style={styles.sub}>{PROTOTYPE_RATING}</Text>
      </View>
      <View style={styles.divider} />
      <View style={styles.stat}>
        <Ionicons name="ribbon-outline" size={20} color={colors.wine} />
        <Text style={styles.title}>Certificates</Text>
        <Text style={styles.sub}>{PROTOTYPE_CERTIFICATES} submitted</Text>
      </View>
    </View>
  );
}

const BORDER = '#E9DFE6';

const styles = StyleSheet.create({
  box: { backgroundColor: '#FFFFFF', borderRadius: 17, borderWidth: 1, borderColor: BORDER, flexDirection: 'row', paddingVertical: 18 },
  stat: { flex: 1, alignItems: 'center', gap: 5 },
  title: { color: '#271D2B', fontSize: 15, fontFamily: fonts.title },
  sub: { color: '#786B7A', fontSize: 12 },
  divider: { width: 1, backgroundColor: BORDER },
});
