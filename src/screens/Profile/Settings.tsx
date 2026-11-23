import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import StarredTitle from '../../components/StarredTitle';
import { Text } from '../../components/AppText';
import { colors, fonts } from '../../theme';

/**
 * Opened from the gear on the profile. Freelancers edit their profile from the profile page
 * itself; here are the account-level settings for everyone.
 */
export default function Settings({ navigation, route }: any) {
  const isCreator = route?.params?.role === 'creator';

  const link = (icon: keyof typeof Ionicons.glyphMap, title: string, subtitle: string, onPress: () => void) => (
    <TouchableOpacity style={[styles.card, styles.linkRow]} onPress={onPress} accessibilityRole="button">
      <Ionicons name={icon} size={22} color={colors.blue} style={{ marginRight: 10 }} />
      <View style={{ flex: 1 }}>
        <Text style={styles.cardTitle}>{title}</Text>
        {subtitle ? <Text style={styles.cardSubtitle}>{subtitle}</Text> : null}
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.ink} />
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} accessibilityLabel="Back">
          <Ionicons name="arrow-back" size={24} color={colors.ink} />
        </TouchableOpacity>
        <StarredTitle style={styles.headerTitle}>Settings</StarredTitle>
        <View style={{ width: 34 }} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentInner} showsVerticalScrollIndicator={false}>
        {isCreator && (
          <>
            <Text style={styles.sectionTitle}>Profile</Text>
            {link('person-circle-outline', 'Business details', 'Display name, categories, workplace and area, contact details',
              () => navigation.navigate('Onboarding', { mode: 'edit' }))}
            {link('calendar-outline', 'Booking settings', 'Manual approval, cancellation policy, deposit',
              () => navigation.navigate('EditBookingRules'))}
          </>
        )}

        <Text style={styles.sectionTitle}>Account</Text>
        {link('notifications-outline', 'Notifications', 'Choose what you’re notified about',
          () => navigation.navigate('EditNotifications', { role: isCreator ? 'creator' : 'user' }))}

        {/* Pushed to the bottom of the screen */}
        <View style={{ flex: 1 }} />
        {link('help-circle-outline', 'FAQ', '', () => navigation.navigate('FAQ'))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 60, marginBottom: 10, paddingHorizontal: 20 },
  backBtn: { padding: 5 },
  headerTitle: { fontSize: 22, color: colors.ink, fontFamily: fonts.title },
  content: { paddingHorizontal: 20 },
  contentInner: { flexGrow: 1, paddingBottom: 24 }, // lets the FAQ row sit at the bottom
  linkRow: { flexDirection: 'row', alignItems: 'center' },
  sectionTitle: { fontSize: 15, fontFamily: fonts.title, color: colors.ink, marginTop: 16, marginBottom: 10 },
  card: { backgroundColor: colors.background, padding: 20, borderRadius: 16, marginBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  cardTitle: { fontSize: 15, color: colors.ink, fontFamily: fonts.title, flexShrink: 1 },
  cardSubtitle: { fontSize: 13, color: colors.inkMuted, lineHeight: 19, marginTop: 2 },
});
