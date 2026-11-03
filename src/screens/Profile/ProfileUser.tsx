import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { RefreshStar, useStarRefresh } from '../../components/SparkleStars';
import { StatsBox } from '../../components/ReviewsCertificatesBox';
import { handle } from '../../utils/handle';
import { colors, fonts } from '../../theme';
import { Text } from '../../components/AppText';   // in src/components use './AppText'
import { View, Image, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../../services/supabase';
import { getVendorAvatarUrl, uploadVendorAvatar } from '../../services/vendorAvatar';
import { fetchMyAppointments } from '../../services/booking';
import { getWishlistBoards } from '../../services/wishlist';

/** Customer's own profile: same look as the creator profile (avatar, HORIZON name, stats box). */
export default function ProfileUser() {
  // Pull down to refresh: spinning star instead of the system spinner.
  const pull = useStarRefresh(() => fetchProfile());
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [bookings, setBookings] = useState<number | null>(null);
  const [collections, setCollections] = useState<number | null>(null);

  const fetchProfile = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      setProfile({ ...data, city: user.user_metadata?.city ?? null });
      // Profile picture uses the same avatar storage as creators.
      getVendorAvatarUrl(user.id).then(setPhotoUri).catch(() => setPhotoUri(null));
      fetchMyAppointments('customer').then(rows => setBookings(rows.length)).catch(() => setBookings(null));
      getWishlistBoards().then(boards => setCollections(boards.length)).catch(() => setCollections(null));
    } finally {
      setLoading(false);
    }
  };

  // Reload when the tab is opened, so new bookings/collections are counted.
  useFocusEffect(useCallback(() => { void fetchProfile(); }, []));

  const handleUploadImage = async () => {
    if (avatarBusy || !profile?.id) return;
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
      setPhotoUri(await uploadVendorAvatar(profile.id, result.assets[0]));
    } catch (caughtError) {
      Alert.alert('Could not upload profile picture', String(caughtError));
    } finally {
      setAvatarBusy(false);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={colors.wine} />
      </View>
    );
  }

  const displayName = profile?.username || 'Anonym';

  return (
    <>
      <ScrollView
        refreshControl={<RefreshControl {...pull.control} />}
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={styles.imageWrapper}>
            {photoUri ? (
              <Image source={{ uri: photoUri }} style={styles.profilePic} />
            ) : (
              <View style={[styles.profilePic, styles.profilePicPlaceholder]}>
                <Text style={styles.profileInitial}>{displayName.charAt(0).toUpperCase()}</Text>
              </View>
            )}
            <TouchableOpacity
              style={styles.cameraIcon}
              onPress={handleUploadImage}
              disabled={avatarBusy}
              accessibilityLabel="Change profile picture"
            >
              {avatarBusy
                ? <ActivityIndicator color={colors.background} size="small" />
                : <Ionicons name="camera" size={20} color={colors.background} />}
            </TouchableOpacity>
          </View>
          <Text style={styles.name}>{handle(displayName)}</Text>
          <Text style={styles.subtitle}>{[profile?.email, profile?.city].filter(Boolean).join(' · ')}</Text>
        </View>

        <StatsBox
          style={{ marginVertical: 30 }}
          items={[
            { icon: 'calendar-outline', title: 'Bookings', value: bookings === null ? '–' : String(bookings) },
            { icon: 'heart-outline', title: 'Collections', value: collections === null ? '–' : String(collections) },
          ]}
        />

        <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </ScrollView>
      <RefreshStar refreshing={pull.refreshing} y={130} />
    </>
  );
}

// Matches ProfileCreator's header, avatar and sign-out styles.
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: 20, paddingBottom: 32 },
  header: { alignItems: 'center', marginTop: 100 },
  imageWrapper: { position: 'relative', marginBottom: 15 },
  profilePic: { width: 120, height: 120, borderRadius: 60, backgroundColor: colors.line },
  profilePicPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  profileInitial: { fontSize: 46, fontWeight: '700', color: colors.wine },
  cameraIcon: { position: 'absolute', bottom: 0, right: 5, backgroundColor: colors.ink, padding: 8, borderRadius: 20, borderWidth: 3, borderColor: colors.background },
  name: { fontSize: 22, fontFamily: fonts.title, color: colors.ink },
  subtitle: { fontSize: 14, color: colors.inkMuted, marginTop: 5 },
  signOutButton: { backgroundColor: 'transparent', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 28, marginBottom: 10, borderWidth: 2, borderColor: colors.wine },
  signOutText: { color: colors.wine, fontSize: 16, fontWeight: 'bold' },
});
