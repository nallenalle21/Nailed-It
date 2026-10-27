import { Text } from '../../components/AppText';   // in src/components use './AppText'
import { colors } from '../../theme';
import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../../services/supabase';
import { publicPostUrl, type VendorPost } from '../../services/vendorPortfolio';
import SaveToBoardModal from '../../components/SaveToBoardModal';
import { getSavedTargetIds } from '../../services/wishlist';
import {
  View,
  Image,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Modal,
  Platform,
  StyleSheet,
  Animated,
  LayoutChangeEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import MapView, { Marker } from 'react-native-maps';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

const SERVICES = [
  'Simple nail art',
  'Advanced nail art',
  'Gel nails',
  'Acrylic nails',
  'Manicure',
  'Pedicure',
];

const PRICE_RANGES = [
  { label: 'Any price', min: 0, max: Infinity },
  { label: 'Under 500 kr', min: 0, max: 499 },
  { label: '500–800 kr', min: 500, max: 800 },
  { label: '800+ kr', min: 801, max: Infinity },
];

type Tech = {
  id: string;
  name: string;
  area: string;
  lat: number;
  lng: number;
  services: string[];
  price: number; // starting price in SEK
};

// Placeholder data, replace with real data later
const TECHS: Tech[] = [
  { id: '1', name: 'Nail Studio Kalle', area: 'Södermalm', lat: 59.3138, lng: 18.0710, services: ['Gel nails', 'Manicure'], price: 450 },
  { id: '2', name: 'Lova Nails', area: 'Vasastan', lat: 59.3425, lng: 18.0490, services: ['Advanced nail art', 'Gel nails'], price: 750 },
  { id: '3', name: 'Glow by Ines', area: 'Östermalm', lat: 59.3380, lng: 18.0890, services: ['Simple nail art', 'Manicure', 'Pedicure'], price: 400 },
  { id: '4', name: 'Studio Leif', area: 'Kungsholmen', lat: 59.3330, lng: 18.0270, services: ['Acrylic nails', 'Advanced nail art'], price: 900 },
  { id: '5', name: 'Aly & co', area: 'Gamla stan', lat: 59.3250, lng: 18.0710, services: ['Manicure', 'Pedicure', 'Gel nails'], price: 550 },
  { id: '6', name: 'I <3 Nails', area: 'Hornstull', lat: 59.3160, lng: 18.0340, services: ['Simple nail art', 'Gel nails'], price: 480 },
];

const STOCKHOLM = {
  latitude: 59.3293,
  longitude: 18.0686,
  latitudeDelta: 0.09,
  longitudeDelta: 0.09,
};

// The Explore feed uses the actual posts uploaded to Supabase by creators.
// Map TECHS above are still placeholders until work locations are integrated.
type InspoItem = {
  id: string;
  vendorId: string;
  creatorName: string;
  uri: string;
  caption: string;
  h: number;
};

type OfferedService = {
  user_id: string;
  name: string;
  category: string | null;
  price: number | string;
  discount_price: number | string | null;
};

const MASONRY_HEIGHTS = [180, 240, 160, 215, 255, 175, 220, 190, 235, 200];
const POSTS_PAGE_SIZE = 250;

const formatDate = (d: Date) =>
  d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

/* ---------- hold-and-drag helpers ---------- */

type DragTargetKey = 'fav' | 'profile';
type Point = { x: number; y: number };
type Targets = Record<DragTargetKey, Point>;

const BRAND = '#a12640';
const TARGET_SIZE = 60;
const HIT_RADIUS = 36;   // must stay below TARGET_DX so the drop zones never overlap
const TARGET_DX = 40;    // each bubble is 40px left/right of the finger (80px apart)
const TARGET_DY = 80;    // bubbles sit 80px above the finger
const EDGE_X = 80;       // keeps the labels from being cut off at the sides
const EDGE_TOP = 84;
const EDGE_BOTTOM = 50;

// x, y are relative to the overlay container; w, h are its size
function getTargets(x: number, y: number, w: number, h: number): Targets {
  const cx = Math.min(Math.max(x, EDGE_X + TARGET_DX), w - EDGE_X - TARGET_DX);
  let cy = y - TARGET_DY;
  if (cy < EDGE_TOP) cy = y + TARGET_DY; // too close to the top: show below the finger
  cy = Math.min(cy, h - EDGE_BOTTOM);
  return {
    fav: { x: cx - TARGET_DX, y: cy },
    profile: { x: cx + TARGET_DX, y: cy },
  };
}

export default function ExploreCreator({ navigation }: any) {
  const [inspoPosts, setInspoPosts] = useState<InspoItem[]>([]);
  const [offeredServices, setOfferedServices] = useState<OfferedService[]>([]);
  const [feedLoading, setFeedLoading] = useState(true);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [feedWarning, setFeedWarning] = useState<string | null>(null);
  const [feedRefresh, setFeedRefresh] = useState(0);

  const [query, setQuery] = useState('');
  const [service, setService] = useState<string | null>(null);
  const [priceIdx, setPriceIdx] = useState(0);
  const [date, setDate] = useState<Date | null>(null);

  const [serviceModal, setServiceModal] = useState(false);
  const [priceModal, setPriceModal] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);

  // hold-and-drag state
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [saveTarget, setSaveTarget] = useState<InspoItem | null>(null);
  const [drag, setDrag] = useState<{ id: string; targets: Targets } | null>(null);
  const [hover, setHover] = useState<DragTargetKey | null>(null);
  const [scrollEnabled, setScrollEnabled] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const dragRef = useRef<{ id: string; targets: Targets } | null>(null);
  const hoverRef = useRef<DragTargetKey | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Where the overlay container sits in the window + its size
  const overlayRef = useRef<View>(null);
  const offsetRef = useRef<Point>({ x: 0, y: 0 });
  const sizeRef = useRef({ w: 390, h: 800 });

  const onOverlayLayout = (e: LayoutChangeEvent) => {
    sizeRef.current = { w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height };
    overlayRef.current?.measureInWindow((x, y) => {
      offsetRef.current = { x, y };
    });
  };

  const showToast = (msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 1600);
  };

  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
  }, []);

  // Refresh whenever Explore is focused, so recently uploaded posts become visible.
  // Pages avoid Supabase's usual default cap on a single select query.
  useFocusEffect(useCallback(() => {
    let active = true;
    setFeedLoading(true);
    setFeedError(null);
    setFeedWarning(null);

    const loadCreatorPosts = async () => {
      try {
        const creatorsResult = await supabase.from('profiles')
          .select('id, username')
          .eq('role', 'creator');
        if (creatorsResult.error) throw creatorsResult.error;

        const creators = (creatorsResult.data ?? []) as { id: string; username: string | null }[];
        const nameById = new Map(creators.map(p => [p.id, p.username?.trim() || 'Unnamed creator']));
        const allPosts: VendorPost[] = [];

        for (let from = 0; ; from += POSTS_PAGE_SIZE) {
          const result = await supabase.from('vendor_posts')
            .select('id, vendor_id, storage_path, caption, is_pinned, created_at')
            .order('created_at', { ascending: false })
            .order('id', { ascending: false })
            .range(from, from + POSTS_PAGE_SIZE - 1);
          if (result.error) throw result.error;
          const page = (result.data ?? []) as VendorPost[];
          allPosts.push(...page);
          if (page.length < POSTS_PAGE_SIZE) break;
        }

        // Services support feed search and price/service filters, when available.
        const servicesResult = await supabase.from('services')
          .select('user_id, name, category, price, discount_price');

        if (!active) return;
        setOfferedServices(servicesResult.error ? [] : (servicesResult.data ?? []) as OfferedService[]);
        setFeedWarning(servicesResult.error
          ? `Services could not be loaded; service and price filters may show no results: ${servicesResult.error.message}`
          : null);
        const visiblePosts = allPosts.filter(post => nameById.has(post.vendor_id));
        setInspoPosts(visiblePosts.map((post, index) => ({
          id: post.id,
          vendorId: post.vendor_id,
          creatorName: nameById.get(post.vendor_id)!,
          caption: post.caption || '',
          uri: publicPostUrl(post.storage_path),
          h: MASONRY_HEIGHTS[index % MASONRY_HEIGHTS.length],
        })));
      } catch (caughtError) {
        if (active) {
          setFeedError(caughtError instanceof Error ? caughtError.message : String(caughtError));
        }
      } finally {
        if (active) setFeedLoading(false);
      }
    };

    void loadCreatorPosts();
    return () => { active = false; };
  }, [feedRefresh]));

  // The hearts reflect Supabase, including saves made in other boards/screens.
  const reloadFavorites = useCallback(async () => {
    try {
      setFavorites(await getSavedTargetIds('post'));
    } catch (error) {
      console.warn('[Explore] Could not read saved photos:', error);
    }
  }, []);
  useFocusEffect(useCallback(() => {
    void reloadFavorites();
    return () => {};
  }, [reloadFavorites]));

  // VendorProfile lives inside the Vendors tab's nested stack, as in the
  // persistent-bottom-tabs App.tsx previously used in this project.
  const goToProfile = useCallback((vendorId: string) => {
    navigation.navigate('Vendors', {
      screen: 'VendorProfile',
      params: { vendorId },
    });
  }, [navigation]);

  const handleDragStart = useCallback((id: string, x: number, y: number) => {
    const lx = x - offsetRef.current.x;
    const ly = y - offsetRef.current.y;
    const state = {
      id,
      targets: getTargets(lx, ly, sizeRef.current.w, sizeRef.current.h),
    };
    dragRef.current = state;
    hoverRef.current = null;
    setHover(null);
    setDrag(state);
    setScrollEnabled(false);
  }, []);

  const handleDragMove = useCallback((x: number, y: number) => {
    const d = dragRef.current;
    if (!d) return;
    const lx = x - offsetRef.current.x;
    const ly = y - offsetRef.current.y;
    let h: DragTargetKey | null = null;
    (['fav', 'profile'] as DragTargetKey[]).forEach((key) => {
      const t = d.targets[key];
      if (Math.hypot(lx - t.x, ly - t.y) < HIT_RADIUS) h = key;
    });
    if (h !== hoverRef.current) {
      hoverRef.current = h;
      setHover(h);
    }
  }, []);

  const handleDragEnd = useCallback(() => {
    const d = dragRef.current;
    if (!d) return;
    const chosen = hoverRef.current;
    dragRef.current = null;
    hoverRef.current = null;
    setDrag(null);
    setHover(null);
    setScrollEnabled(true);

    if (chosen === 'fav') {
      const item = inspoPosts.find(i => i.id === d.id);
      if (item) setSaveTarget(item);
    } else if (chosen === 'profile') {
      const item = inspoPosts.find((i) => i.id === d.id);
      if (item) goToProfile(item.vendorId);
    }
  }, [inspoPosts, goToProfile]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const range = PRICE_RANGES[priceIdx];
    return TECHS.filter((t) => {
      if (service && !t.services.includes(service)) return false;
      if (t.price < range.min || t.price > range.max) return false;
      if (
        q &&
        !(
          t.name.toLowerCase().includes(q) ||
          t.area.toLowerCase().includes(q) ||
          t.services.some((s) => s.toLowerCase().includes(q))
        )
      )
        return false;
      return true;
    });
  }, [query, service, priceIdx]);

  // The masonry feed is based on real images; prices/services come from that
  // creator's own services. Date availability and geography are not connected yet.
  const servicesByVendor = useMemo(() => {
    const byVendor = new Map<string, OfferedService[]>();
    for (const item of offeredServices) {
      if (!item.user_id) continue;
      const current = byVendor.get(item.user_id) ?? [];
      current.push(item);
      byVendor.set(item.user_id, current);
    }
    return byVendor;
  }, [offeredServices]);

  const filteredPosts = useMemo(() => {
    const q = query.trim().toLowerCase();
    const selectedService = service?.toLowerCase();
    const range = PRICE_RANGES[priceIdx];
    return inspoPosts.filter(post => {
      const offered = servicesByVendor.get(post.vendorId) ?? [];
      if (q && !(
        post.creatorName.toLowerCase().includes(q) ||
        post.caption.toLowerCase().includes(q) ||
        offered.some(s => s.name.toLowerCase().includes(q) || (s.category || '').toLowerCase().includes(q))
      )) return false;

      if (selectedService && !offered.some(s =>
        s.name.toLowerCase().includes(selectedService) ||
        (s.category || '').toLowerCase().includes(selectedService)
      )) return false;

      if (priceIdx !== 0 && !offered.some(s => {
        const price = Number(s.discount_price ?? s.price);
        return Number.isFinite(price) && price >= range.min && price <= range.max;
      })) return false;

      return true;
    });
  }, [inspoPosts, servicesByVendor, query, service, priceIdx]);

  const hasFilters = service || priceIdx !== 0 || date || query;
  const clearAll = () => {
    setQuery('');
    setService(null);
    setPriceIdx(0);
    setDate(null);
  };

  // Split inspo into two columns for the masonry layout
  const colA = filteredPosts.filter((_, i) => i % 2 === 0);
  const colB = filteredPosts.filter((_, i) => i % 2 === 1);

  const renderTile = (item: InspoItem) => (
    <InspoTile
      key={item.id}
      item={item}
      favorite={favorites.has(item.id)}
      onStart={handleDragStart}
      onMove={handleDragMove}
      onEnd={handleDragEnd}
    />
  );

  const renderOptionModal = (
    visible: boolean,
    onClose: () => void,
    title: string,
    options: string[],
    selected: string | null,
    onSelect: (v: string | null) => void
  ) => (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose}>
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>{title}</Text>
          {options.map((opt, i) => {
            const active = selected === opt;
            return (
              <TouchableOpacity
                key={opt}
                style={styles.option}
                onPress={() => {
                  onSelect(i === 0 && title === 'Price range' ? null : opt);
                  onClose();
                }}
              >
                <Text style={[styles.optionText, active && styles.optionActive]}>{opt}</Text>
                {active && <Ionicons name="checkmark" size={20} color={colors.primary} />}
              </TouchableOpacity>
            );
          })}
          {title === 'Type of service' && (
            <TouchableOpacity
              style={styles.option}
              onPress={() => {
                setService(null);
                onClose();
              }}
            >
              <Text style={[styles.optionText, { color: '#888' }]}>Show all services</Text>
            </TouchableOpacity>
          )}
        </View>
      </TouchableOpacity>
    </Modal>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Wrapper so the drag overlay can sit on top of the scroll content */}
      <View
        ref={overlayRef}
        style={{ flex: 1 }}
        collapsable={false}
        onLayout={onOverlayLayout}
      >
        <ScrollView
          scrollEnabled={scrollEnabled}
          refreshControl={
            <RefreshControl refreshing={feedLoading} onRefresh={() => setFeedRefresh(n => n + 1)} />
          }
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 32 }}
        >
          {/* PART 1: search + filters */}
          <View style={styles.searchBox}>
            <Ionicons name="search" size={18} color="#888" />
            <TextInput
              style={styles.searchInput}
              placeholder="search nail techs, areas, styles"
              value={query}
              onChangeText={setQuery}
              returnKeyType="search"
            />
            {query ? (
              <TouchableOpacity onPress={() => setQuery('')} hitSlop={10}>
                <Ionicons name="close-circle" size={18} color="#bbb" />
              </TouchableOpacity>
            ) : null}
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterRow}
          >
            <FilterPill
              icon="brush-outline"
              label={service ?? 'Service'}
              active={!!service}
              onPress={() => setServiceModal(true)}
            />
            <FilterPill
              icon="cash-outline"
              label={priceIdx === 0 ? 'Price' : PRICE_RANGES[priceIdx].label}
              active={priceIdx !== 0}
              onPress={() => setPriceModal(true)}
            />
            <FilterPill
              icon="calendar-outline"
              label={date ? formatDate(date) : 'Date'}
              active={!!date}
              onPress={() => setDateOpen(true)}
            />
            {hasFilters ? (
              <TouchableOpacity style={styles.clear} onPress={clearAll}>
                <Text style={styles.clearText}>Clear</Text>
              </TouchableOpacity>
            ) : null}
          </ScrollView>

          {/* PART 2: map */}
          <View style={styles.mapHeader}>
            <Text style={styles.sectionTitle}>Sample studios in Stockholm</Text>
            <Text style={styles.count}>{filtered.length} found</Text>
          </View>
          <View style={styles.mapWrap}>
            <MapView style={styles.map} initialRegion={STOCKHOLM}>
              {filtered.map((t) => (
                <Marker
                  key={t.id}
                  coordinate={{ latitude: t.lat, longitude: t.lng }}
                  title={t.name}
                  description={`${t.area} · from ${t.price} kr`}
                  pinColor={colors.primary}
                />
              ))}
            </MapView>
          </View>

          {/* PART 3: real artwork feed */}
          <Text style={styles.demoMapNote}>Map pins are demonstration data, not actual creator addresses.</Text>
          <View style={styles.feedHeading}>
            <Text style={styles.sectionTitle}>get inspired</Text>
            <TouchableOpacity onPress={() => setFeedRefresh(n => n + 1)} accessibilityLabel="Refresh creator photos">
              <Ionicons name="refresh" size={21} color={colors.primary} />
            </TouchableOpacity>
          </View>
          {date && <Text style={styles.feedNotice}>Date-based photo filtering will be available once booking availability is connected.</Text>}
          {feedWarning && <Text style={styles.feedNotice}>{feedWarning}</Text>}
          {feedError ? (
            <View style={styles.feedStatus}>
              <Text style={styles.feedError}>Could not load creator photos: {feedError}</Text>
              <TouchableOpacity onPress={() => setFeedRefresh(n => n + 1)}>
                <Text style={styles.retryText}>Try again</Text>
              </TouchableOpacity>
            </View>
          ) : feedLoading && inspoPosts.length === 0 ? (
            <ActivityIndicator style={{ marginTop: 28 }} color={colors.primary} size="large" />
          ) : filteredPosts.length === 0 ? (
            <Text style={styles.feedEmpty}>
              {inspoPosts.length === 0
                ? 'No creator photos have been uploaded yet.'
                : 'No photos match these filters.'}
            </Text>
          ) : (
            <View style={styles.feed}>
              <View style={styles.feedCol}>{colA.map(renderTile)}</View>
              <View style={styles.feedCol}>{colB.map(renderTile)}</View>
            </View>
          )}
        </ScrollView>

        {/* Hold-and-drag overlay */}
        {drag && (
          <View style={styles.dragOverlay} pointerEvents="none">
            <DragBubble
              icon={favorites.has(drag.id) ? 'heart-dislike' : 'heart'}
              label={favorites.has(drag.id) ? 'Manage saved boards' : 'Save to a board'}
              x={drag.targets.fav.x}
              y={drag.targets.fav.y}
              hovered={hover === 'fav'}
            />
            <DragBubble
              icon="person"
              label="Go to profile"
              x={drag.targets.profile.x}
              y={drag.targets.profile.y}
              hovered={hover === 'profile'}
            />
          </View>
        )}

        {toast && (
          <View style={styles.toast} pointerEvents="none">
            <Text style={styles.toastText}>{toast}</Text>
          </View>
        )}
      </View>

      {/* Service filter */}
      {renderOptionModal(serviceModal, () => setServiceModal(false), 'Type of service', SERVICES, service, setService)}

      {/* Price filter */}
      <Modal visible={priceModal} transparent animationType="slide" onRequestClose={() => setPriceModal(false)}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={() => setPriceModal(false)}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Price range</Text>
            {PRICE_RANGES.map((r, i) => (
              <TouchableOpacity
                key={r.label}
                style={styles.option}
                onPress={() => {
                  setPriceIdx(i);
                  setPriceModal(false);
                }}
              >
                <Text style={[styles.optionText, priceIdx === i && styles.optionActive]}>{r.label}</Text>
                {priceIdx === i && <Ionicons name="checkmark" size={20} color={colors.danger} />}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Date filter */}
      {Platform.OS === 'ios' ? (
        <Modal visible={dateOpen} transparent animationType="slide" onRequestClose={() => setDateOpen(false)}>
          <View style={styles.backdrop}>
            <View style={styles.sheet}>
              <Text style={styles.sheetTitle}>Choose date</Text>
              <DateTimePicker
                value={date ?? new Date()}
                mode="date"
                display="inline"
                minimumDate={new Date()}
                accentColor={colors.danger}
                onChange={(_, d) => d && setDate(d)}
              />
              <View style={styles.dateButtons}>
                <TouchableOpacity
                  onPress={() => {
                    setDate(null);
                    setDateOpen(false);
                  }}
                >
                  <Text style={styles.cancel}>Clear</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.doneButton}
                  onPress={() => {
                    if (!date) setDate(new Date());
                    setDateOpen(false);
                  }}
                >
                  <Text style={styles.doneText}>Done</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      ) : (
        dateOpen && (
          <DateTimePicker
            value={date ?? new Date()}
            mode="date"
            minimumDate={new Date()}
            onChange={(e, d) => {
              setDateOpen(false);
              if (e.type === 'set' && d) setDate(d);
            }}
          />
        )
      )}
      <SaveToBoardModal
        visible={saveTarget !== null}
        kind="post"
        targetId={saveTarget?.id ?? null}
        onClose={() => setSaveTarget(null)}
        onChanged={() => { void reloadFavorites(); showToast('Saved boards updated'); }}
      />
    </SafeAreaView>
  );
}

/* ---------- Inspo tile with long-press + drag gesture ---------- */

function InspoTile({
  item,
  favorite,
  onStart,
  onMove,
  onEnd,
}: {
  item: InspoItem;
  favorite: boolean;
  onStart: (id: string, x: number, y: number) => void;
  onMove: (x: number, y: number) => void;
  onEnd: () => void;
}) {
  const gesture = Gesture.Pan()
    .runOnJS(true)
    .activateAfterLongPress(350)
    .onStart((e) => onStart(item.id, e.absoluteX, e.absoluteY))
    .onUpdate((e) => onMove(e.absoluteX, e.absoluteY))
    .onFinalize(() => onEnd());

  const [imageFailed, setImageFailed] = useState(false);
  useEffect(() => setImageFailed(false), [item.uri]);

  return (
    <GestureDetector gesture={gesture}>
      <View style={[styles.tile, { height: item.h, backgroundColor: '#F1E9EE' }]}>
        {imageFailed ? (
          <Ionicons name="image-outline" size={28} color="#A793A1" />
        ) : (
          <Image
            source={{ uri: item.uri }}
            style={styles.tileImage}
            resizeMode="cover"
            onError={() => setImageFailed(true)}
            accessibilityLabel={`Photo by ${item.creatorName}`}
          />
        )}
        {favorite && (
          <View style={styles.favBadge}>
            <Ionicons name="heart" size={14} color={BRAND} />
          </View>
        )}
      </View>
    </GestureDetector>
  );
}

/* ---------- Bubble that pops up while dragging ---------- */

function DragBubble({
  icon,
  label,
  x,
  y,
  hovered,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  x: number;
  y: number;
  hovered: boolean;
}) {
  const scale = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    Animated.spring(scale, {
      toValue: hovered ? 1.25 : 1,
      friction: 6,
      useNativeDriver: true,
    }).start();
  }, [hovered, scale]);

  return (
    <Animated.View
      style={[
        styles.bubble,
        {
          left: x - TARGET_SIZE / 2,
          top: y - TARGET_SIZE / 2,
          backgroundColor: hovered ? '#FBE9EE' : '#fff',
          transform: [{ scale }],
        },
      ]}
    >
      <Ionicons name={icon} size={28} color={BRAND} />
      {hovered && (
        <View style={styles.bubbleLabel}>
          <Text style={styles.bubbleLabelText}>{label}</Text>
        </View>
      )}
    </Animated.View>
  );
}

function FilterPill({
  icon,
  label,
  active,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.pill, active && styles.pillActive]}
      onPress={onPress}
    >
      <Ionicons name={icon} size={16} color={active ? '#fff' : '#444'} />
      <Text style={[styles.pillText, active && { color: '#fff' }]}>{label}</Text>
      <Ionicons name="chevron-down" size={14} color={active ? '#fff' : '#888'} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 8,
    paddingHorizontal: 14,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#f2f2f2',
  },
  searchInput: { flex: 1, fontSize: 16 },
  filterRow: { paddingHorizontal: 16, paddingVertical: 12, gap: 8, alignItems: 'center' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#ddd',
    backgroundColor: '#fff',
  },
  pillActive: { backgroundColor: colors.danger, borderColor: colors.danger },
  pillText: { fontSize: 14, color: '#333', fontWeight: '500' },
  clear: { paddingHorizontal: 8 },
  clearText: { color: colors.danger, fontWeight: '600' },
  mapHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 10,
  },
  sectionTitle: { fontSize: 20, fontWeight: '700' },
  count: { color: '#888', fontSize: 14 },
  mapWrap: { marginHorizontal: 16, borderRadius: 16, overflow: 'hidden', height: 280 },
  map: { flex: 1 },
  feed: { flexDirection: 'row', paddingHorizontal: 12, paddingTop: 12, gap: 8 },
  feedCol: { flex: 1, gap: 8 },
  tile: { borderRadius: 14, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  tileImage: { width: '100%', height: '100%' },
  feedHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: 16, marginTop: 24 },
  demoMapNote: { color: '#888', fontSize: 12, marginHorizontal: 16, marginTop: 8 },
  feedNotice: { color: '#786B7A', fontSize: 13, marginHorizontal: 16, marginTop: 10 },
  feedStatus: { marginHorizontal: 16, marginTop: 15, padding: 16, backgroundColor: '#FFF1F4', borderRadius: 12 },
  feedError: { color: '#A12339', fontSize: 13, lineHeight: 19 },
  retryText: { color: '#A12339', fontWeight: '700', marginTop: 10 },
  feedEmpty: { color: '#716C83', fontSize: 14, marginHorizontal: 16, marginTop: 20, marginBottom: 28 },
  favBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dragOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  bubble: {
    position: 'absolute',
    width: TARGET_SIZE,
    height: TARGET_SIZE,
    borderRadius: TARGET_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  bubbleLabel: {
    position: 'absolute',
    top: -40,
    width: 190,
    left: (TARGET_SIZE - 190) / 2,
    alignItems: 'center',
  },
  bubbleLabelText: {
    backgroundColor: '#222',
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    overflow: 'hidden',
  },
  toast: {
    position: 'absolute',
    bottom: 24,
    alignSelf: 'center',
    backgroundColor: '#222',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
  },
  toastText: { color: '#fff', fontSize: 14, fontWeight: '500' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 36,
  },
  sheetTitle: { fontSize: 18, fontWeight: '700', marginBottom: 8 },
  option: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ddd',
  },
  optionText: { fontSize: 16 },
  optionActive: { color: colors.danger, fontWeight: '600' },
  dateButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 20,
    marginTop: 8,
  },
  cancel: { fontSize: 16, color: '#666' },
  doneButton: { backgroundColor: colors.danger, paddingHorizontal: 22, paddingVertical: 9, borderRadius: 8 },
  doneText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
