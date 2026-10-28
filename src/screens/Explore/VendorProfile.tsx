/**
 * Public customer view of a creator, opened with route.params.vendorId.
 * Real data: public username, services, submitted certificates.
 * Favorites are saved in Supabase; reviews are still a prototype. Booking uses BookingModal.
 * IMPORTANT: The current certificates table has no verification status.
 * Never label submitted certificates as verified until backend approval exists.
 */
import { Text } from '../../components/AppText';   // in src/components use './AppText'
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../services/supabase';
import { useFocusEffect } from '@react-navigation/native';
import { publicPostUrl, type VendorPost } from '../../services/vendorPortfolio';
import { getVendorAvatarUrl } from '../../services/vendorAvatar';
import SaveToBoardModal from '../../components/SaveToBoardModal';
import BookingModal from '../../components/BookingModal';
import { getMembership, getSavedTargetIds } from '../../services/wishlist';

type Vendor = { id: string; username: string | null; role: string };
type Service = {
  id: string;
  name: string;
  category: string;
  duration_minutes: number;
  price: number | string;
  discount_price: number | string | null;
};
type Certificate = {
  id: string;
  title: string;
  date: string | null;
  image_url: string | null;
};

type PostPreview = { id: string; caption: string; color: string; pinned: boolean; uri?: string };
const PREVIEW_POSTS: PostPreview[] = [
  { id: 'placeholder-1', caption: 'Featured work 01', color: '#E9C5CA', pinned: true },
  { id: 'placeholder-2', caption: 'Featured work 02', color: '#E0C8DB', pinned: true },
  { id: 'placeholder-3', caption: 'Featured work 03', color: '#D8C9C7', pinned: true },
  { id: 'placeholder-4', caption: 'Portfolio preview 04', color: '#ECD8CB', pinned: false },
  { id: 'placeholder-5', caption: 'Portfolio preview 05', color: '#CEC3D4', pinned: false },
  { id: 'placeholder-6', caption: 'Portfolio preview 06', color: '#E6CCD4', pinned: false },
  { id: 'placeholder-7', caption: 'Portfolio preview 07', color: '#CFD3CE', pinned: false },
  { id: 'placeholder-8', caption: 'Portfolio preview 08', color: '#E5D6DB', pinned: false },
  { id: 'placeholder-9', caption: 'Portfolio preview 09', color: '#DEC3B8', pinned: false },
];

const theme = {
  background: '#FCFAFB',
  white: '#FFFFFF',
  ink: '#271D2B',
  muted: '#786B7A',
  accent: '#853A57',
  accentSoft: '#F6EDF1',
  border: '#E9DFE6',
};

function money(amount: number | string): string {
  const value = Number(amount);
  return Number.isFinite(value) ? `${value.toLocaleString('sv-SE')} kr` : 'Price unavailable';
}

export default function VendorProfile({ navigation, route }: any) {
  const vendorId: string | undefined = route?.params?.vendorId;
  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);
  const [services, setServices] = useState<Service[]>([]);
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [posts, setPosts] = useState<VendorPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<string[]>([]);
  const [isSaved, setIsSaved] = useState(false);
  const [saveProfileOpen, setSaveProfileOpen] = useState(false);
  const [savePostId, setSavePostId] = useState<string | null>(null);
  const [savedPostIds, setSavedPostIds] = useState<Set<string>>(new Set());
  const [expandedPost, setExpandedPost] = useState<PostPreview | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [bookingOpen, setBookingOpen] = useState(false);

  // Refetch whenever this screen gains focus, including after a creator uploads a photo.
  useFocusEffect(useCallback(() => {
    let current = true;
    setVendor(null);
    setAvatarUrl(null);
    setAvatarLoadFailed(false);
    setServices([]);
    setCertificates([]);
    setPosts([]);
    setErrors([]);
    setLoading(true);
    setIsSaved(false);

    if (!vendorId) {
      setErrors(['No vendor was selected.']);
      setLoading(false);
      return () => { current = false; };
    }

    const load = async () => {
      try {
        const [profileResult, servicesResult, certificatesResult, postsResult, avatarResult] = await Promise.all([
          supabase.from('profiles')
            .select('id, username, role')
            .eq('id', vendorId)
            .eq('role', 'creator')
            .maybeSingle(),
          supabase.from('services')
            .select('id, name, category, duration_minutes, price, discount_price')
            .eq('user_id', vendorId)
            .order('name', { ascending: true }),
          supabase.from('certificates')
            .select('id, title, date, image_url')
            .eq('user_id', vendorId)
            .order('created_at', { ascending: false }),
          supabase.from('vendor_posts')
            .select('id, vendor_id, storage_path, caption, is_pinned, created_at')
            .eq('vendor_id', vendorId)
            .order('is_pinned', { ascending: false })
            .order('created_at', { ascending: false })
            .limit(9),
          getVendorAvatarUrl(vendorId)
            .then(url => ({ url, error: null as string | null }))
            .catch(caughtError => ({ url: null, error: String(caughtError) })),
        ]);
        if (!current) return;
        const failures: string[] = [];
        if (profileResult.error) failures.push(`Profile: ${profileResult.error.message}`);
        if (servicesResult.error) failures.push(`Services: ${servicesResult.error.message}`);
        if (certificatesResult.error) failures.push(`Certificates: ${certificatesResult.error.message}`);
        if (postsResult.error) failures.push(`Portfolio: ${postsResult.error.message}`);
        if (avatarResult.error) failures.push(`Avatar: ${avatarResult.error}`);
        setAvatarUrl(avatarResult.url);
        setVendor((profileResult.data as Vendor | null) ?? null);
        setServices((servicesResult.data ?? []) as Service[]);
        setCertificates((certificatesResult.data ?? []) as Certificate[]);
        setPosts((postsResult.data ?? []) as VendorPost[]);
        setErrors(failures);
      } catch (caughtError) {
        if (current) setErrors([`Could not load creator: ${String(caughtError)}`]);
      } finally {
        if (current) setLoading(false);
      }
    };
    void load();
    return () => { current = false; };
  }, [vendorId, refreshKey]));

  const refreshSavedProfile = useCallback(async () => {
    if (!vendorId) return;
    try {
      const boards = await getMembership('vendor', vendorId);
      setIsSaved(boards.size > 0);
    } catch (error) { console.warn('[VendorProfile] Could not load saved status:', error); }
  }, [vendorId]);

  const refreshSavedPhotos = useCallback(async () => {
    try { setSavedPostIds(await getSavedTargetIds('post')); }
    catch (error) { console.warn('[VendorProfile] Could not load saved images:', error); }
  }, []);

  useFocusEffect(useCallback(() => {
    void refreshSavedProfile();
    void refreshSavedPhotos();
    return () => {};
  }, [refreshSavedProfile, refreshSavedPhotos]));

  const publicTiles: PostPreview[] = [
    ...posts.map(post => ({
      id: post.id,
      caption: post.caption || 'Portfolio photo',
      color: theme.accentSoft,
      pinned: post.is_pinned,
      uri: publicPostUrl(post.storage_path),
    })),
    ...PREVIEW_POSTS.slice(0, Math.max(0, 9 - posts.length)).map(placeholder => ({
      ...placeholder,
      // Only show example pins when the creator has not uploaded any real photos.
      pinned: posts.length === 0 && placeholder.pinned,
    })),
  ];

  const displayName = vendor?.username?.trim() || 'Unnamed creator';
  const initial = displayName.slice(0, 1).toUpperCase();

  const handleContactVendor = async () => {
    if (!vendorId) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      Alert.alert('Inte inloggad', 'Du måste vara inloggad för att skicka meddelanden.');
      return;
    }

    // Skapa ett unikt chattrums-ID
    const chatId = [user.id, vendorId].sort().join('_');

    // Navigera till chattrummet och skicka med kreatörens namn
    navigation.navigate('ChatRoom', {
      chatId: chatId,
      customerName: displayName,
      role: 'user'
    });
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.toolbar}>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={() => navigation.goBack()}
          style={styles.toolbarButton}
        >
          <Ionicons name="arrow-back" size={23} color={theme.ink} />
        </TouchableOpacity>
        <Text style={styles.toolbarTitle}>Creator profile</Text>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Refresh profile"
          onPress={() => setRefreshKey(n => n + 1)}
          style={styles.toolbarButton}
        >
          <Ionicons name="refresh-outline" size={21} color={theme.ink} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.accent} />
          <Text style={styles.loadingText}>Loading creator profile…</Text>
        </View>
      ) : !vendor ? (
        <View style={styles.center}>
          <Ionicons name="alert-circle-outline" size={32} color={theme.accent} />
          <Text style={styles.emptyTitle}>Creator not found</Text>
          <Text style={styles.emptyText}>
            This vendor isn't available, or your account can't read public creator profiles.
          </Text>
          {errors.map(message => <Text style={styles.errorText} key={message}>{message}</Text>)}
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          <View style={styles.hero}>
            <View style={styles.profileAvatar}>
              {avatarUrl && !avatarLoadFailed ? (
                <Image
                  source={{ uri: avatarUrl }}
                  style={styles.avatarPhoto}
                  resizeMode="cover"
                  onError={(event) => {
                    console.warn('[VendorProfile] Avatar image failed to load:', event.nativeEvent.error);
                    setAvatarLoadFailed(true);
                  }}
                />
              ) : (
                <Text style={styles.profileInitial}>{initial}</Text>
              )}
            </View>
            <Text style={styles.name}>{displayName}</Text>
            <Text style={styles.creatorLabel}>Creative professional · Nailed-It</Text>

            {/* KNAPP-BEHÅLLAREN */}
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 18, justifyContent: 'center', flexWrap: 'wrap' }}>

              {/* SPARA-KNAPPEN */}
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={isSaved ? 'Manage saved profile boards' : 'Save creator to a board'}
                style={styles.favoriteButton}
                onPress={() => setSaveProfileOpen(true)}
              >
                <Ionicons name={isSaved ? 'heart' : 'heart-outline'} size={18} color={theme.accent} />
                <Text style={styles.favoriteText}>{isSaved ? 'Saved' : 'Save creator'}</Text>
              </TouchableOpacity>

              {/* CHATT-KNAPPEN */}
              <TouchableOpacity
                accessibilityRole="button"
                style={styles.chatButton}
                onPress={handleContactVendor}
              >
                <Ionicons name="chatbubble-outline" size={18} color={theme.white} />
                <Text style={styles.chatButtonText}>Message</Text>
              </TouchableOpacity>

            </View>

            <Text style={styles.prototypeNote}>Save this creator to your named wishlist boards.</Text>
          </View>

          {errors.length > 0 && (
            <View style={styles.warning}>
              <Ionicons name="alert-circle-outline" size={18} color="#9C4254" />
              <View style={{ flex: 1 }}>
                <Text style={styles.warningHeading}>Some details could not be loaded</Text>
                {errors.map(message => <Text style={styles.warningText} key={message}>{message}</Text>)}
              </View>
            </View>
          )}

          <View style={styles.statsBox}>
            <View style={styles.stat}>
              <Ionicons name="star-outline" size={20} color={theme.accent} />
              <Text style={styles.statTitle}>Reviews</Text>
              <Text style={styles.statSub}>Coming soon</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.stat}>
              <Ionicons name="ribbon-outline" size={20} color={theme.accent} />
              <Text style={styles.statTitle}>Certificates</Text>
              <Text style={styles.statSub}>{certificates.length} submitted</Text>
            </View>
          </View>

          <Text style={styles.sectionHeading}>Certifications & courses</Text>
          <Text style={styles.sectionIntro}>
            Vendor-submitted documents. Nailed-It's verification process is not connected yet;
            these should not be treated as verified credentials.
          </Text>
          {certificates.length === 0 ? (
            <Text style={styles.emptySmall}>No certificates submitted for this creator yet.</Text>
          ) : (
            certificates.map(cert => (
              <View key={cert.id} style={styles.certificateRow}>
                <View style={styles.certificateIcon}>
                  <Ionicons name="ribbon-outline" size={22} color={theme.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.certificateName}>{cert.title}</Text>
                  <Text style={styles.certificateSub}>Submitted · Unverified</Text>
                </View>
                <Ionicons name="document-text-outline" size={19} color={theme.muted} />
              </View>
            ))
          )}

          <View style={styles.bookingPanel}>
            <View style={styles.bookingHeadingRow}>
              <Ionicons name="calendar-outline" size={24} color={theme.accent} />
              <Text style={styles.bookingTitle}>Book an appointment</Text>
            </View>
            <Text style={styles.bookingText}>
              Choose a date, start time and the services you want. The total time and price are
              checked before you confirm.
            </Text>
            <TouchableOpacity accessibilityRole="button" onPress={() => setBookingOpen(true)} style={styles.bookButton}>
              <Text style={styles.bookButtonText}>Book</Text>
              <Ionicons name="arrow-forward" size={18} color={theme.white} />
            </TouchableOpacity>
          </View>

          <Text style={styles.sectionHeading}>Services</Text>
          {services.length === 0 ? (
            <Text style={styles.emptySmall}>No services are linked to this creator yet.</Text>
          ) : (
            services.map(service => {
              const discounted = service.discount_price !== null;
              return (
                <View key={service.id} style={styles.serviceRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.serviceName}>{service.name}</Text>
                    <Text style={styles.serviceMeta}>{service.category} · {service.duration_minutes} min</Text>
                  </View>
                  <View style={styles.servicePrices}>
                    {discounted && <Text style={styles.oldPrice}>{money(service.price)}</Text>}
                    <Text style={styles.servicePrice}>
                      {money(discounted ? service.discount_price! : service.price)}
                    </Text>
                  </View>
                </View>
              );
            })
          )}

          <View style={styles.portfolioHeading}>
            <View style={{ flex: 1 }}>
              <Text style={styles.sectionHeading}>Portfolio</Text>
              <Text style={styles.sectionIntro}>Three-column feed · Tap to expand · Hold a photo to save</Text>
            </View>
            <Ionicons name="grid-outline" size={20} color={theme.muted} />
          </View>
          <View style={styles.portfolioGrid}>
            {publicTiles.map(post => (
              <TouchableOpacity
                key={post.id}
                accessibilityRole="button"
                accessibilityLabel={`Open ${post.uri ? "portfolio photo" : "placeholder"}: ${post.caption}`}
                onPress={() => setExpandedPost(post)}
                onLongPress={() => { if (post.uri) setSavePostId(post.id); }}
                style={[styles.portfolioTile, { backgroundColor: post.color }]}
              >
                {post.uri ? (
                  <Image source={{ uri: post.uri }} style={styles.portfolioImage} resizeMode="cover" />
                ) : (
                  <Ionicons name="image-outline" size={32} color="#775666" />
                )}
                {post.pinned && (
                  <View style={styles.pinIcon}>
                    <Ionicons name="pin" size={13} color={theme.white} />
                  </View>
                )}
                {post.uri && (
                  <TouchableOpacity
                    style={styles.postSaveButton}
                    accessibilityLabel="Save this portfolio photo to a board"
                    onPress={() => setSavePostId(post.id)}
                  >
                    <Ionicons name={savedPostIds.has(post.id) ? 'heart' : 'heart-outline'} size={17} color={theme.accent} />
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.portfolioNote}>
            Uploaded artwork is shown first, with pinned photos at the top.
            Empty positions are placeholders; hold an uploaded photo to save it.
          </Text>
        </ScrollView>
      )}

      <Modal
        visible={expandedPost !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setExpandedPost(null)}
      >
        <View style={styles.modalShade}>
          <View style={styles.modalCard}>
            <View style={styles.modalTop}>
              <Text style={styles.modalTitle}>Portfolio preview</Text>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Close image preview"
                onPress={() => setExpandedPost(null)}
              >
                <Ionicons name="close" size={25} color={theme.ink} />
              </TouchableOpacity>
            </View>
            <View style={[styles.modalImage, { backgroundColor: expandedPost?.color ?? theme.accentSoft }]}>
              {expandedPost?.uri ? (
                <Image source={{ uri: expandedPost.uri }} style={styles.modalPhoto} resizeMode="contain" />
              ) : (
                <Ionicons name="image-outline" size={68} color="#775666" />
              )}
            </View>
            <Text style={styles.modalCaption}>{expandedPost?.caption}</Text>
            <Text style={styles.modalHint}>{expandedPost?.uri ? 'Creator portfolio photo' : 'Placeholder only — no photo uploaded yet.'}</Text>
          </View>
        </View>
      </Modal>
      <BookingModal
        visible={bookingOpen && !!vendorId}
        creator={vendorId ? { id: vendorId, name: displayName } : null}
        onClose={() => setBookingOpen(false)}
        onBooked={() => {
          setBookingOpen(false);
          Alert.alert('Appointment booked', 'You can find it in your Calendar.');
        }}
      />
      <SaveToBoardModal
        visible={saveProfileOpen}
        kind="vendor"
        targetId={vendorId ?? null}
        onClose={() => setSaveProfileOpen(false)}
        onChanged={() => void refreshSavedProfile()}
      />
      <SaveToBoardModal
        visible={savePostId !== null}
        kind="post"
        targetId={savePostId}
        onClose={() => setSavePostId(null)}
        onChanged={() => void refreshSavedPhotos()}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  toolbar: { height: 56, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border },
  toolbarTitle: { color: theme.ink, fontSize: 16, fontWeight: '700' },
  toolbarButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  center: { flex: 1, padding: 28, alignItems: 'center', justifyContent: 'center' },
  loadingText: { color: theme.muted, marginTop: 12 },
  body: { paddingBottom: 50 },
  hero: { paddingTop: 34, paddingHorizontal: 24, alignItems: 'center', paddingBottom: 28 },
  profileAvatar: { width: 94, height: 94, borderRadius: 47, backgroundColor: '#E5CCD6', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  avatarPhoto: { width: '100%', height: '100%', borderRadius: 47 },
  profileInitial: { fontWeight: '700', fontSize: 41, color: theme.accent },
  name: { color: theme.ink, fontWeight: '800', fontSize: 28 },
  creatorLabel: { fontSize: 13, color: theme.muted, marginTop: 7 },
  favoriteButton: { flexDirection: 'row', gap: 7, alignItems: 'center', borderWidth: 1, borderColor: '#DEC2CE', borderRadius: 22, paddingHorizontal: 16, paddingVertical: 10 },
  favoriteText: { color: theme.accent, fontWeight: '700', fontSize: 13 },
  chatButton: { flexDirection: 'row', gap: 7, alignItems: 'center', backgroundColor: theme.accent, borderRadius: 22, paddingHorizontal: 16, paddingVertical: 10 },
  chatButtonText: { color: theme.white, fontWeight: '700', fontSize: 13 },
  prototypeNote: { fontSize: 11, color: theme.muted, marginTop: 9 },
  warning: { marginHorizontal: 20, backgroundColor: '#FFF0F2', borderRadius: 12, flexDirection: 'row', gap: 10, padding: 13, marginBottom: 20 },
  warningHeading: { color: '#903749', fontSize: 13, fontWeight: '700' },
  warningText: { color: '#903749', fontSize: 12, lineHeight: 19, marginTop: 3 },
  statsBox: { marginHorizontal: 20, backgroundColor: theme.white, borderRadius: 17, borderWidth: 1, borderColor: theme.border, flexDirection: 'row', paddingVertical: 18, marginBottom: 28 },
  stat: { flex: 1, alignItems: 'center', gap: 5 },
  statTitle: { fontWeight: '700', color: theme.ink, fontSize: 15 },
  statSub: { color: theme.muted, fontSize: 12 },
  statDivider: { width: 1, backgroundColor: theme.border },
  sectionHeading: { marginHorizontal: 20, marginBottom: 9, color: theme.ink, fontSize: 20, fontWeight: '800' },
  sectionIntro: { marginHorizontal: 20, color: theme.muted, fontSize: 13, lineHeight: 19, marginBottom: 16 },
  emptySmall: { marginHorizontal: 20, marginBottom: 22, padding: 16, backgroundColor: theme.white, color: theme.muted, borderRadius: 12, fontSize: 13 },
  emptyTitle: { marginTop: 12, fontWeight: '800', fontSize: 19, color: theme.ink },
  emptyText: { marginTop: 8, textAlign: 'center', color: theme.muted, lineHeight: 21 },
  errorText: { marginTop: 8, fontSize: 12, color: '#A12339' },
  certificateRow: { marginHorizontal: 20, marginBottom: 10, borderRadius: 13, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.white, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 13 },
  certificateIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: theme.accentSoft, alignItems: 'center', justifyContent: 'center' },
  certificateName: { color: theme.ink, fontWeight: '700', fontSize: 14 },
  certificateSub: { color: theme.muted, fontSize: 12, marginTop: 4 },
  bookingPanel: { margin: 20, marginTop: 25, padding: 20, borderRadius: 18, backgroundColor: theme.accentSoft },
  bookingHeadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  bookingTitle: { color: theme.ink, fontSize: 19, fontWeight: '800' },
  bookingText: { color: theme.muted, fontSize: 13, lineHeight: 20, marginTop: 11, marginBottom: 18 },
  bookButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, backgroundColor: theme.accent, paddingVertical: 14, borderRadius: 12 },
  bookButtonText: { color: theme.white, fontWeight: '800', fontSize: 16 },
  serviceRow: { backgroundColor: theme.white, borderColor: theme.border, borderWidth: 1, borderRadius: 12, marginHorizontal: 20, marginBottom: 9, padding: 15, flexDirection: 'row', gap: 8, alignItems: 'center' },
  serviceName: { color: theme.ink, fontSize: 15, fontWeight: '700' },
  serviceMeta: { color: theme.muted, fontSize: 11, marginTop: 4 },
  servicePrices: { alignItems: 'flex-end' },
  servicePrice: { color: theme.accent, fontWeight: '800', fontSize: 15 },
  oldPrice: { color: theme.muted, fontSize: 12, textDecorationLine: 'line-through', marginBottom: 3 },
  portfolioHeading: { marginTop: 25, flexDirection: 'row', alignItems: 'center', marginRight: 22 },
  portfolioGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 3, paddingHorizontal: 3 },
  portfolioTile: { width: '32.7%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  portfolioImage: { width: '100%', height: '100%' },
  pinIcon: { position: 'absolute', top: 8, right: 8, backgroundColor: 'rgba(39,29,43,0.55)', borderRadius: 12, padding: 5 },
  postSaveButton: { position: 'absolute', bottom: 7, right: 7, backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: 20, padding: 7 },
  portfolioNote: { color: theme.muted, fontSize: 12, lineHeight: 18, marginHorizontal: 20, marginTop: 13 },
  modalShade: { flex: 1, backgroundColor: 'rgba(25,18,26,0.66)', justifyContent: 'center', padding: 18 },
  modalCard: { padding: 16, backgroundColor: theme.white, borderRadius: 17 },
  modalTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 13 },
  modalTitle: { color: theme.ink, fontSize: 17, fontWeight: '700' },
  modalImage: { width: '100%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 8, overflow: 'hidden' },
  modalPhoto: { width: '100%', height: '100%' },
  modalCaption: { color: theme.ink, fontWeight: '700', fontSize: 15, marginTop: 14 },
  modalHint: { color: theme.muted, fontSize: 12, marginTop: 4 },
});