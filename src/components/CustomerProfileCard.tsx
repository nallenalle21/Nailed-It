import { ActivityIndicator, Image, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from './AppText';
import { colors, fonts } from '../theme';
import { handle } from '../utils/handle';
import { formatDayMonthYear } from '../services/account';

export type ProfileStat = { value: string; label: string; small?: boolean };

type CardProps = {
  name: string | null;
  username: string;
  /** Shown with a pin under the username. */
  city: string | null;
  /** The numbers on the right, top to bottom. */
  stats: ProfileStat[];
  photoUri: string | null;
  /** Own profile only: the camera button on the photo. */
  onChangePhoto?: () => void;
  photoBusy?: boolean;
  /** Own profile only: "+ add your name" when no name is set. */
  onAddName?: () => void;
};

/** "12 bookings" style stat; '–' while unknown. */
export const countStat = (n: number | null, one: string, many: string): ProfileStat =>
  ({ value: n === null ? '–' : String(n), label: n === 1 ? one : many });

/** "on nailed it since 22 sept 2026" */
export const memberSinceStat = (iso: string | null): ProfileStat =>
  ({ value: iso ? formatDayMonthYear(iso) : '–', label: 'on nailed it since', small: true });

type CustomerProps = Omit<CardProps, 'stats'> & {
  memberSince: string | null;
  bookings: number | null;
  collections: number | null;
};

/**
 * A customer's profile card: the same on "My profile" and when a freelancer opens the customer.
 */
export default function CustomerProfileCard({ memberSince, bookings, collections, ...card }: CustomerProps) {
  return (
    <ProfileCard
      {...card}
      stats={[
        countStat(bookings, 'booking', 'bookings'),
        countStat(collections, 'collection', 'collections'),
        memberSinceStat(memberSince),
      ]}
    />
  );
}

/**
 * Profile card, Airbnb-style: photo, name, @username and location on the left, the numbers on
 * the right. Used for customers (above) and on the freelancer's own profile.
 */
export function ProfileCard({ name, username, city, stats, photoUri, onChangePhoto, photoBusy, onAddName }: CardProps) {
  return (
    <View style={styles.card}>
      {/* Left: who they are */}
      <View style={styles.identity}>
        <View style={styles.imageWrapper}>
          {photoUri ? (
            <Image source={{ uri: photoUri }} style={styles.profilePic} />
          ) : (
            <View style={[styles.profilePic, styles.profilePicPlaceholder]}>
              <Text style={styles.profileInitial}>{(name || username || '?').charAt(0).toUpperCase()}</Text>
            </View>
          )}
          {onChangePhoto && (
            <TouchableOpacity
              style={styles.cameraIcon}
              onPress={onChangePhoto}
              disabled={photoBusy}
              accessibilityLabel="Change profile picture"
            >
              {photoBusy
                ? <ActivityIndicator color={colors.background} size="small" />
                : <Ionicons name="camera" size={15} color={colors.background} />}
            </TouchableOpacity>
          )}
        </View>
        {name ? (
          <Text style={styles.name} numberOfLines={2}>{name}</Text>
        ) : onAddName ? (
          <TouchableOpacity onPress={onAddName} accessibilityLabel="Add your name">
            <Text style={styles.addName}>+ add your name</Text>
          </TouchableOpacity>
        ) : null}
        <Text style={[styles.detail, !name && !onAddName && styles.usernameAsName]} numberOfLines={1}>{handle(username)}</Text>
        {city ? (
          <View style={styles.cityRow}>
            <Ionicons name="location-outline" size={13} color={colors.inkMuted} />
            <Text style={styles.detail} numberOfLines={1}>{city}</Text>
          </View>
        ) : null}
      </View>

      {/* Right: the numbers */}
      <View style={styles.stats}>
        {stats.map((s, i) => (
          <View key={s.label} style={[styles.stat, i > 0 && styles.statDivider]}>
            <Text style={[styles.statValue, s.small && styles.statValueSmall]} numberOfLines={1} adjustsFontSizeToFit>{s.value}</Text>
            <Text style={styles.statLabel}>{s.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Floating, rounded card
  card: {
    flexDirection: 'row',
    backgroundColor: colors.background,
    borderRadius: 24,
    paddingVertical: 22,
    paddingHorizontal: 18,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
    marginBottom: 26,
  },
  identity: { flex: 1.15, alignItems: 'center', justifyContent: 'center', paddingRight: 14 },
  imageWrapper: { position: 'relative', marginBottom: 12 },
  profilePic: { width: 96, height: 96, borderRadius: 48, backgroundColor: colors.line },
  profilePicPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  profileInitial: { fontSize: 38, fontWeight: '700', color: colors.wine },
  cameraIcon: { position: 'absolute', bottom: 0, right: 0, backgroundColor: colors.ink, padding: 6, borderRadius: 16, borderWidth: 2, borderColor: colors.background },
  name: { fontSize: 17, fontFamily: fonts.title, color: colors.ink, textAlign: 'center' },
  addName: { fontSize: 14, color: colors.wine, fontWeight: '700' },
  detail: { fontSize: 13, color: colors.inkMuted, marginTop: 3, textAlign: 'center', flexShrink: 1 },
  // No name (seen by a freelancer): the username takes the name's place
  usernameAsName: { fontSize: 17, fontFamily: fonts.title, color: colors.ink, marginTop: 0 },
  cityRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 1, maxWidth: '100%' },
  stats: { flex: 1, justifyContent: 'center' },
  stat: { paddingVertical: 10 },
  statDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  statValue: { fontSize: 22, fontWeight: '700', color: colors.ink },
  statValueSmall: { fontSize: 15 },
  statLabel: { fontSize: 12, color: colors.inkMuted, marginTop: 1 },
});
