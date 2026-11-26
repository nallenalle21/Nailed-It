import { Text } from '../../components/AppText';   // in src/components use './AppText'
import { colors, fonts } from '../../theme';
import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../../services/supabase';
import { publicPostUrl, type VendorPost } from '../../services/vendorPortfolio';
import SaveToBoardModal from '../../components/SaveToBoardModal';
import ExploreSearch from '../../components/ExploreSearch';
import PageHeader from '../../components/PageHeader';
import PhotoBookSheet, { type SheetPhoto } from '../../components/PhotoBookSheet';
import { fetchCreatorsAvailableOn, toDateKey } from '../../services/booking';
import {
  BOOK_SORTS,
  FEED_SORTS,
  findBookableCreatorsForServices,
  sortFeedPosts,
  type BookSort,
  type FeedSort,
} from '../../services/findBooking';
import PriceRangeSlider from '../../components/PriceRangeSlider';
import { HIDDEN_SPINNER, RefreshStar } from '../../components/SparkleStars';
import { getSavedTargetIds } from '../../services/wishlist';
import {
  View,
  Image,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
  ScrollView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Animated,
  LayoutChangeEvent,
  ViewInstance,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
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

// The Explore feed uses the actual posts uploaded to Supabase by creators.
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

/** A row in the filter menu; `any` is what's shown when it's not set (default "Any"). */
type FilterPage = 'menu' | 'sort' | 'service' | 'price' | 'date';

// The filter sheet is the same height on every page: exactly what the date page needs
// (title + the iOS calendar + "Any date"), so there's no empty space under it.
// The calendar's real height is measured once on the phone; this is the first guess.
let measuredCalendarHeight = 330;
const FILTER_SHEET_PADDING = 20;   // top and bottom
const FILTER_HEADER_HEIGHT = 40;   // title row + its margin
const FILTER_ROW_HEIGHT = 50;      // one option row ("Any date")
const FILTER_MIN_BODY = (SERVICES.length + 1) * FILTER_ROW_HEIGHT; // the service list + "remove selected filters"
type FilterRow = { icon: keyof typeof Ionicons.glyphMap; label: string; value: string | null; any?: string; page: FilterPage };

export default function ExploreCreator({ navigation }: any) {
  const [inspoPosts, setInspoPosts] = useState<InspoItem[]>([]);
  const [offeredServices, setOfferedServices] = useState<OfferedService[]>([]);
  const [feedLoading, setFeedLoading] = useState(true);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [feedWarning, setFeedWarning] = useState<string | null>(null);
  const [feedRefresh, setFeedRefresh] = useState(0);
  // Explore shows either the inspiration feed or the "Book" view; remembered on this phone.
  // Freelancers only have the Feed in Explore (no booking): no Feed/Book tabs.
  const mode = 'inspire' as 'inspire' | 'book';
  // Book view → booking sheet: who, and the time/service to pre-select.
  // Photo tapped in the feed (opens the "Book this look" sheet).
  const [sheetPhoto, setSheetPhoto] = useState<SheetPhoto | null>(null);
  // Swipe to the next tab, except while a photo is open (then sideways swipes go through the photos).
  useEffect(() => { navigation.setOptions({ swipeEnabled: !sheetPhoto }); }, [navigation, sheetPhoto]);
  // The open photo stays open while you book or look at the profile, so Back/Cancel returns to it.
  // The signed-in freelancer: their own card is left out of the Book view.
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

  // Text the photo feed is filtered by; typing in the search only searches people (see ExploreSearch).
  const [feedQuery, setFeedQuery] = useState('');
  const [services, setServices] = useState<string[]>([]);         // several can be chosen
  const [serviceDraft, setServiceDraft] = useState<string[]>([]); // edited in the sheet until Save
  const [priceRange, setPriceRange] = useState<PriceRange | null>(null); // null = any price
  const [date, setDate] = useState<Date | null>(null);

  const [priceDraft, setPriceDraft] = useState<PriceRange>(FULL_PRICE_RANGE); // edited in the sheet until Save
  // Which part of the filter sheet is shown, and the edits made there until Save.
  const [filterPage, setFilterPage] = useState<FilterPage>('menu');
  const [dateDraft, setDateDraft] = useState<Date | null>(null);
  const [androidDatePicker, setAndroidDatePicker] = useState(false);
  const [calendarHeight, setCalendarHeight] = useState(measuredCalendarHeight);
  const filterSheetHeight = FILTER_SHEET_PADDING * 2 + FILTER_HEADER_HEIGHT + Math.max(
    Platform.OS === 'ios' ? calendarHeight + FILTER_ROW_HEIGHT : 0,
    FILTER_MIN_BODY, // Android has no inline calendar: the service list is the biggest page there
  );
  const [filterMenu, setFilterMenu] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false); // search bar shown (header search icon)
  // "Sort by" in the filter menu: each tab has its own (Book: nail techs, Feed: photos).
  const [sort, setSort] = useState<BookSort>('next');
  const [feedSort, setFeedSort] = useState<FeedSort>('newest');
  const [sortDraft, setSortDraft] = useState<FeedSort>('newest');

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
        // Same feed as customers: freelancers who finished their setup, plus always your own photos.
        const { data: { user: me } } = await supabase.auth.getUser();
        const creatorsResult = await supabase.from('profiles')
          .select('id, username')
          .eq('role', 'creator')
          .or(me ? `is_live.eq.true,id.eq.${me.id}` : 'is_live.eq.true');
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
  }, [feedRefresh])); // eslint-disable-line react-hooks/exhaustive-deps -- reload trigger

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
      params: { vendorId, from: 'Explore' }, // the profile's back goes back here (to the open photo)
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
    const q = feedQuery.trim().toLowerCase();
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
  }, [inspoPosts, servicesByVendor, feedQuery, services, priceRange]);

  const filtersActive = services.length > 0 || !!priceRange || !!date || (mode === 'book' ? sort !== 'next' : feedSort !== 'newest');
  const clearFilters = () => {
    setServices([]);
    setPriceRange(null);
    setDate(null);
    setSort('next');
    setFeedSort('newest');
  };
  // Close the filter menu first: iOS can't present a second modal while one is still open.
  // ---- Filter sheet: menu → a filter (edit a draft) → Save applies it and goes back to the menu ----
  const openFilterPage = (page: FilterPage) => {
    if (page === 'sort') setSortDraft(mode === 'book' ? sort : feedSort);
    if (page === 'service') setServiceDraft(services);
    if (page === 'price') setPriceDraft(priceRange ?? FULL_PRICE_RANGE);
    if (page === 'date') setDateDraft(date);
    setFilterPage(page);
  };
  const saveFilterPage = () => {
    if (filterPage === 'sort') {
      if (mode === 'book') setSort(sortDraft === 'newest' ? 'next' : sortDraft);
      else setFeedSort(sortDraft);
    }
    if (filterPage === 'service') setServices(serviceDraft);
    if (filterPage === 'price') setPriceRange(isFullPriceRange(priceDraft) ? null : priceDraft);
    if (filterPage === 'date') setDate(dateDraft);
    setFilterPage('menu');
  };
  const closeFilters = () => {
    setFilterMenu(false);
    setFilterPage('menu');
    setAndroidDatePicker(false);
  };

  // Split inspo into two columns for the masonry layout
  const dateKey = date ? toDateKey(date) : null;
  // Date filter (same as customers): freelancers with free time on the chosen date.
  const availabilityKey = dateKey ? `${dateKey}|${feedRefresh}` : null;
  const [availability, setAvailability] = useState<{ key: string; ids: Set<string> } | null>(null);
  const availableIds = availability && availability.key === availabilityKey ? availability.ids : null;
  useEffect(() => {
    if (!dateKey || !availabilityKey) return;
    let active = true;
    fetchCreatorsAvailableOn(dateKey)
      .then(ids => active && setAvailability({ key: availabilityKey, ids }))
      .catch(() => active && setAvailability({ key: availabilityKey, ids: new Set() }));
    return () => { active = false; };
  }, [dateKey, availabilityKey]);
  const datedPosts = useMemo(
    () => (dateKey && !PROTOTYPE_POSTS_MATCH_ALL_FILTERS ? filteredPosts.filter(p => availableIds?.has(p.vendorId)) : filteredPosts),
    [filteredPosts, dateKey, availableIds],
  );

  // ---- Feed "Sort by": by the nail tech's from-price or next free time ----
  // From-price: their cheapest service (among the chosen services, if any are filtered).
  const vendorFromPrice = useCallback((vendorId: string) => {
    const selected = services.map(sv => sv.toLowerCase());
    const prices = (servicesByVendor.get(vendorId) ?? [])
      .filter(s => !selected.length || selected.some(sel =>
        s.name.toLowerCase().includes(sel) || (s.category || '').toLowerCase().includes(sel)))
      .map(s => Number(s.discount_price ?? s.price))
      .filter(Number.isFinite);
    return prices.length ? Math.min(...prices) : null;
  }, [servicesByVendor, services]);

  // Next free times are only loaded when the feed is sorted by them.
  const firstFreeKey = feedSort === 'next' ? `${dateKey ?? ''}|${services.join(',')}|${feedRefresh}` : null;
  const [firstFree, setFirstFree] = useState<{ key: string; byVendor: Map<string, string> } | null>(null);
  useEffect(() => {
    if (!firstFreeKey) return;
    let active = true;
    findBookableCreatorsForServices({ date: dateKey, services })
      .then((list) => {
        if (!active) return;
        const byVendor = new Map<string, string>();
        for (const c of list) if (c.nextTimes[0]) byVendor.set(c.id, `${c.nextTimes[0].date} ${c.nextTimes[0].start}`);
        setFirstFree({ key: firstFreeKey, byVendor });
      })
      .catch((e) => console.warn('[Explore] Could not load free times for sorting:', e instanceof Error ? e.message : e));
    return () => { active = false; };
  }, [firstFreeKey]); // eslint-disable-line react-hooks/exhaustive-deps -- the key covers date, services and refresh

  const sortedPosts = useMemo(() => sortFeedPosts(
    datedPosts,
    feedSort,
    vendorFromPrice,
    (vendorId) => (firstFree?.key === firstFreeKey ? firstFree.byVendor.get(vendorId) ?? null : null),
  ), [datedPosts, feedSort, vendorFromPrice, firstFree, firstFreeKey]);

  // Split inspo into two columns for the masonry layout (left, right, left, right… in sorted order)
  const colA = sortedPosts.filter((_, i) => i % 2 === 0);
  const colB = sortedPosts.filter((_, i) => i % 2 === 1);



  const renderTile = (item: InspoItem) => (
    <InspoTile
      key={item.id}
      item={item}
      favorite={favorites.has(item.id)}
      onStart={handleDragStart}
      onMove={handleDragMove}
      onEnd={handleDragEnd}
      onTap={() => setSheetPhoto(item)}
    />
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Title in the middle, search + filters on the right */}
      <PageHeader
        left={
          <TouchableOpacity style={styles.headerButton} onPress={() => setFeedRefresh(n => n + 1)} accessibilityLabel="Refresh creator photos">
            <Ionicons name="refresh" size={21} color={colors.blue} />
          </TouchableOpacity>
        }
        title={
          <View style={styles.starTitle}>
            <Image source={require('../../../assets/images/star.png')} style={styles.star} />
            <Text style={styles.sectionTitle}>get inspired</Text>
          </View>
        }
        right={
          <>
            <TouchableOpacity style={styles.headerButton} onPress={() => setSearchOpen(true)} accessibilityLabel="Search usernames">
              <Ionicons name="search" size={21} color={colors.blue} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.headerButton} onPress={() => setFilterMenu(true)} accessibilityLabel="Filter by service, price and date">
              <Ionicons name="options-outline" size={22} color={colors.blue} />
              {filtersActive ? <View style={styles.filterDot} /> : null}
            </TouchableOpacity>
          </>
        }
      />
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
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 32 }}
        >
          {/* PART 1: search (people, Instagram-style), opened from the header's search icon */}
          <ExploreSearch
            feedQuery={feedQuery}
            onFeedQueryChange={setFeedQuery}
            onOpenProfile={goToProfile}
            placeholder="search usernames"
            open={searchOpen}
            onClose={() => setSearchOpen(false)}
          >
            <>
            {/* PART 2: real artwork feed */}
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
            </>
          </ExploreSearch>
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

      {/* Filters: one sheet. The menu lists the filters; each one opens in the same sheet
          with a back arrow and Save, and Save brings you back to the menu (not out of it). */}
      <Modal visible={filterMenu} transparent animationType="slide" onRequestClose={closeFilters}>
        <View style={styles.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeFilters} accessibilityLabel="Close filters" />
          <View style={[styles.sheet, { height: filterSheetHeight }]}>
            {/* Measures the iOS calendar once (invisible), so the sheet fits it exactly */}
            {Platform.OS === 'ios' && calendarHeight === 330 && (
              <View style={styles.measure} pointerEvents="none"
                onLayout={(e) => {
                  measuredCalendarHeight = Math.ceil(e.nativeEvent.layout.height) || 330;
                  setCalendarHeight(measuredCalendarHeight);
                }}>
                <DateTimePicker value={new Date()} mode="date" display="inline" onChange={() => {}} />
              </View>
            )}
            {filterPage === 'menu' ? (
              <>
                <View style={styles.sheetHeader}>
                  <Text style={[styles.sheetTitle, { marginBottom: 0 }]}>Filters</Text>
                  <TouchableOpacity style={styles.saveButton} onPress={closeFilters}>
                    <Text style={styles.saveText}>Done</Text>
                  </TouchableOpacity>
                </View>
                <ScrollView style={styles.filterBody} showsVerticalScrollIndicator={false}>
                {([
                  // Sort by: each tab has its own order (shown in grey while it's the default).
                  mode === 'book'
                    ? { icon: 'swap-vertical-outline', label: 'Sort by', any: 'First available', page: 'sort',
                        value: sort === 'next' ? null : BOOK_SORTS.find(o => o.value === sort)!.label }
                    : { icon: 'swap-vertical-outline', label: 'Sort by', page: 'sort',
                        value: feedSort === 'newest' ? null : FEED_SORTS.find(o => o.value === feedSort)!.label },
                  { icon: 'brush-outline', label: 'Service', page: 'service',
                    value: services.length > 1 ? `${services.length} selected` : services[0] ?? null },
                  { icon: 'cash-outline', label: 'Price', page: 'price', value: priceRange ? formatPriceRange(priceRange) : null },
                  { icon: 'calendar-outline', label: 'Date', page: 'date', value: date ? formatDate(date) : null },
                ] as FilterRow[]).map(row => (
                  <TouchableOpacity key={row.label} style={styles.option} onPress={() => openFilterPage(row.page)}>
                    <View style={styles.filterMenuLabel}>
                      <Ionicons name={row.icon} size={18} color={colors.ink} />
                      <Text style={styles.optionText}>{row.label}</Text>
                    </View>
                    <View style={styles.filterMenuLabel}>
                      <Text style={[styles.optionText, row.value ? styles.optionActive : styles.filterMenuAny]}>
                        {row.value ?? row.any ?? 'Any'}
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
                </ScrollView>
              </>
            ) : (
              <>
                {/* ← back to the menu (discards changes) · title · Save (applies, back to the menu) */}
                <View style={styles.sheetHeader}>
                  <View style={styles.headerLeft}>
                    <TouchableOpacity onPress={() => setFilterPage('menu')} hitSlop={12} accessibilityLabel="Back to filters">
                      <Ionicons name="chevron-back" size={24} color={colors.ink} />
                    </TouchableOpacity>
                    <Text style={[styles.sheetTitle, { marginBottom: 0 }]}>
                      {filterPage === 'sort' ? 'Sort by' : filterPage === 'service' ? 'Type of service' : filterPage === 'price' ? 'Price range' : 'Choose date'}
                    </Text>
                  </View>
                  <TouchableOpacity style={styles.saveButton} onPress={saveFilterPage}>
                    <Text style={styles.saveText}>Save</Text>
                  </TouchableOpacity>
                </View>

                <ScrollView style={styles.filterBody} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                {filterPage === 'sort' && (mode === 'book' ? BOOK_SORTS : FEED_SORTS).map(opt => {
                  const active = sortDraft === opt.value;
                  return (
                    <TouchableOpacity key={opt.value} style={styles.option} onPress={() => setSortDraft(opt.value)}
                      accessibilityState={{ selected: active }}>
                      <Text style={[styles.optionText, active && styles.optionActive]}>{opt.label}</Text>
                      {active && <Ionicons name="checkmark" size={20} color={colors.ink} />}
                    </TouchableOpacity>
                  );
                })}
                {filterPage === 'sort' && mode !== 'book' && sortDraft !== 'newest' && (
                  // Feed only: back to no sort (newest photos first)
                  <TouchableOpacity style={[styles.option, { borderBottomWidth: 0 }]} onPress={() => setSortDraft('newest')}>
                    <Text style={[styles.optionText, styles.showAllText]}>remove selected sort</Text>
                  </TouchableOpacity>
                )}

                {filterPage === 'service' && (
                  <>
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
                    <TouchableOpacity style={[styles.option, { borderBottomWidth: 0 }]} onPress={() => setServiceDraft([])}>
                      <Text style={[styles.optionText, styles.showAllText]}>remove selected filters</Text>
                    </TouchableOpacity>
                  </>
                )}

                {filterPage === 'price' && (
                  <>
                    <View style={styles.sliderWrap}>
                      <PriceRangeSlider min={PRICE_MIN} max={PRICE_MAX} step={PRICE_STEP} value={priceDraft} onChange={setPriceDraft} />
                    </View>
                    <TouchableOpacity style={[styles.option, { borderBottomWidth: 0 }]} onPress={() => setPriceDraft(FULL_PRICE_RANGE)}>
                      <Text style={[styles.optionText, styles.anyPriceText, isFullPriceRange(priceDraft) && styles.optionBold]}>Any price</Text>
                      {isFullPriceRange(priceDraft) && <Ionicons name="checkmark" size={20} color={colors.blue} />}
                    </TouchableOpacity>
                  </>
                )}

                {filterPage === 'date' && (
                  <>
                    {Platform.OS === 'ios' ? (
                      <DateTimePicker
                        value={dateDraft ?? new Date()}
                        mode="date"
                        display="inline"
                        minimumDate={new Date()}
                        accentColor={colors.blue}
                        onChange={(_, d) => d && setDateDraft(d)}
                      />
                    ) : (
                      // Android shows its calendar as a dialog: open it from here.
                      <TouchableOpacity style={styles.option} onPress={() => setAndroidDatePicker(true)}>
                        <Text style={[styles.optionText, dateDraft && styles.optionActive]}>
                          {dateDraft ? formatDate(dateDraft) : 'Pick a date'}
                        </Text>
                        <Ionicons name="calendar-outline" size={20} color={colors.ink} />
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity style={[styles.option, { borderBottomWidth: 0 }]} onPress={() => setDateDraft(null)}>
                      <Text style={[styles.optionText, styles.anyPriceText, !dateDraft && styles.optionBold]}>Any date</Text>
                      {!dateDraft && <Ionicons name="checkmark" size={20} color={colors.blue} />}
                    </TouchableOpacity>
                    {Platform.OS === 'android' && androidDatePicker && (
                      <DateTimePicker
                        value={dateDraft ?? new Date()}
                        mode="date"
                        minimumDate={new Date()}
                        onChange={(e, d) => {
                          setAndroidDatePicker(false);
                          if (e.type === 'set' && d) setDateDraft(d);
                        }}
                      />
                    )}
                  </>
                )}
                </ScrollView>
              </>
            )}
          </View>
        </View>
      </Modal>

      <PhotoBookSheet
        photos={sortedPosts}
        openId={sheetPhoto?.id ?? null}
        savedIds={favorites}
        onSavedChanged={() => void reloadFavorites()}
        onClose={() => setSheetPhoto(null)}
        onOpenProfile={goToProfile}
      />
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
  onTap,
}: {
  item: InspoItem;
  favorite: boolean;
  onStart: (id: string, x: number, y: number) => void;
  onMove: (x: number, y: number) => void;
  onEnd: () => void;
  /** Quick tap: open the "Book this look" sheet. Holding still starts the drag. */
  onTap: () => void;
}) {
  const drag = Gesture.Pan()
    .runOnJS(true)
    .activateAfterLongPress(350)
    .onStart((e) => onStart(item.id, e.absoluteX, e.absoluteY))
    .onUpdate((e) => onMove(e.absoluteX, e.absoluteY))
    .onFinalize(() => onEnd());
  // A tap is anything shorter than the long-press (350 ms), so a slightly slow tap still opens the photo.
  const tap = Gesture.Tap().runOnJS(true).maxDuration(349).maxDistance(12).onEnd((_e, success) => { if (success) onTap(); });
  const gesture = Gesture.Exclusive(drag, tap);

  // Which photo failed to load, so a new photo gets a fresh try.
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const imageFailed = failedUri === item.uri;

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
            onError={() => setFailedUri(item.uri)}
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
  const [scale] = useState(() => new Animated.Value(0.5));

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
  modeToggle: { flexDirection: 'row', marginHorizontal: 16, marginBottom: 14, padding: 4, borderRadius: 16, backgroundColor: '#f2f2f2' },
  modeOption: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 9, borderRadius: 12 },
  modeOptionActive: { backgroundColor: colors.pink },
  modeText: { fontSize: 14, fontWeight: '600', color: colors.ink },
  modeTextActive: { color: colors.wine, fontWeight: '700' },
  // Search / filter / refresh icons in the page header (same height as the calendar's view button)
  headerButton: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  filterDot: { position: 'absolute', top: 4, right: 4, width: 8, height: 8, borderRadius: 4, backgroundColor: colors.yellow },
  filterMenuLabel: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  filterMenuAny: { color: '#888' },
  clearFilters: { alignSelf: 'flex-start', paddingTop: 14 },
  clearFiltersText: { color: colors.ink, fontSize: 15, fontWeight: '600' },
  sectionTitle: { fontSize: 20, fontFamily: fonts.title, color: colors.ink },
  mapWrap: { marginHorizontal: 16, borderRadius: 16, overflow: 'hidden', height: 280 },
  map: { flex: 1 },
  mapPin: { width: 22, height: 36 },
  feed: { flexDirection: 'row', paddingHorizontal: 12, paddingTop: 12, gap: 8 },
  feedCol: { flex: 1, gap: 8 },
  tile: { borderRadius: 14, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  tileImage: { width: '100%', height: '100%' },
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
  // Same size for the filter menu and every filter (height set in the component: fits the date page).
  sheet: {
    maxHeight: '90%', // small phones: the content scrolls instead
    backgroundColor: colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: FILTER_SHEET_PADDING,
  },
  measure: { position: 'absolute', left: FILTER_SHEET_PADDING, right: FILTER_SHEET_PADDING, top: 0, opacity: 0 },
  filterBody: { flex: 1 },
  sheetTitle: { fontSize: 18, fontFamily: fonts.title, color: colors.ink, marginBottom: 8 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', height: 32, marginBottom: 8 },
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
});
