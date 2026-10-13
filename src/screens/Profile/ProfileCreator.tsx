import { useEffect, useState } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../../services/supabase';
import { listVendorPosts, uploadVendorPost, setVendorPostPinned, deleteVendorPost, publicPostUrl, type VendorPost } from '../../services/vendorPortfolio';
import { getVendorAvatarUrl, uploadVendorAvatar } from '../../services/vendorAvatar';

// Portfolio photos are stored in Supabase Storage and indexed by vendor_posts.
type PortfolioPhoto = VendorPost & { uri: string; pinned: boolean };

const toPhoto = (post: VendorPost): PortfolioPhoto => ({
  ...post,
  pinned: post.is_pinned,
  uri: publicPostUrl(post.storage_path),
});

const MAX_PHOTOS = 9;
const MAX_PINNED = 3;
const GRID_GAP = 4;

export default function ProfileCreator({ navigation }: any) {
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [profilePhotoUri, setProfilePhotoUri] = useState<string | null>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [photos, setPhotos] = useState<PortfolioPhoto[]>([]);
  const [portfolioBusy, setPortfolioBusy] = useState(false);
  const [selectedPhotoId, setSelectedPhotoId] = useState<string | null>(null);
  const { width } = useWindowDimensions();
  const tileSize = Math.floor((width - 40 - GRID_GAP * 2) / 3);

  useEffect(() => {
    let active = true;

    const fetchProfile = async () => {
      try {
        const { data: authData, error: authError } = await supabase.auth.getUser();
        if (authError) throw authError;
        if (!authData.user) throw new Error('You are not signed in.');

        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', authData.user.id)
          .single();
        if (profileError) throw profileError;

        if (active) setProfile(profileData);
        try {
          const url = await getVendorAvatarUrl(authData.user.id);
          if (active) setProfilePhotoUri(url);
        } catch (avatarError) {
          console.error('[ProfileCreator] Could not load avatar:', avatarError);
          if (active) Alert.alert('Profile picture unavailable', String(avatarError));
        }
        try {
          const posts = await listVendorPosts(authData.user.id);
          if (active) setPhotos(posts.map(toPhoto));
        } catch (portfolioError) {
          console.error('[ProfileCreator] Could not load portfolio:', portfolioError);
          if (active) Alert.alert('Portfolio unavailable', String(portfolioError));
        }
      } catch (caughtError) {
        console.error('[ProfileCreator] Could not load profile:', caughtError);
        if (active) {
          Alert.alert(
            'Could not load profile',
            caughtError instanceof Error ? caughtError.message : String(caughtError)
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    void fetchProfile();
    return () => { active = false; };
  }, []);

  const handleSignOut = async () => {
    try {
      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) throw signOutError;
    } catch (caughtError) {
      console.error('[ProfileCreator] Could not sign out:', caughtError);
      Alert.alert(
        'Could not sign out',
        caughtError instanceof Error ? caughtError.message : String(caughtError)
      );
    }
  };

  const requestPhotoAccess = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Photos permission needed', 'Allow access to your photos to select images.');
      return false;
    }
    return true;
  };

  // Uploaded to Supabase and visible on this creator's public VendorProfile.
  const handleUploadImage = async () => {
    if (avatarBusy) return;
    if (!profile?.id || profile?.role !== 'creator') {
      Alert.alert('Creator account required', 'Sign in as a creator to change your picture.');
      return;
    }
    try {
      if (!(await requestPhotoAccess())) return;
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      if (result.canceled || result.assets.length === 0) return;
      setAvatarBusy(true);
      const url = await uploadVendorAvatar(profile.id, result.assets[0]);
      setProfilePhotoUri(url); // Only update once the upload succeeds.
    } catch (caughtError) {
      console.error('[ProfileCreator] Avatar upload failed:', caughtError);
      Alert.alert('Could not upload profile picture', String(caughtError));
    } finally {
      setAvatarBusy(false);
    }
  };

  const handleAddPortfolioPhotos = async () => {
    if (portfolioBusy) return;
    const remaining = MAX_PHOTOS - photos.length;
    if (remaining <= 0) {
      Alert.alert('Portfolio full', 'Remove a photo before adding another.');
      return;
    }
    if (!profile?.id || profile?.role !== 'creator') {
      Alert.alert('Account required', 'Sign in as a creator to upload portfolio photos.');
      return;
    }
    try {
      if (!(await requestPhotoAccess())) return;
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        selectionLimit: remaining,
        orderedSelection: true,
        quality: 0.7,
      });
      if (result.canceled || result.assets.length === 0) return;
      setPortfolioBusy(true);
      const failures: string[] = [];
      for (const asset of result.assets.slice(0, remaining)) {
        try {
          const post = await uploadVendorPost(profile.id, asset);
          setPhotos(current => [...current, toPhoto(post)]);
        } catch (caughtError) {
          failures.push(caughtError instanceof Error ? caughtError.message : String(caughtError));
        }
      }
      if (failures.length) Alert.alert('Some photos could not be uploaded', failures.join('\n'));
    } catch (caughtError) {
      Alert.alert('Could not upload photos', String(caughtError));
    } finally {
      setPortfolioBusy(false);
    }
  };

  const togglePinned = async (id: string) => {
    if (portfolioBusy) return;
    const photo = photos.find(item => item.id === id);
    if (!photo) return;
    if (!photo.pinned && photos.filter(item => item.pinned).length >= MAX_PINNED) {
      Alert.alert('Three pinned photos', 'Unpin another photo to pin this one.');
      return;
    }
    try {
      setPortfolioBusy(true);
      await setVendorPostPinned(photo, !photo.pinned);
      setPhotos(current => current.map(item =>
        item.id === id ? { ...item, pinned: !item.pinned, is_pinned: !item.pinned } : item
      ));
    } catch (caughtError) {
      Alert.alert('Could not update pin', String(caughtError));
    } finally {
      setPortfolioBusy(false);
    }
  };

  const removePhoto = (id: string) => {
    if (portfolioBusy) return;
    const photo = photos.find(item => item.id === id);
    if (!photo) return;
    Alert.alert('Remove photo?', 'This will remove the photo from your public portfolio.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive',
        onPress: async () => {
          try {
            setPortfolioBusy(true);
            const warning = await deleteVendorPost(photo);
            setPhotos(current => current.filter(item => item.id !== id));
            setSelectedPhotoId(null);
            if (warning) Alert.alert('Storage cleanup warning', warning);
          } catch (caughtError) {
            Alert.alert('Could not remove photo', String(caughtError));
          } finally {
            setPortfolioBusy(false);
          }
        },
      },
    ]);
  };

  // Pinned posts appear first; other photos retain their original order.
  const displayedPhotos = [...photos.filter(item => item.pinned), ...photos.filter(item => !item.pinned)];
  const selectedPhoto = photos.find(item => item.id === selectedPhotoId) ?? null;
  const displayName = profile?.username || 'Studio Name';

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#1D3979" />
      </View>
    );
  }

  return (
    <>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={styles.imageWrapper}>
            {profilePhotoUri ? (
              <Image source={{ uri: profilePhotoUri }} style={styles.profilePic} />
            ) : (
              <View style={[styles.profilePic, styles.profilePicPlaceholder]}>
                <Text style={styles.profileInitial}>{displayName.charAt(0).toUpperCase()}</Text>
              </View>
            )}
            <TouchableOpacity
              style={styles.cameraIcon}
              onPress={handleUploadImage}
              disabled={avatarBusy}
              accessibilityLabel="Upload public profile picture"
            >
              {avatarBusy ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="camera" size={20} color="#fff" />}
            </TouchableOpacity>
          </View>
          <Text style={styles.name}>{displayName}</Text>
          <Text style={styles.subtitle}>{profile?.email}</Text>
        </View>

        <View style={styles.statsContainer}>
          <View style={styles.statBox}>
            <Text style={styles.statNumber}>0</Text>
            <Text style={styles.statLabel}>Bookings</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statNumber}>0.0 ⭐️</Text>
            <Text style={styles.statLabel}>Rating</Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.businessButton}
          onPress={() => navigation.navigate('BusinessCreator')}
        >
          <View style={styles.businessButtonLeft}>
            <Ionicons name="briefcase" size={22} color="#fff" style={{ marginRight: 10 }} />
            <Text style={styles.businessButtonText}>Manage Business</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#fff" />
        </TouchableOpacity>

        {/* Only creators use ProfileCreator; regular users use ProfileUser. */}
        <View style={styles.portfolioHeader}>
          <View>
            <Text style={styles.portfolioTitle}>My portfolio</Text>
            <Text style={styles.portfolioSubtitle}>
              {photos.length} of {MAX_PHOTOS} photos · Up to {MAX_PINNED} pinned
            </Text>
          </View>
          <TouchableOpacity
            onPress={handleAddPortfolioPhotos}
            disabled={portfolioBusy}
            style={[styles.addPhotosButton, portfolioBusy && { opacity: 0.5 }]}
            accessibilityLabel="Add photos to my portfolio"
          >
            <Ionicons name="camera-outline" size={18} color="#fff" />
            <Text style={styles.addPhotosText}>{portfolioBusy ? 'Saving…' : 'Upload'}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.grid}>
          {Array.from({ length: MAX_PHOTOS }, (_, index) => {
            const photo = displayedPhotos[index];
            return (
              <TouchableOpacity
                key={photo?.id ?? `placeholder-${index}`}
                onPress={photo ? () => setSelectedPhotoId(photo.id) : handleAddPortfolioPhotos}
                style={[styles.gridTile, { width: tileSize, height: tileSize }]}
                accessibilityLabel={photo ? `Open portfolio photo ${index + 1}` : 'Add a portfolio photo'}
              >
                {photo ? (
                  <>
                    <Image source={{ uri: photo.uri }} style={styles.tileImage} />
                    {photo.pinned && (
                      <View style={styles.pinBadge}>
                        <Ionicons name="pin" size={15} color="#fff" />
                      </View>
                    )}
                  </>
                ) : (
                  <View style={styles.tilePlaceholder}>
                    <Ionicons name="add" size={26} color="#8B8794" />
                    <Text style={styles.tilePlaceholderText}>Photo</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
        <Text style={styles.portfolioNote}>
Uploaded photos and pins are saved in Supabase and visible on your public creator profile. Your profile avatar still uses a local-only preview.
        </Text>

        <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </ScrollView>

      <Modal
        visible={selectedPhoto !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedPhotoId(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>My portfolio</Text>
              <TouchableOpacity onPress={() => setSelectedPhotoId(null)} accessibilityLabel="Close photo preview">
                <Ionicons name="close" size={24} color="#191919" />
              </TouchableOpacity>
            </View>
            {selectedPhoto && (
              <>
                <Image source={{ uri: selectedPhoto.uri }} style={styles.modalImage} resizeMode="contain" />
                <View style={styles.modalActions}>
                  <TouchableOpacity style={styles.modalAction} disabled={portfolioBusy} onPress={() => void togglePinned(selectedPhoto.id)}>
                    <Ionicons name={selectedPhoto.pinned ? 'pin' : 'pin-outline'} size={19} color="#1D3979" />
                    <Text style={styles.modalActionText}>{selectedPhoto.pinned ? 'Unpin' : 'Pin to top'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.modalAction} disabled={portfolioBusy} onPress={() => removePhoto(selectedPhoto.id)}>
                    <Ionicons name="trash-outline" size={19} color="#BF0F46" />
                    <Text style={[styles.modalActionText, { color: '#BF0F46' }]}>Remove</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9f9f9' },
  content: { paddingHorizontal: 20, paddingBottom: 32 },
  header: { alignItems: 'center', marginTop: 40 },
  imageWrapper: { position: 'relative', marginBottom: 15 },
  profilePic: { width: 120, height: 120, borderRadius: 60, backgroundColor: '#e0e0e0' },
  profilePicPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  profileInitial: { fontSize: 46, fontWeight: '700', color: '#1D3979' },
  cameraIcon: { position: 'absolute', bottom: 0, right: 5, backgroundColor: '#191919', padding: 8, borderRadius: 20, borderWidth: 3, borderColor: '#f9f9f9' },
  name: { fontSize: 24, fontWeight: '900', color: '#191919' },
  subtitle: { fontSize: 14, color: '#716C83', marginTop: 5 },
  statsContainer: { flexDirection: 'row', justifyContent: 'space-around', marginVertical: 30, paddingVertical: 20, backgroundColor: '#fff', borderRadius: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  statBox: { alignItems: 'center' },
  statNumber: { fontSize: 22, fontWeight: 'bold', color: '#1D3979' },
  statLabel: { fontSize: 13, color: '#716C83', marginTop: 5, fontWeight: 'bold' },
  businessButton: { flexDirection: 'row', backgroundColor: '#1D3979', padding: 20, borderRadius: 16, alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, shadowColor: '#1D3979', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  businessButtonLeft: { flexDirection: 'row', alignItems: 'center' },
  businessButtonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  portfolioHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  portfolioTitle: { fontSize: 20, fontWeight: '800', color: '#191919' },
  portfolioSubtitle: { fontSize: 12, color: '#716C83', marginTop: 4 },
  addPhotosButton: { backgroundColor: '#1D3979', paddingHorizontal: 14, paddingVertical: 11, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 7 },
  addPhotosText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP },
  gridTile: { backgroundColor: '#F0EDF2', overflow: 'hidden' },
  tileImage: { width: '100%', height: '100%' },
  tilePlaceholder: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  tilePlaceholderText: { fontSize: 11, color: '#8B8794', marginTop: 3 },
  pinBadge: { position: 'absolute', top: 6, right: 6, backgroundColor: 'rgba(0,0,0,0.55)', padding: 5, borderRadius: 14 },
  portfolioNote: { color: '#716C83', fontSize: 12, lineHeight: 18, marginTop: 12, marginBottom: 28 },
  signOutButton: { backgroundColor: 'transparent', padding: 16, borderRadius: 12, alignItems: 'center', marginBottom: 10, borderWidth: 2, borderColor: '#BF0F46' },
  signOutText: { color: '#BF0F46', fontSize: 16, fontWeight: 'bold' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: '#fff', borderRadius: 16, padding: 16 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  modalTitle: { fontSize: 17, fontWeight: '700', color: '#191919' },
  modalImage: { width: '100%', height: 300, backgroundColor: '#f5f5f5', borderRadius: 10 },
  modalActions: { flexDirection: 'row', justifyContent: 'space-evenly', paddingTop: 17, paddingBottom: 5 },
  modalAction: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 7 },
  modalActionText: { fontSize: 15, fontWeight: '700', color: '#1D3979' },
});
