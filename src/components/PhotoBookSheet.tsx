import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  BackHandler,
  Easing,
  FlatList,
  Image,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useIsFocused } from '@react-navigation/native';
import { Text } from './AppText';
import { colors, fonts } from '../theme';
import { handle } from '../utils/handle';
import { formatKr } from '../services/booking';
import { findBookableCreators, freeTimeLabel, type BookableCreator, type FreeTime } from '../services/findBooking';
import { setFave } from '../services/wishlist';
import SaveToBoardModal from './SaveToBoardModal';

export type SheetPhoto = { id: string; uri: string; caption: string; vendorId: string; creatorName: string };

type Props = {
  /** The feed, in order: swipe left/right to go to the next/previous photo. */
  photos: SheetPhoto[];
  /** The photo that was tapped; null = closed. */
  openId: string | null;
  /** Photos saved in any collection: their heart is filled. */
  savedIds: Set<string>;
  /** A photo was liked/unliked or added to/removed from a collection. */
  onSavedChanged: () => void;
  onClose: () => void;
  /** A time chip (time) or "Book this look" (null). */
  onBook: (creator: BookableCreator, time: FreeTime | null) => void;
  onOpenProfile: (creatorId: string) => void;
};

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Tapping a photo in the feed: the photo large, a heart to save it to your collections
 * (double-tap the photo to like it straight into faves), who made it, their next free times
 * and "Book this look". Swipe sideways for the next photo in the feed.
 */
export default function PhotoBookSheet({ photos, openId, savedIds, onSavedChanged, onClose, onBook, onOpenProfile }: Props) {
  const { width, height: screenHeight } = useWindowDimensions();

  // The feed as it was when the sheet opened, so a refresh behind it doesn't move the pages.
  const [pages, setPages] = useState<SheetPhoto[]>([]);
  const [startIndex, setStartIndex] = useState(0);
  const [index, setIndex] = useState(0);
  const [openedFor, setOpenedFor] = useState<string | null>(null);
  if (openId !== openedFor) {
    // Opened (or closed): start at the tapped photo.
    setOpenedFor(openId);
    if (openId) {
      const at = Math.max(0, photos.findIndex((p) => p.id === openId));
      setPages(photos);
      setStartIndex(at);
      setIndex(at);
    }
  }
  // Pages fill the space under the handle (a sideways list doesn't size them by itself).
  const [pageHeight, setPageHeight] = useState(0);
  // The sheet is as tall as the photo's page needs (no empty space at the bottom), at most 92%.
  const [contentHeights, setContentHeights] = useState<Record<string, number>>({});

  // Each nail tech's free times, loaded when their photo is shown (and the next one, so swiping feels instant).
  const [creators, setCreators] = useState<Record<string, BookableCreator | null>>({});
  const requested = useRef(new Set<string>());
  useEffect(() => {
    if (!openId) return;
    for (const p of [pages[index], pages[index + 1]]) {
      if (!p || requested.current.has(p.vendorId)) continue;
      const vendorId = p.vendorId;
      requested.current.add(vendorId);
      findBookableCreators({ creatorId: vendorId })
        .then((list) => setCreators((prev) => ({ ...prev, [vendorId]: list[0] ?? null })))
        .catch(() => {
          requested.current.delete(vendorId); // try again next time it's shown
          setCreators((prev) => ({ ...prev, [vendorId]: null }));
        });
    }
  }, [openId, pages, index]);
  // Free times change; load them fresh each time the sheet opens.
  useEffect(() => {
    if (openId) return;
    requested.current.clear();
    setCreators({});
  }, [openId]);

  // Liked here (double-tap) before the feed's saved list has reloaded: fill the heart right away.
  const [justLiked, setJustLiked] = useState<Set<string>>(new Set());
  const isSaved = (id: string) => savedIds.has(id) || justLiked.has(id);

  /** Double-tap: like = save to faves. Already saved? Just the heart animation (like Instagram). */
  const like = async (photo: SheetPhoto) => {
    if (isSaved(photo.id)) return;
    setJustLiked((prev) => new Set(prev).add(photo.id));
    try {
      await setFave('post', photo.id, true);
      onSavedChanged();
    } catch (e) {
      setJustLiked((prev) => {
        const next = new Set(prev);
        next.delete(photo.id);
        return next;
      });
      Alert.alert('Could not save', errorMessage(e));
    }
  };

  // The heart opens the same "save to collection" sheet as the long-press "Nail it".
  // Rendered inside this modal, since iOS can't show a second modal next to an open one.
  const [collectionFor, setCollectionFor] = useState<string | null>(null);

  // ---- Open / close: slides up fast; pull the photo down to close (follows your finger). ----
  const visible = openId !== null && pages.length > 0;
  const slide = useRef(new Animated.Value(screenHeight)).current; // 0 = open, screenHeight = gone
  useEffect(() => {
    if (!visible) return;
    slide.setValue(screenHeight);
    Animated.timing(slide, { toValue: 0, duration: 200, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps -- only when it opens

  // Tap outside the photo: close right away (no animation), so the next tap works immediately.
  const closeNow = () => onClose();
  const close = () => {
    Animated.timing(slide, { toValue: screenHeight, duration: 140, easing: Easing.in(Easing.quad), useNativeDriver: true })
      .start(() => onClose());
  };
  const closeRef = useRef(close);
  closeRef.current = close;

  // Android back button closes the photo (this is a layer on the Explore screen, not a pop-up window).
  // Only while this screen is shown: on a profile opened from here, Back should go back to the photo.
  const focused = useIsFocused();
  useEffect(() => {
    if (!visible || !focused) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { closeRef.current(); return true; });
    return () => sub.remove();
  }, [visible, focused]);

  // How far each photo's page is scrolled down: pulling down only closes when it's at the top
  // (or when the pull starts above the sheet, on the dimmed area).
  const scrollY = useRef<Record<string, number>>({});
  const touchInSheet = useRef(false);
  const startedAbove = useRef(false);
  const currentId = useRef<string | null>(null);
  currentId.current = pages[index]?.id ?? null;

  const pullDown = useRef(PanResponder.create({
    // Take over only a clear downward pull, and only when the page is scrolled to the top.
    onMoveShouldSetPanResponderCapture: (_, g) =>
      g.dy > 10 && g.dy > Math.abs(g.dx) * 1.5
      && (startedAbove.current || (scrollY.current[currentId.current ?? ''] ?? 0) <= 0),
    onPanResponderMove: (_, g) => slide.setValue(Math.max(0, g.dy)),
    onPanResponderRelease: (_, g) => {
      if (g.dy > 90 || g.vy > 0.5) closeRef.current();
      else Animated.spring(slide, { toValue: 0, bounciness: 0, speed: 20, useNativeDriver: true }).start();
    },
    onPanResponderTerminate: () => {
      Animated.spring(slide, { toValue: 0, bounciness: 0, speed: 20, useNativeDriver: true }).start();
    },
  })).current;

  const SHEET_CHROME = 20 + 20; // handle on top + padding at the bottom
  const estimate = (width - 32) * 1.25 + 230; // photo + name, times and button, before it's measured
  const pageContent = contentHeights[pages[index]?.id ?? ''] ?? estimate;
  const [areaHeight, setAreaHeight] = useState(screenHeight);
  const sheetHeight = Math.min(pageContent + SHEET_CHROME, areaHeight * 0.94);

  const onSwipeEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.round(e.nativeEvent.contentOffset.x / width);
    if (next !== index && next >= 0 && next < pages.length) setIndex(next);
  };

  return (
    // A layer over the Explore screen (not a full-screen pop-up), so the bottom tabs stay
    // tappable, and a pull down anywhere (on the photo or the dimmed area above) closes it.
    <View
      style={[StyleSheet.absoluteFill, styles.backdrop, styles.layer]}
      pointerEvents={visible ? 'auto' : 'none'}
      onLayout={(e) => setAreaHeight(e.nativeEvent.layout.height)}
      onTouchStart={() => { startedAbove.current = !touchInSheet.current; touchInSheet.current = false; }}
      {...pullDown.panHandlers}
    >
      {visible && <>
        <Animated.View
          style={[StyleSheet.absoluteFill, styles.dim, { opacity: slide.interpolate({ inputRange: [0, screenHeight], outputRange: [1, 0], extrapolate: 'clamp' }) }]}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={closeNow} accessibilityLabel="Close" />
        </Animated.View>
        <Animated.View
          style={[styles.sheet, { height: sheetHeight, transform: [{ translateY: slide }] }]}
          onTouchStart={() => { touchInSheet.current = true; }}
        >
          <View style={styles.handle} />
          {openId && (
            <FlatList
              key={openId}
              style={{ flex: 1 }}
              onLayout={(e) => setPageHeight(e.nativeEvent.layout.height)}
              data={pages}
              keyExtractor={(p) => p.id}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              initialScrollIndex={startIndex}
              getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
              initialNumToRender={1}
              windowSize={3}
              onMomentumScrollEnd={onSwipeEnd}
              renderItem={({ item }) => (
                <PhotoPage
                  photo={item}
                  width={width}
                  height={pageHeight}
                  creator={creators[item.vendorId]}
                  saved={isSaved(item.id)}
                  onHeart={() => setCollectionFor(item.id)}
                  onDoubleTap={() => like(item)}
                  onScrollY={(y) => { scrollY.current[item.id] = y; }}
                  onContentHeight={(h) => setContentHeights((prev) => (prev[item.id] === h ? prev : { ...prev, [item.id]: h }))}
                  onBook={onBook}
                  onOpenProfile={onOpenProfile}
                />
              )}
            />
          )}
        </Animated.View>
      </>}

      <SaveToBoardModal
        visible={collectionFor !== null}
        kind="post"
        targetId={collectionFor}
        onClose={() => setCollectionFor(null)}
        onChanged={() => {
          // Removed from every collection here: don't keep showing the double-tap like.
          if (collectionFor) setJustLiked((prev) => { const next = new Set(prev); next.delete(collectionFor); return next; });
          onSavedChanged();
        }}
      />
    </View>
  );
}

/** One photo in the pager. `creator` is undefined while their times load, null if they have none. */
const DOUBLE_TAP_MS = 280;
const POP_SIZE = 96;

function PhotoPage({ photo, width, height, creator, saved, onHeart, onDoubleTap, onScrollY, onContentHeight, onBook, onOpenProfile }: {
  photo: SheetPhoto;
  width: number;
  height: number;
  creator: BookableCreator | null | undefined;
  saved: boolean;
  /** The heart: choose collections. */
  onHeart: () => void;
  /** Double-tap on the photo: like it. */
  onDoubleTap: () => void;
  /** How far this page is scrolled (pull-down-to-close only works at the top). */
  onScrollY: (y: number) => void;
  /** How tall this page's content is, so the sheet can fit it. */
  onContentHeight: (h: number) => void;
  onBook: (creator: BookableCreator, time: FreeTime | null) => void;
  onOpenProfile: (creatorId: string) => void;
}) {
  const loading = creator === undefined;

  // Double-tap the photo to like it, with a big heart that pops up and fades.
  const lastTap = useRef(0);
  const [photoSize, setPhotoSize] = useState({ w: 0, h: 0 });
  const pop = useRef(new Animated.Value(0)).current;
  const onPhotoPress = () => {
    const now = Date.now();
    if (now - lastTap.current < DOUBLE_TAP_MS) {
      lastTap.current = 0;
      onDoubleTap();
      pop.setValue(0);
      Animated.sequence([
        Animated.spring(pop, { toValue: 1, friction: 4, useNativeDriver: true }),
        Animated.timing(pop, { toValue: 0, duration: 250, delay: 350, useNativeDriver: true }),
      ]).start();
    } else {
      lastTap.current = now;
    }
  };
  return (
    <ScrollView
      style={{ width, height: height || undefined }}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.page}
      bounces={false} // at the top, pulling down closes the sheet instead
      scrollEventThrottle={16}
      onScroll={(e) => onScrollY(e.nativeEvent.contentOffset.y)}
      onContentSizeChange={(_, h) => onContentHeight(Math.ceil(h))}
    >
      {/* The photo, with the heart on it in the bottom-right corner */}
      <View style={styles.photo} onLayout={(e) => setPhotoSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onPhotoPress} accessibilityHint="Double-tap to like">
          <Image source={{ uri: photo.uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        </Pressable>
        <Animated.View
          pointerEvents="none"
          style={[styles.pop, { left: photoSize.w / 2 - POP_SIZE / 2, top: photoSize.h / 2 - POP_SIZE / 2, opacity: pop, transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }] }]}
        >
          <Ionicons name="heart" size={POP_SIZE} color={colors.pink} />
        </Animated.View>
        <TouchableOpacity
          style={[styles.roundButton, styles.heartButton]}
          onPress={onHeart}
          accessibilityRole="button"
          accessibilityState={{ selected: saved }}
          accessibilityLabel={saved ? 'Saved. Edit collections' : 'Save to a collection'}
          hitSlop={6}
        >
          <Ionicons name={saved ? 'heart' : 'heart-outline'} size={24} color={saved ? colors.pink : colors.wine} />
        </TouchableOpacity>
      </View>
      {photo.caption ? <Text style={styles.caption}>{photo.caption}</Text> : null}

      <TouchableOpacity style={styles.who} onPress={() => onOpenProfile(photo.vendorId)}>
        <View style={styles.avatar}>
          {creator?.avatarUrl ? <Image source={{ uri: creator.avatarUrl }} style={styles.avatarPhoto} />
            : <Text style={styles.avatarInitial}>{(photo.creatorName || '?').replace('@', '').charAt(0).toUpperCase()}</Text>}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.name} numberOfLines={1}>{handle(photo.creatorName)}</Text>
          <Text style={styles.details} numberOfLines={1}>
            {[creator?.city, creator?.fromPrice != null ? `from ${formatKr(creator.fromPrice)}` : null].filter(Boolean).join(' · ') || 'View profile'}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.inkMuted} />
      </TouchableOpacity>

      {loading ? (
        <ActivityIndicator style={{ marginVertical: 16 }} color={colors.blue} />
      ) : creator && creator.nextTimes.length > 0 ? (
        <>
          <Text style={styles.timesLabel}>Next free</Text>
          <View style={styles.times}>
            {creator.nextTimes.map((t) => (
              <TouchableOpacity key={`${t.date}-${t.start}`} style={styles.time} onPress={() => onBook(creator, t)}>
                <Text style={styles.timeText}>{freeTimeLabel(t)}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      ) : (
        <Text style={styles.noTimes}>
          {creator ? 'No free times in the next 2 weeks.' : 'This nail tech hasn’t added any services yet.'}
        </Text>
      )}

      <TouchableOpacity
        style={[styles.book, !creator && styles.bookDisabled]}
        disabled={!creator}
        onPress={() => creator && onBook(creator, null)}
      >
        <Ionicons name="calendar-outline" size={18} color={colors.wine} />
        <Text style={styles.bookText}>All times</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end' },
  layer: { zIndex: 20, elevation: 20 },
  dim: { backgroundColor: 'rgba(11,21,14,0.45)' },
  sheet: { backgroundColor: colors.background, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingBottom: 20 },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.line, marginTop: 10, marginBottom: 6 },
  page: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8 },
  photo: { width: '100%', aspectRatio: 4 / 5, borderRadius: 16, overflow: 'hidden', backgroundColor: '#F1E9EE' },
  heartButton: { position: 'absolute', right: 10, bottom: 10 },
  // Placed in the middle of the photo from its measured size (see PhotoPage).
  pop: { position: 'absolute', width: POP_SIZE, height: POP_SIZE, alignItems: 'center', justifyContent: 'center', zIndex: 2, elevation: 2 },
  roundButton: {
    width: 46, height: 46, borderRadius: 23, backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 3,
  },
  caption: { fontSize: 14, color: colors.ink, marginTop: 10 },
  who: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.pinkTint, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarPhoto: { width: '100%', height: '100%' },
  avatarInitial: { fontSize: 17, fontWeight: '700', color: colors.wine },
  name: { fontSize: 15, fontFamily: fonts.title, color: colors.ink },
  details: { fontSize: 13, color: colors.inkMuted, marginTop: 1 },
  timesLabel: { fontSize: 12, color: colors.inkMuted, marginTop: 14, textTransform: 'uppercase', fontWeight: '600' },
  times: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  time: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14, backgroundColor: colors.pink },
  timeText: { fontSize: 13, fontWeight: '700', color: colors.wine },
  noTimes: { fontSize: 13, color: colors.inkMuted, marginTop: 14 },
  book: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 18, backgroundColor: colors.pink, borderRadius: 14, paddingVertical: 14 },
  bookDisabled: { opacity: 0.4 },
  bookText: { color: colors.wine, fontSize: 16, fontWeight: '700' },
});
