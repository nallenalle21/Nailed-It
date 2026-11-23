import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from './AppText';
import { colors, fonts } from '../theme';

type Row = { icon: keyof typeof Ionicons.glyphMap; title: string; hint: string; go: () => void };

/**
 * "Edit profile" on the freelancer's own profile page: everything they can change, grouped
 * like Profile / Services and prices / Location / Booking settings / Account. Each row opens
 * its own screen (the setup steps open at just that step).
 */
export default function EditProfileSections({ navigation }: { navigation: any }) {
  const step = (n: number) => () => navigation.navigate('Onboarding', { mode: 'edit', step: n });
  const go = (screen: string, params?: object) => () => navigation.navigate(screen, params);

  const groups: { title: string; rows: Row[] }[] = [
    {
      title: 'Profile',
      rows: [
        { icon: 'person-outline', title: 'Display name', hint: 'Your photo is changed with the camera button above', go: step(1) },
        { icon: 'chatbubble-ellipses-outline', title: 'Short bio and languages', hint: 'A few lines about you, languages you speak', go: go('EditAbout') },
        { icon: 'color-palette-outline', title: 'Categories', hint: 'Nails, lashes, brows', go: step(2) },
        { icon: 'images-outline', title: 'Portfolio', hint: 'Below: tap a photo to tag it, hold to move it', go: () => {} },
        { icon: 'ribbon-outline', title: 'Certificates and education', hint: 'Upload diplomas and courses', go: go('Certificates') },
        { icon: 'pause-circle-outline', title: 'Pause profile / vacation', hint: 'Take a break from new bookings', go: go('EditPause') },
      ],
    },
    {
      title: 'Services and prices',
      rows: [
        { icon: 'pricetags-outline', title: 'Services', hint: 'Price, duration and discounts', go: go('ServicesAndPrices') },
        { icon: 'gift-outline', title: 'Offers', hint: 'Combined treatments, discount for returning clients', go: go('EditOffers') },
      ],
    },
    {
      title: 'Location',
      rows: [
        { icon: 'location-outline', title: 'Workplace and area', hint: 'Home studio, salon chair or mobile; your address', go: step(3) },
        { icon: 'accessibility-outline', title: 'Accessibility', hint: 'Stairs, elevator, parking …', go: go('EditAccessibility') },
      ],
    },
    {
      title: 'Booking settings',
      rows: [
        { icon: 'time-outline', title: 'Weekly hours', hint: 'Regular hours, added to your calendar', go: go('EditSchedule') },
        { icon: 'calendar-outline', title: 'Availability', hint: 'Open or close single days in the Calendar', go: () => navigation.navigate('CreatorTabs', { screen: 'Calendar' }) },
        { icon: 'shield-checkmark-outline', title: 'Approval, cancellation and deposit', hint: 'How bookings work with you', go: go('EditBookingRules') },
      ],
    },
    {
      title: 'Account',
      rows: [
        { icon: 'call-outline', title: 'Contact details', hint: 'Phone and email (private)', go: step(4) },
        { icon: 'notifications-outline', title: 'Notifications', hint: 'What you’re notified about', go: go('EditNotifications', { role: 'creator' }) },
      ],
    },
  ];

  return (
    <View style={styles.wrap}>
      <Text style={styles.heading}>Edit profile</Text>
      {groups.map((g) => (
        <View key={g.title} style={styles.group}>
          <Text style={styles.groupTitle}>{g.title}</Text>
          <View style={styles.card}>
            {g.rows.map((r, i) => (
              <TouchableOpacity
                key={r.title}
                style={[styles.row, i === g.rows.length - 1 && styles.rowLast]}
                onPress={r.go}
                accessibilityRole="button"
              >
                <View style={styles.icon}>
                  <Ionicons name={r.icon} size={19} color={colors.blue} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{r.title}</Text>
                  <Text style={styles.rowHint} numberOfLines={1}>{r.hint}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.inkMuted} />
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 28 },
  heading: { fontSize: 18, fontFamily: fonts.title, color: colors.ink },
  group: { marginTop: 14 },
  groupTitle: { fontSize: 12, fontWeight: '700', color: colors.inkMuted, textTransform: 'uppercase', marginBottom: 6, marginLeft: 4 },
  card: { backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  rowLast: { borderBottomWidth: 0 },
  icon: { width: 34, height: 34, borderRadius: 10, backgroundColor: colors.blueTint, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 15, color: colors.ink, fontWeight: '600' },
  rowHint: { fontSize: 12, color: colors.inkMuted, marginTop: 1 },
});
