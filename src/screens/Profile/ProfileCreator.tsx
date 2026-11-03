import type React from 'react';
import { RefreshStar, useStarRefresh } from '../../components/SparkleStars';
import { useEffect, useRef, useState } from 'react';
import { handle } from '../../utils/handle';
import { colors, fonts } from '../../theme';
import { Text } from '../../components/AppText';
import ReviewsCertificatesBox from '../../components/ReviewsCertificatesBox';   // in src/components use './AppText'
import {
  View,
  Image,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  Animated,
  PanResponder,
  useWindowDimensions,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../../services/supabase';
import { listVendorPosts, uploadVendorPost, reorderVendorPosts, deleteVendorPost, publicPostUrl, type VendorPost } from '../../services/vendorPortfolio';
import { getVendorAvatarUrl, uploadVendorAvatar } from '../../services/vendorAvatar';

// Portfolio photos are stored in Supabase Storage and indexed by vendor_posts.
type PortfolioPhoto = VendorPost & { uri: string };

const toPhoto = (post: VendorPost): PortfolioPhoto => ({
  ...post,
  uri: publicPostUrl(post.storage_path),
});

const MAX_PHOTOS = 9;
const GRID_GAP = 4;

export default function ProfileCreator({ navigation }: any) {
  // Pull down to refresh: spinning star instead of the system spinner.
  const pull = useStarRefresh();
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

        // City lives on the auth account (user_metadata.city); profiles has no city column.
        if (active) setProfile({ ...profileData, city: authData.user.user_metadata?.city ?? null });
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
        pull.doneLoading();
      }
    };

    void fetchProfile();
    return () => { active = false; };
  }, [pull.refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

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
          setPhotos(current => [toPhoto(post), ...current]); // newest first, like the saved order
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

  // ---- Hold a photo and drag it to rearrange the portfolio ----
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOrder, setDragOrder] = useState<string[] | null>(null); // live order while dragging
  const drag = useRef<{ id: string; grabX: number; grabY: number; origin: { x: number; y: number }; moved: boolean } | null>(null);
  const gridRef = useRef<React.ComponentRef<typeof View>>(null);
  const dragPos = useRef(new Animated.ValueXY()).current;
  const latest = useRef({ photos, dragOrder, tileSize });
  latest.current = { photos, dragOrder, tileSize };

  // Tiles are a fixed 3-column grid, so slot positions can be computed.
  const slotOf = (index: number) => ({
    x: (index % 3) * (tileSize + GRID_GAP),
    y: Math.floor(index / 3) * (tileSize + GRID_GAP),
  });

  const displayedPhotos = dragOrder
    ? dragOrder.map(id => photos.find(p => p.id === id)).filter((p): p is PortfolioPhoto => !!p)
    : photos;

  const startDrag = (photo: PortfolioPhoto, index: number, pageX: number, pageY: number) => {
    if (portfolioBusy || !gridRef.current) return;
    gridRef.current.measureInWindow((gx, gy) => {
      const slot = slotOf(index);
      drag.current = { id: photo.id, grabX: pageX - gx - slot.x, grabY: pageY - gy - slot.y, origin: { x: gx, y: gy }, moved: false };
      dragPos.setValue(slot);
      setDragOrder(photos.map(p => p.id));
      setDragId(photo.id);
    });
  };

  const finishDrag = async () => {
    const order = latest.current.dragOrder;
    const before = latest.current.photos.map(p => p.id);
    drag.current = null;
    setDragId(null);
    setDragOrder(null);
    if (!order || order.join() === before.join() || !profile?.id) return;
    const byId = new Map(latest.current.photos.map(p => [p.id, p]));
    const previous = latest.current.photos;
    setPhotos(order.map(id => byId.get(id)!)); // show the new order right away
    try {
      await reorderVendorPosts(profile.id, order);
    } catch (caughtError) {
      setPhotos(previous);
      Alert.alert('Could not save the new order', String(caughtError));
    }
  };
  const finishDragRef = useRef(finishDrag);
  finishDragRef.current = finishDrag;

  // The grid takes over the touch once a photo is picked up and the finger moves.
  const gridResponder = useRef(PanResponder.create({
    onMoveShouldSetPanResponderCapture: () => !!drag.current,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: () => { if (drag.current) drag.current.moved = true; },
    onPanResponderMove: (_, g) => {
      const d = drag.current;
      if (!d) return;
      const { tileSize: size, dragOrder: order } = latest.current;
      const x = g.moveX - d.origin.x;
      const y = g.moveY - d.origin.y;
      dragPos.setValue({ x: x - d.grabX, y: y - d.grabY });
      if (!order) return;
      const col = Math.min(2, Math.max(0, Math.floor(x / (size + GRID_GAP))));
      const row = Math.max(0, Math.floor(y / (size + GRID_GAP)));
      const target = Math.min(order.length - 1, row * 3 + col);
      setDragOrder(current => {
        if (!current) return current;
        const from = current.indexOf(d.id);
        if (from === target) return current;
        const next = current.filter(id => id !== d.id);
        next.splice(target, 0, d.id);
        return next;
      });
    },
    onPanResponderRelease: () => void finishDragRef.current(),
    onPanResponderTerminate: () => void finishDragRef.current(),
  })).current;

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
      <ScrollView refreshControl={<RefreshControl {...pull.control} />} style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} scrollEnabled={!dragId}>
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
          <Text style={styles.name}>{handle(displayName)}</Text>
          <Text style={styles.subtitle}>{[profile?.email, profile?.city].filter(Boolean).join(' · ')}</Text>
        </View>

        <ReviewsCertificatesBox style={{ marginVertical: 30 }} />

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
              {photos.length} of {MAX_PHOTOS} photos · hold a photo to move it
            </Text>
          </View>
          <TouchableOpacity
            onPress={handleAddPortfolioPhotos}
            disabled={portfolioBusy}
            style={[styles.addPhotosButton, portfolioBusy && { opacity: 0.5 }]}
            accessibilityLabel="Add photos to my portfolio"
          >
            <Ionicons name="camera-outline" size={18} color={colors.blue} />
            <Text style={styles.addPhotosText}>{portfolioBusy ? 'Saving…' : 'Upload'}</Text>
          </TouchableOpacity>
        </View>

        <View ref={gridRef} style={styles.grid} {...gridResponder.panHandlers}>
          {Array.from({ length: MAX_PHOTOS }, (_, index) => {
            const photo = displayedPhotos[index];
            return (
              <TouchableOpacity
                key={photo?.id ?? `placeholder-${index}`}
                onPress={photo ? () => setSelectedPhotoId(photo.id) : handleAddPortfolioPhotos}
                delayLongPress={300}
                onLongPress={photo ? e => startDrag(photo, index, e.nativeEvent.pageX, e.nativeEvent.pageY) : undefined}
                // Released without moving: put the photo down again.
                onPressOut={() => setTimeout(() => { if (drag.current && !drag.current.moved) void finishDragRef.current(); }, 0)}
                style={[styles.gridTile, { width: tileSize, height: tileSize }, photo && dragId === photo.id && styles.dragPlaceholder]}
                accessibilityLabel={photo ? `Open portfolio photo ${index + 1}` : 'Add a portfolio photo'}
              >
                {photo ? (
                  <>
                    <Image source={{ uri: photo.uri }} style={styles.tileImage} />
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
          {/* The picked-up photo follows the finger */}
          {dragId && (() => {
            const photo = photos.find(p => p.id === dragId);
            if (!photo) return null;
            return (
              <Animated.View
                pointerEvents="none"
                style={[styles.dragGhost, { width: tileSize, height: tileSize, transform: [...dragPos.getTranslateTransform(), { scale: 1.08 }] }]}
              >
                <Image source={{ uri: photo.uri }} style={styles.tileImage} />
              </Animated.View>
            );
          })()}
        </View>

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
      <RefreshStar refreshing={pull.refreshing} y={130} />
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.primarySoft },
  content: { paddingHorizontal: 20, paddingBottom: 32 },
  header: { alignItems: 'center', marginTop: 100 },
  imageWrapper: { position: 'relative', marginBottom: 15 },
  profilePic: { width: 120, height: 120, borderRadius: 60, backgroundColor: '#e0e0e0' },
  profilePicPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  profileInitial: { fontSize: 46, fontWeight: '700', color: colors.danger },
  cameraIcon: { position: 'absolute', bottom: 0, right: 5, backgroundColor: colors.text, padding: 8, borderRadius: 20, borderWidth: 3, borderColor: '#f9f9f9' },
  name: { fontSize: 22, fontFamily: fonts.title, color: colors.ink },
  subtitle: { fontSize: 14, color: '#716C83', marginTop: 5 },
  businessButton: { flexDirection: 'row', backgroundColor: colors.blue, padding: 20, borderRadius: 16, alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, shadowColor: colors.blue, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  businessButtonLeft: { flexDirection: 'row', alignItems: 'center' },
  businessButtonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  portfolioHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  portfolioTitle: { fontSize: 20, fontFamily: fonts.title, color: colors.ink },
  portfolioSubtitle: { fontSize: 12, color: '#716C83', marginTop: 4 },
  addPhotosButton: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: colors.blue, paddingHorizontal: 14, paddingVertical: 11, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 7 },
  addPhotosText: { color: colors.blue, fontWeight: '700', fontSize: 14 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP },
  gridTile: { backgroundColor: '#F0EDF2', overflow: 'hidden' },
  tileImage: { width: '100%', height: '100%' },
  tilePlaceholder: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  tilePlaceholderText: { fontSize: 11, color: '#8B8794', marginTop: 3 },
  dragPlaceholder: { opacity: 0.25 },
  dragGhost: { position: 'absolute', left: 0, top: 0, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 10, shadowOffset: { width: 0, height: 6 }, elevation: 8 },
  signOutButton: { backgroundColor: 'transparent', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 28, marginBottom: 10, borderWidth: 2, borderColor: colors.wine },
  signOutText: { color: colors.wine, fontSize: 16, fontWeight: 'bold' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: '#fff', borderRadius: 16, padding: 16 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  modalTitle: { fontSize: 17, fontFamily: fonts.title, color: colors.ink },
  modalImage: { width: '100%', height: 300, backgroundColor: '#f5f5f5', borderRadius: 10 },
  modalActions: { flexDirection: 'row', justifyContent: 'space-evenly', paddingTop: 17, paddingBottom: 5 },
  modalAction: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 7 },
  modalActionText: { fontSize: 15, fontWeight: '700', color: colors.danger },
});
