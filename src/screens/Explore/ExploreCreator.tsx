import { Text } from '../../components/AppText';   // in src/components use './AppText'
import { colors, fonts } from '../../theme';
import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../../services/supabase';
import { publicPostUrl, type VendorPost } from '../../services/vendorPortfolio';
import SaveToBoardModal from '../../components/SaveToBoardModal';
import PriceRangeSlider from '../../components/PriceRangeSlider';
import { HIDDEN_SPINNER, RefreshStar } from '../../components/SparkleStars';
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
  ViewInstance,
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

// Custom burgundy pin with light pink dot (assets/images/map-pin@2x/@3x.png for sharp screens).
const MAP_PIN = require('../../../assets/images/map-pin.png');

// PROTOTYPE: every photo counts as matching all service/price/date filters, so choosing a
// filter never empties the "get inspired" feed (search still applies; map pins still filter).
// Set to false to filter photos by each nail tech's real services and availability.
const PROTOTYPE_POSTS_MATCH_ALL_FILTERS = true;

// Price slider bounds (SEK). The ends are open: 300 means "any low price", 3000 means "3000+".
const PRICE_MIN = 300;
const PRICE_MAX = 3000;
const PRICE_STEP = 50;
type PriceRange = [number, number];
const FULL_PRICE_RANGE: PriceRange = [PRICE_MIN, PRICE_MAX];
const isFullPriceRange = ([lo, hi]: PriceRange) => lo === PRICE_MIN && hi === PRICE_MAX;
const inPriceRange = (price: number, [lo, hi]: PriceRange) =>
  (lo === PRICE_MIN || price >= lo) && (hi === PRICE_MAX || price <= hi);
const formatPriceRange = ([lo, hi]: PriceRange) => `${lo}–${hi === PRICE_MAX ? `${PRICE_MAX}+` : hi} kr`;

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

const BRAND = colors.wine;
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
  // Pull-to-refresh shows a spinning star (RefreshStar) until the feed has reloaded.
  const pulled = useRef(false);
  const sawLoading = useRef(false);
  const [pulling, setPulling] = useState(false);
  useEffect(() => {
    if (!pulled.current) return;
    if (feedLoading) { sawLoading.current = true; return; }
    if (sawLoading.current) {
      pulled.current = false;
      sawLoading.current = false;
      setPulling(false);
    }
  }, [feedLoading]);

  const [query, setQuery] = useState('');
  const [services, setServices] = useState<string[]>([]);         // several can be chosen
  const [serviceDraft, setServiceDraft] = useState<string[]>([]); // edited in the sheet until Save
  const [priceRange, setPriceRange] = useState<PriceRange | null>(null); // null = any price
  const [date, setDate] = useState<Date | null>(null);

  const [serviceModal, setServiceModal] = useState(false);
  const [priceModal, setPriceModal] = useState(false);
  const [priceDraft, setPriceDraft] = useState<PriceRange>(FULL_PRICE_RANGE); // edited in the sheet until Save
  const [dateOpen, setDateOpen] = useState(false);
  const [filterMenu, setFilterMenu] = useState(false);

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
  const overlayRef = useRef<ViewInstance>(null);
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
    return TECHS.filter((t) => {
      if (services.length && !services.some(sv => t.services.includes(sv))) return false;
      if (priceRange && !inPriceRange(t.price, priceRange)) return false;
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
  }, [query, services, priceRange]);

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
    const selectedServices = services.map(sv => sv.toLowerCase());
    return inspoPosts.filter(post => {
      const offered = servicesByVendor.get(post.vendorId) ?? [];
      if (q && !(
        post.creatorName.toLowerCase().includes(q) ||
        post.caption.toLowerCase().includes(q) ||
        offered.some(s => s.name.toLowerCase().includes(q) || (s.category || '').toLowerCase().includes(q))
      )) return false;
      if (PROTOTYPE_POSTS_MATCH_ALL_FILTERS) return true;

      if (selectedServices.length && !offered.some(s => selectedServices.some(sel =>
        s.name.toLowerCase().includes(sel) ||
        (s.category || '').toLowerCase().includes(sel))
      )) return false;

      if (priceRange && !offered.some(s => {
        const price = Number(s.discount_price ?? s.price);
        return Number.isFinite(price) && inPriceRange(price, priceRange);
      })) return false;

      return true;
    });
  }, [inspoPosts, servicesByVendor, query, services, priceRange]);

  const filtersActive = services.length > 0 || !!priceRange || !!date;
  const clearFilters = () => {
    setServices([]);
    setPriceRange(null);
    setDate(null);
  };
  // Close the filter menu first: iOS can't present a second modal while one is still open.
  const openFromFilterMenu = (open: () => void) => {
    setFilterMenu(false);
    setTimeout(open, 350);
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
            <RefreshControl
              refreshing={pulling}
              {...HIDDEN_SPINNER}
              onRefresh={() => {
                pulled.current = true;
                sawLoading.current = false;
                setPulling(true);
                setFeedRefresh(n => n + 1);
              }}
            />
          }
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 32 }}
        >
          {/* PART 1: search + filters */}
          <View style={styles.searchRow}>
            <View style={styles.searchBox}>
              <Ionicons name="search" size={18} color={colors.blue} />
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
            <TouchableOpacity
              style={styles.filterButton}
              onPress={() => setFilterMenu(true)}
              accessibilityLabel="Filter by service, price and date"
            >
              <Ionicons name="options-outline" size={22} color={colors.blue} />
              {filtersActive ? <View style={styles.filterDot} /> : null}
            </TouchableOpacity>
          </View>

          {/* PART 2: map */}
          <View style={styles.mapHeader}>
            <View style={styles.starTitle}>
              <Image source={require('../../../assets/images/stars-double.png')} style={styles.starsDouble} />
              <Text style={styles.sectionTitle}>find your Nail tech</Text>
            </View>
          </View>
          <View style={styles.mapWrap}>
            <MapView style={styles.map} initialRegion={STOCKHOLM}>
              {filtered.map((t) => (
                <Marker
                  key={t.id}
                  coordinate={{ latitude: t.lat, longitude: t.lng }}
                  title={t.name}
                  description={`${t.area} · from ${t.price} kr`}
                  anchor={{ x: 0.5, y: 1 }}        // Android: pin tip on the location
                  centerOffset={{ x: 0, y: -18 }}   // iOS: same, half the 36pt pin height
                >
                  <Image source={MAP_PIN} style={styles.mapPin} resizeMode="contain" />
                </Marker>
              ))}
            </MapView>
          </View>

          {/* PART 3: real artwork feed */}
          <View style={styles.feedHeading}>
            <View style={styles.starTitle}>
              <Image source={require('../../../assets/images/star.png')} style={styles.star} />
              <Text style={styles.sectionTitle}>get inspired</Text>
            </View>
            <TouchableOpacity onPress={() => setFeedRefresh(n => n + 1)} accessibilityLabel="Refresh creator photos">
              <Ionicons name="refresh" size={21} color={colors.blue} />
            </TouchableOpacity>
          </View>
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
        <RefreshStar refreshing={pulling} y={40} />

        {/* Hold-and-drag overlay */}
        {drag && (
          <View style={styles.dragOverlay} pointerEvents="none">
            <DragBubble
              icon={favorites.has(drag.id) ? 'heart-dislike' : 'heart'}
              label={favorites.has(drag.id) ? 'Edit' : 'Nail it'}
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

      {/* Filter menu: opened from the icon next to the search bar */}
      <Modal visible={filterMenu} transparent animationType="slide" onRequestClose={() => setFilterMenu(false)}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={() => setFilterMenu(false)}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Filters</Text>
            {([
              { icon: 'brush-outline', label: 'Service', value: services.length > 1 ? `${services.length} selected` : services[0] ?? null,
                open: () => { setServiceDraft(services); setServiceModal(true); } },
              { icon: 'cash-outline', label: 'Price', value: priceRange ? formatPriceRange(priceRange) : null,
                open: () => { setPriceDraft(priceRange ?? FULL_PRICE_RANGE); setPriceModal(true); } },
              { icon: 'calendar-outline', label: 'Date', value: date ? formatDate(date) : null, open: () => setDateOpen(true) },
            ] as const).map(row => (
              <TouchableOpacity key={row.label} style={styles.option} onPress={() => openFromFilterMenu(row.open)}>
                <View style={styles.filterMenuLabel}>
                  <Ionicons name={row.icon} size={18} color={colors.ink} />
                  <Text style={styles.optionText}>{row.label}</Text>
                </View>
                <View style={styles.filterMenuLabel}>
                  <Text style={[styles.optionText, row.value ? styles.optionActive : styles.filterMenuAny]}>
                    {row.value ?? 'Any'}
                  </Text>
                  <Ionicons name="chevron-forward" size={16} color="#888" />
                </View>
              </TouchableOpacity>
            ))}
            {filtersActive ? (
              <TouchableOpacity style={styles.clearFilters} onPress={clearFilters}>
                <Text style={styles.clearFiltersText}>Clear filters</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Service filter: pick several, then Save */}
      <Modal visible={serviceModal} transparent animationType="slide" onRequestClose={() => setServiceModal(false)}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={() => setServiceModal(false)}>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, { marginBottom: 0 }]}>Type of service</Text>
              <TouchableOpacity
                style={styles.saveButton}
                onPress={() => {
                  setServices(serviceDraft);
                  setServiceModal(false);
                }}
              >
                <Text style={styles.saveText}>Save</Text>
              </TouchableOpacity>
            </View>
            {SERVICES.map(opt => {
              const active = serviceDraft.includes(opt);
              return (
                <TouchableOpacity
                  key={opt}
                  style={styles.option}
                  onPress={() => setServiceDraft(d => active ? d.filter(x => x !== opt) : [...d, opt])}
                >
                  <Text style={[styles.optionText, active && styles.optionActive]}>{opt}</Text>
                  {active && <Ionicons name="checkmark" size={20} color={colors.ink} />}
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity
              style={[styles.option, { borderBottomWidth: 0 }]}
              onPress={() => {
                setServiceDraft([]); // stays open; Save applies it
              }}
            >
              <Text style={[styles.optionText, styles.showAllText]}>remove selected filters</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Price filter: drag the slider, then Save */}
      <Modal visible={priceModal} transparent animationType="slide" onRequestClose={() => setPriceModal(false)}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={() => setPriceModal(false)}>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, { marginBottom: 0 }]}>Price range</Text>
              <TouchableOpacity
                style={styles.saveButton}
                onPress={() => {
                  setPriceRange(isFullPriceRange(priceDraft) ? null : priceDraft);
                  setPriceModal(false);
                }}
              >
                <Text style={styles.saveText}>Save</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.sliderWrap}>
              <PriceRangeSlider
                min={PRICE_MIN}
                max={PRICE_MAX}
                step={PRICE_STEP}
                value={priceDraft}
                onChange={setPriceDraft}
              />
            </View>
            <TouchableOpacity
              style={[styles.option, { borderBottomWidth: 0 }]}
              onPress={() => setPriceDraft(FULL_PRICE_RANGE)} // stays open; Save applies it
            >
              <Text style={[styles.optionText, styles.anyPriceText, isFullPriceRange(priceDraft) && styles.optionBold]}>Any price</Text>
              {isFullPriceRange(priceDraft) && <Ionicons name="checkmark" size={20} color={colors.blue} />}
            </TouchableOpacity>
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
                accentColor={colors.blue}
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


const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    paddingHorizontal: 14,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#f2f2f2',
  },
  searchInput: { flex: 1, fontSize: 16, color: colors.ink },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16, marginTop: 8, marginBottom: 12 },
  filterButton: { width: 46, height: 46, borderRadius: 23, backgroundColor: '#f2f2f2', alignItems: 'center', justifyContent: 'center' },
  filterDot: { position: 'absolute', top: 10, right: 11, width: 8, height: 8, borderRadius: 4, backgroundColor: colors.yellow },
  filterMenuLabel: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  filterMenuAny: { color: '#888' },
  clearFilters: { alignSelf: 'flex-start', paddingTop: 14 },
  clearFiltersText: { color: colors.ink, fontSize: 15, fontWeight: '600' },
  mapHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 10,
  },
  sectionTitle: { fontSize: 20, fontFamily: fonts.title, color: colors.ink },
  mapWrap: { marginHorizontal: 16, borderRadius: 16, overflow: 'hidden', height: 280 },
  map: { flex: 1 },
  mapPin: { width: 22, height: 36 },
  feed: { flexDirection: 'row', paddingHorizontal: 12, paddingTop: 12, gap: 8 },
  feedCol: { flex: 1, gap: 8 },
  tile: { borderRadius: 14, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  tileImage: { width: '100%', height: '100%' },
  feedHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: 16, marginTop: 24 },
  starTitle: { position: 'relative' },
  // sits at the lower-left of the "g" in "get inspired", partly tucked behind it
  star: { position: 'absolute', width: 44, height: 44, left: -12, top: -21.5 },
  starsDouble: { position: 'absolute', width: 48, height: 47, right: -30, top: -22 },
  feedNotice: { color: colors.ink, fontSize: 13, marginHorizontal: 16, marginTop: 10 },
  feedStatus: { marginHorizontal: 16, marginTop: 15, padding: 16, backgroundColor: '#FFF1F4', borderRadius: 12 },
  feedError: { color: '#A12339', fontSize: 13, lineHeight: 19 },
  retryText: { color: '#A12339', fontWeight: '700', marginTop: 10 },
  feedEmpty: { color: colors.ink, fontSize: 14, marginHorizontal: 16, marginTop: 20, marginBottom: 28 },
  favBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.pink,
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
    top: -30,
    width: 190,
    left: (TARGET_SIZE - 190) / 2,
    alignItems: 'center',
  },
  bubbleLabelText: {
    backgroundColor: colors.wine,
    color: colors.pink,
    fontSize: 11,
    fontWeight: '600',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
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
    backgroundColor: colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 36,
  },
  sheetTitle: { fontSize: 18, fontFamily: fonts.title, color: colors.ink, marginBottom: 8 },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  saveButton: { backgroundColor: colors.blue, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 14 },
  saveText: { color: colors.background, fontSize: 14, fontWeight: '600' },
  option: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ddd',
  },
  showAllText: { fontStyle: 'italic', color: colors.blue },
  anyPriceText: { color: colors.blue },
  sliderWrap: { paddingTop: 12, paddingBottom: 18 },
  optionBold: { fontWeight: '600' },
  optionText: { fontSize: 16 },
  optionActive: { color: colors.ink, fontWeight: '600' },
  dateButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 20,
    marginTop: 8,
  },
  cancel: { fontSize: 16, color: colors.ink },
  doneButton: { backgroundColor: colors.blue, paddingHorizontal: 22, paddingVertical: 9, borderRadius: 8 },
  doneText: { color: colors.background, fontSize: 16, fontWeight: '600' },
});
