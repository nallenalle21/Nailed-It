import { Alert, StyleSheet, TouchableOpacity, View } from 'react-native';
import { supabase } from '../../services/supabase';
import { Ionicons } from '@expo/vector-icons';
import SubPage from '../../components/SubPage';
import { Text } from '../../components/AppText';
import { colors, fonts } from '../../theme';

/**
 * Opened from the gear on the profile. Freelancers edit their profile from the profile page
 * itself; here are the account-level settings for everyone.
 */
export default function Settings({ navigation, route }: any) {
  const isCreator = route?.params?.role === 'creator';

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) Alert.alert('Could not sign out', error.message);
  };

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
    <SubPage title="Settings" fill>
      {isCreator && (
        <>
          <Text style={styles.sectionTitle}>Profile</Text>
          {link('person-circle-outline', 'Business details', 'Display name, categories, workplace and area, contact details',
            () => navigation.navigate('Onboarding', { mode: 'edit' }))}
          {link('calendar-outline', 'Booking settings', 'Manual approval, cancellation policy, deposit',
            () => navigation.navigate('EditBookingRules'))}
        </>
      )}

      {link('notifications-outline', 'Notifications', 'Choose what you’re notified about',
        () => navigation.navigate('EditNotifications', { role: isCreator ? 'creator' : 'user' }))}
      {!isCreator && link('compass-outline', 'Explore preferences', 'Always show certain services, choose where Explore opens',
        () => navigation.navigate('ExplorePreferences'))}
      {link('document-text-outline', 'Terms & conditions', '', () => navigation.navigate('Terms'))}
      {link('help-circle-outline', 'FAQ', '', () => navigation.navigate('FAQ'))}

      {/* Pushed to the bottom of the screen */}
      <View style={{ flex: 1 }} />
      <TouchableOpacity style={styles.signOutButton} onPress={() => void signOut()} accessibilityRole="button">
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>
    </SubPage>
  );
}

const styles = StyleSheet.create({
  linkRow: { flexDirection: 'row', alignItems: 'center' },
  sectionTitle: { fontSize: 15, fontFamily: fonts.title, color: colors.ink, marginTop: 8, marginBottom: 10 },
  card: { backgroundColor: colors.background, padding: 20, borderRadius: 16, marginBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  cardTitle: { fontSize: 15, color: colors.ink, fontFamily: fonts.title, flexShrink: 1 },
  // Small, clean off-black pill
  signOutButton: { alignSelf: 'center', backgroundColor: colors.grey, paddingVertical: 10, paddingHorizontal: 28, borderRadius: 20, marginTop: 12 },
  signOutText: { color: colors.background, fontSize: 14, fontWeight: '700' },
  cardSubtitle: { fontSize: 13, color: colors.inkMuted, lineHeight: 19, marginTop: 2 },
});
