import { useCallback, useState } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RefreshStar, useStarRefresh } from '../../components/SparkleStars';
import PageHeader from '../../components/PageHeader';
import { colors } from '../../theme';
import { Text } from '../../components/AppText';
import { StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { getVendorAvatarUrl, uploadVendorAvatar } from '../../services/vendorAvatar';
import { fetchMyAppointments } from '../../services/booking';
import { getWishlistBoards } from '../../services/wishlist';
import { getMyAccount, type MyAccount } from '../../services/account';
import CustomerProfileCard from '../../components/CustomerProfileCard';

/**
 * Customer's own profile, Airbnb-style: one card with the photo, name, @username and
 * location on the left and the numbers (bookings, collections, member since) on the right.
 */
export default function ProfileUser() {
  const navigation = useNavigation<any>();
  const [account, setAccount] = useState<MyAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [bookings, setBookings] = useState<number | null>(null);
  const [collections, setCollections] = useState<number | null>(null);

  const fetchProfile = async () => {
    try {
      const me = await getMyAccount();
      if (!me) return;
      setAccount(me);
      // Profile picture uses the same avatar storage as creators.
      getVendorAvatarUrl(me.id).then(setPhotoUri).catch(() => setPhotoUri(null));
      fetchMyAppointments('customer').then(rows => setBookings(rows.length)).catch(() => setBookings(null));
      getWishlistBoards().then(boards => setCollections(boards.length)).catch(() => setCollections(null));
    } catch (e) {
      console.warn('[Profile] Could not load profile:', e);
    } finally {
      setLoading(false);
    }
  };

  // Pull down to refresh: spinning star instead of the system spinner.
  const pull = useStarRefresh(() => fetchProfile());

  // Reload when the tab is opened (new bookings/collections, a changed name or username).
  useFocusEffect(useCallback(() => { void fetchProfile(); }, []));

  const handleUploadImage = async () => {
    if (avatarBusy || !account?.id) return;
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Photos permission needed', 'Allow access to your photos to select an image.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8,
      });
      if (result.canceled || result.assets.length === 0) return;
      setAvatarBusy(true);
      setPhotoUri(await uploadVendorAvatar(account.id, result.assets[0]));
    } catch (caughtError) {
      Alert.alert('Could not upload profile picture', String(caughtError));
    } finally {
      setAvatarBusy(false);
    }
  };

  const openAccount = () => navigation.navigate('AccountSettings');

  const header = (
    <PageHeader
      title="My profile"
      right={
        <TouchableOpacity style={styles.settingsBtn} onPress={() => navigation.navigate('Settings')} hitSlop={10} accessibilityLabel="Settings">
          <Ionicons name="settings-outline" size={24} color={colors.ink} />
        </TouchableOpacity>
      }
    />
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        {header}
        <ActivityIndicator size="large" color={colors.wine} style={{ marginTop: 60 }} />
      </SafeAreaView>
    );
  }


  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {header}
      <ScrollView
        refreshControl={<RefreshControl {...pull.control} />}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <CustomerProfileCard
          name={account?.name ?? null}
          username={account?.username || 'anonym'}
          city={account?.city ?? null}
          memberSince={account?.memberSince ?? null}
          bookings={bookings}
          collections={collections}
          photoUri={photoUri}
          onChangePhoto={handleUploadImage}
          photoBusy={avatarBusy}
          onAddName={openAccount}
        />

        <TouchableOpacity style={styles.row} onPress={openAccount} accessibilityRole="button">
          <Ionicons name="person-outline" size={21} color={colors.ink} />
          <Text style={styles.rowText}>Account settings</Text>
          <Ionicons name="chevron-forward" size={19} color={colors.inkMuted} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.row} onPress={() => navigation.navigate('HowItWorks')} accessibilityRole="button">
          <Ionicons name="sparkles-outline" size={21} color={colors.ink} />
          <Text style={styles.rowText}>How it works</Text>
          <Ionicons name="chevron-forward" size={19} color={colors.inkMuted} />
        </TouchableOpacity>
      </ScrollView>
      <RefreshStar refreshing={pull.refreshing} y={130} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: 20, paddingBottom: 32 },
  settingsBtn: { padding: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  rowText: { flex: 1, fontSize: 16, color: colors.ink },
});
