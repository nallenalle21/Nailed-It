import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { handle } from '../../utils/handle';
import {
  ActivityIndicator, Alert, Animated, findNodeHandle, Image, Modal, PanResponder, RefreshControl, ScrollView, StyleSheet,
  TextInput, TouchableOpacity, View, type GestureResponderEvent,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { setStatusBarStyle } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '../../components/AppText';
import PhotoBookSheet, { type SheetPhoto } from '../../components/PhotoBookSheet';
import BookingModal from '../../components/BookingModal';
import { useIsFreelancer } from '../../services/myRole';
import type { BookableCreator, FreeTime } from '../../services/findBooking';
import SparkleStars, { HIDDEN_SPINNER, RefreshStar, type SparkleStarsHandle } from '../../components/SparkleStars';
import { colors, fonts } from '../../theme';
import {
  createWishlistBoard, deleteWishlistBoard, getWishlistSnapshot,
  removeWishlistItem, renameWishlistBoard,
  type WishlistBoard, type WishlistEntry,
} from '../../services/wishlist';

const ACCENT = '#a12640';
// Custom photo order per collection ({ boardId: entryIds[] }). Stored on the device only:
// wishlist_items has no position column yet.
const ORDER_KEY = 'wishlist-order';
type Rect = { x: number; y: number; width: number; height: number };

/** Saved order first; items saved since then (not in the list) go on top, newest first. */
function applyOrder(items: WishlistEntry[], savedIds: string[] | undefined): WishlistEntry[] {
  if (!savedIds?.length) return items;
  const rank = new Map(savedIds.map((id, i) => [id, i]));
  const fresh = items.filter(item => !rank.has(item.id));
  const known = items.filter(item => rank.has(item.id)).sort((a, b) => rank.get(a.id)! - rank.get(b.id)!);
  return [...fresh, ...known];
}
const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);

function CreatorAvatar({ entry, size = 88 }: { entry: WishlistEntry; size?: number }) {
  const [failed, setFailed] = useState(false);
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: '#EDDCE4', overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
      {entry.avatarUri && !failed ? (
        <Image source={{ uri: entry.avatarUri }} style={{ width: size, height: size }} onError={() => setFailed(true)} />
      ) : <Text style={{ color: ACCENT, fontSize: size * 0.4, fontWeight: '700' }}>{entry.creatorName.charAt(0).toUpperCase()}</Text>}
    </View>
  );
}

function BoardCover({ entries }: { entries: WishlistEntry[] }) {
  const four = entries.slice(0, 4);
  return (
    <View style={styles.cover}>
      {four.length ? four.map((entry) => (
        <View key={entry.id} style={styles.coverCell}>
          {entry.kind === 'post' && entry.imageUri ? (
            <Image source={{ uri: entry.imageUri }} style={styles.coverPhoto} />
          ) : (
            <CreatorAvatar entry={entry} size={52} />
          )}
        </View>
      )) : (
        <View style={styles.emptyCover}>
          <Ionicons name="images-outline" size={36} color={colors.wine} />
          <Text style={styles.emptyCoverText}>your saved finds</Text>
        </View>
      )}
    </View>
  );
}

// Swiping back from a collection: how far (pt) and how fast (ms) the swipe has to be.
const SWIPE_BACK_DISTANCE = 70;
const SWIPE_BACK_MS = 600;

export default function WishlistScreen({ navigation }: any) {
  const isFocused = useIsFocused();

  // ---- Tap the background → a star pops there (taps on collections/photos/buttons don't count) ----
  type AnyRef = React.RefObject<any>;
  const sparkles = useRef<SparkleStarsHandle>(null);
  const rootRef = useRef<any>(null);
  const headerRef = useRef<any>(null);
  const scrollRef = useRef<any>(null);
  const contentRef = useRef<any>(null);
  const cardsRef = useRef<any>(null);
  const emptyRef = useRef<any>(null);
  const touchStart = useRef<{ x: number; y: number; t: number; target: string } | null>(null);
  const isBackground = (target: string, refs: AnyRef[]) =>
    refs.some(r => r.current && String(findNodeHandle(r.current)) === target) ||
    // the ScrollView's own inner container (its side padding)
    String(scrollRef.current?.getInnerViewNode?.()) === target;
  const [boards, setBoards] = useState<WishlistBoard[]>([]);
  const [entries, setEntries] = useState<WishlistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [formMode, setFormMode] = useState<'create' | 'rename' | null>(null);
  const [formName, setFormName] = useState('');
  const [formBoard, setFormBoard] = useState<WishlistBoard | null>(null);
  const [busy, setBusy] = useState(false);
  // Tapping a saved photo opens the same photo view as the Explore feed (like, profile, free times…).
  const [sheetPostId, setSheetPostId] = useState<string | null>(null);
  const isFreelancer = useIsFreelancer();
  const [booking, setBooking] = useState<{ creator: { id: string; name: string }; date: string | null; start: string | null; serviceIds: string[] | null } | null>(null);
  const [menuBoard, setMenuBoard] = useState<WishlistBoard | null>(null); // press-and-hold menu
  const [itemMenu, setItemMenu] = useState<WishlistEntry | null>(null);    // remove-item pop-up

  // quiet = keep showing the current collections while loading (used by pull-to-refresh).
  const reload = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const snapshot = await getWishlistSnapshot();
      setBoards(snapshot.boards);
      setEntries(snapshot.entries);
    } catch (error) {
      Alert.alert('Could not load wishlist', errorMessage(error));
    } finally { setLoading(false); }
  }, []);

  // Pull-to-refresh shows a spinning star (RefreshStar) until reloading is done.
  const [refreshing, setRefreshing] = useState(false);
  const onPullRefresh = async () => {
    setRefreshing(true);
    await reload(true);
    setRefreshing(false);
  };

  useFocusEffect(useCallback(() => {
    void reload();
    // Light clock/battery icons on the burgundy page; back to dark when leaving the tab.
    setStatusBarStyle('light');
    return () => setStatusBarStyle('dark');
  }, [reload]));

  const selectedBoard = boards.find(b => b.id === selectedBoardId) ?? null;
  const [savedOrder, setSavedOrder] = useState<Record<string, string[]>>({});
  useEffect(() => {
    AsyncStorage.getItem(ORDER_KEY)
      .then(raw => raw && setSavedOrder(JSON.parse(raw)))
      .catch(() => {});
  }, []);
  const boardEntries = useMemo(() => selectedBoard
    ? applyOrder(entries.filter(item => item.boardId === selectedBoard.id), savedOrder[selectedBoard.id])
    : [], [selectedBoard, entries, savedOrder]);

  // ---- Press-and-hold drag to reorder photos inside a collection ----
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOrder, setDragOrder] = useState<string[] | null>(null); // live order while dragging
  const drag = useRef<{ id: string; grabX: number; grabY: number; origin: { x: number; y: number }; moved: boolean } | null>(null);
  const slotRects = useRef<Rect[]>([]);   // grid slot positions by index, relative to the grid
  const gridRef = useRef<React.ComponentRef<typeof View>>(null);
  const [dragPos] = useState(() => new Animated.ValueXY());
  const [ghostWidth, setGhostWidth] = useState(0); // width of the picked-up photo
  const dragOrderRef = useRef<string[] | null>(null);
  useEffect(() => { dragOrderRef.current = dragOrder; });

  const shownEntries = dragOrder
    ? dragOrder.map(id => boardEntries.find(e => e.id === id)).filter((e): e is WishlistEntry => !!e)
    : boardEntries;

  const startDrag = (entry: WishlistEntry, index: number, pageX: number, pageY: number) => {
    const rect = slotRects.current[index];
    if (!rect || !gridRef.current) return;
    gridRef.current.measureInWindow((gx, gy) => {
      drag.current = { id: entry.id, grabX: pageX - gx - rect.x, grabY: pageY - gy - rect.y, origin: { x: gx, y: gy }, moved: false };
      dragPos.setValue({ x: rect.x, y: rect.y });
      setGhostWidth(rect.width);
      setDragOrder(boardEntries.map(e => e.id));
      setDragId(entry.id);
    });
  };

  const finishDrag = () => {
    const order = dragOrderRef.current;
    const boardId = selectedBoardId;
    drag.current = null;
    setDragId(null);
    setDragOrder(null);
    if (!order || !boardId) return;
    setSavedOrder(current => {
      const next = { ...current, [boardId]: order };
      AsyncStorage.setItem(ORDER_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  };
  const finishDragRef = useRef(finishDrag);
  useEffect(() => { finishDragRef.current = finishDrag; });

  // The grid takes over the touch once a photo has been picked up and the finger moves.
  // The handlers read the drag refs only while dragging, never during render.
  const [gridResponder] = useState(() => PanResponder.create({ // eslint-disable-line react-hooks/refs
    onMoveShouldSetPanResponderCapture: () => !!drag.current,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: () => { if (drag.current) drag.current.moved = true; },
    onPanResponderMove: (_, g) => {
      const d = drag.current;
      if (!d) return;
      const x = g.moveX - d.origin.x;
      const y = g.moveY - d.origin.y;
      dragPos.setValue({ x: x - d.grabX, y: y - d.grabY });
      const target = slotRects.current.findIndex(r => x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height);
      setDragOrder(order => {
        if (!order || target < 0) return order;
        const from = order.indexOf(d.id);
        if (from === target) return order;
        const next = order.filter(id => id !== d.id);
        next.splice(target, 0, d.id);
        return next;
      });
    },
    onPanResponderRelease: () => finishDragRef.current(),
    onPanResponderTerminate: () => finishDragRef.current(),
  }));

  const goToVendor = (vendorId: string) => {
    navigation.navigate('Vendors', {
      screen: 'VendorProfile', params: { vendorId, from: 'Wishlist' }, // back returns here (to the open photo)
    });
  };
  const openCreate = () => { setFormMode('create'); setFormName(''); setFormBoard(null); };
  const openRename = (board: WishlistBoard) => {
    setFormMode('rename'); setFormName(board.name); setFormBoard(board);
  };

  const submitForm = async () => {
    if (busy || !formName.trim()) return;
    setBusy(true);
    try {
      if (formMode === 'create') await createWishlistBoard(formName);
      if (formMode === 'rename' && formBoard) await renameWishlistBoard(formBoard, formName);
      setFormMode(null);
      await reload();
    } catch (error) {
      Alert.alert('Could not save board', errorMessage(error));
    } finally { setBusy(false); }
  };

  // Deletes right away (no confirmation). Saved creator photos themselves are not deleted.
  const deleteCollection = async (board: WishlistBoard) => {
    try {
      await deleteWishlistBoard(board);
      if (selectedBoardId === board.id) setSelectedBoardId(null);
      await reload();
    } catch (error) { Alert.alert('Could not delete collection', errorMessage(error)); }
  };
  // Press and hold a collection on the main page to manage it (custom sheet, see menuBoard modal).
  // Every collection, including the default "faves", can be renamed or deleted.
  const openCollectionMenu = (board: WishlistBoard) => setMenuBoard(board);
  // Close the sheet before the next pop-up: iOS can't show two modals at once.
  const fromCollectionMenu = (action: (board: WishlistBoard) => void) => {
    const board = menuBoard;
    setMenuBoard(null);
    if (board) setTimeout(() => action(board), 350);
  };
  // Opens the "remove item / cancel" pop-up (same design as the collection menu).
  const removeItem = (entry: WishlistEntry) => setItemMenu(entry);
  // Removes it from this collection only, not from the creator's profile.
  const confirmRemoveItem = async () => {
    const entry = itemMenu;
    setItemMenu(null);
    if (!entry) return;
    try {
      await removeWishlistItem(entry.id, entry.boardId);
      await reload();
    } catch (error) { Alert.alert('Could not remove item', errorMessage(error)); }
  };

  // ---- The Explore photo view, for this collection's photos ----
  const sheetPhotos = useMemo<SheetPhoto[]>(() => boardEntries
    .filter(e => e.kind === 'post' && e.imageUri)
    .map(e => ({ id: e.targetId, uri: e.imageUri!, caption: e.caption, vendorId: e.vendorId, creatorName: e.creatorName })),
  [boardEntries]);
  // Photos saved in any collection (the heart is filled for these).
  const savedPostIds = useMemo(() => new Set(entries.filter(e => e.kind === 'post').map(e => e.targetId)), [entries]);
  /** A free time pre-chooses its service; "All times" leaves the service open (same as Explore). */
  const bookCreator = (c: BookableCreator, time: FreeTime | null) => {
    setBooking({ creator: { id: c.id, name: c.username }, date: time?.date ?? null, start: time?.start ?? null, serviceIds: time ? [c.serviceId] : null });
  };
  // The open photo stays open while you book or look at the profile, so Back/Cancel returns to it.
  // Going back to all collections closes it.
  useEffect(() => { setSheetPostId(null); }, [selectedBoardId]);

  const renderItemMenu = () => (
    <TouchableOpacity style={styles.menuBackdrop} activeOpacity={1} onPress={() => setItemMenu(null)}>
      <View style={styles.menuSheet}>
        <Text style={styles.menuTitle} numberOfLines={1}>{handle(itemMenu?.creatorName)}</Text>
        <TouchableOpacity style={styles.menuOption} onPress={() => void confirmRemoveItem()}>
          <Text style={styles.menuText}>remove item</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.menuOption, { borderBottomWidth: 0 }]} onPress={() => setItemMenu(null)}>
          <Text style={[styles.menuText, styles.menuTextDark]}>cancel</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );

  const onBackgroundTouchStart = (e: GestureResponderEvent) => {
    const { pageX, pageY, target, timestamp } = e.nativeEvent;
    touchStart.current = { x: pageX, y: pageY, t: timestamp, target: String(target) };
  };
  const onBackgroundTouchEnd = (e: GestureResponderEvent) => {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start || dragId) return;
    const { pageX, pageY, timestamp } = e.nativeEvent;
    // Inside a collection: a quick sideways swipe goes back to all collections (like the back arrow).
    const dx = pageX - start.x;
    const dy = pageY - start.y;
    if (selectedBoard && !sheetPostId && !drag.current && Math.abs(dx) >= SWIPE_BACK_DISTANCE && Math.abs(dx) >= Math.abs(dy) * 2
      && timestamp - start.t < SWIPE_BACK_MS) {
      setSelectedBoardId(null);
      setEditing(false);
      return;
    }
    const isTap = Math.hypot(pageX - start.x, pageY - start.y) < 10 && timestamp - start.t < 400;
    if (isTap && isBackground(start.target, [rootRef, headerRef, scrollRef, contentRef, cardsRef, gridRef as AnyRef, emptyRef])) {
      sparkles.current?.popAt(pageX, pageY);
    }
  };

  return (
    <SafeAreaView
      ref={rootRef}
      style={styles.screen}
      edges={['top', 'left', 'right']}
      onTouchStart={onBackgroundTouchStart}
      onTouchEnd={onBackgroundTouchEnd}
    >
      {/* Rare decorative stars (pop-ups + shooting stars) on the main page and inside collections; paused when you leave the tab */}
      <SparkleStars ref={sparkles} active={isFocused} />
      <View ref={headerRef} style={styles.header}>
        <View style={styles.headerTitleGroup}>
          {selectedBoard && (
            <TouchableOpacity onPress={() => { setSelectedBoardId(null); setEditing(false); }} accessibilityLabel="Back to boards" style={styles.back}>
              <Ionicons name="arrow-back" size={23} color={colors.background} />
            </TouchableOpacity>
          )}
          {selectedBoard ? (
            <Text style={styles.title} numberOfLines={1}>{selectedBoard.name}</Text>
          ) : (
            <View style={styles.starTitle}>
              <Image source={require('../../../assets/images/stars-double.png')} style={styles.starsDouble} />
              <Image source={require('../../../assets/images/star.png')} style={styles.starN} />
              <Image source={require('../../../assets/images/star.png')} style={styles.starTiny} />
              <Text style={[styles.title, styles.titleCaps]}>Inspiration</Text>
            </View>
          )}
        </View>
      </View>
      {selectedBoard ? (
        <Text style={styles.subtitle}>{boardEntries.length} saved {boardEntries.length === 1 ? 'item' : 'items'}</Text>
      ) : (
        <View style={styles.titleSpacer} />
      )}
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        scrollEnabled={!dragId}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void onPullRefresh()} {...HIDDEN_SPINNER} />
        }
      >
        {/* Fills the whole scroll area so taps on empty space count as background */}
        <View ref={contentRef} style={{ flexGrow: 1 }}>
        {loading && <ActivityIndicator size="large" color={colors.background} style={{ marginTop: 45 }} />}
        {!loading && !selectedBoard && (
          <View ref={cardsRef} style={styles.cards}>
            {boards.map(board => {
              const items = entries.filter(item => item.boardId === board.id);
              return (
                <View key={board.id} style={styles.boardCard}>
                  <TouchableOpacity
                    onPress={() => { setSelectedBoardId(board.id); setEditing(false); }}
                    onLongPress={() => openCollectionMenu(board)}
                    delayLongPress={350}
                    accessibilityLabel={`Open ${board.name} collection`}
                    accessibilityHint="Press and hold to rename or delete"
                  >
                    <BoardCover entries={items} />
                    <View style={styles.boardMeta}>
                      <Text style={styles.boardName} numberOfLines={1}>{board.name}</Text>
                      <Text style={styles.count}>{items.length} {items.length === 1 ? 'pin' : 'pins'}</Text>
                    </View>
                  </TouchableOpacity>
                </View>
              );
            })}
            {/* "+" tile always sits in the next free spot after the last collection */}
            <View style={styles.boardCard}>
              <TouchableOpacity style={styles.addTile} onPress={openCreate} accessibilityLabel="Create new collection">
                <Ionicons name="add" size={44} color={colors.pink} />
              </TouchableOpacity>
            </View>
          </View>
        )}
        {!loading && selectedBoard && (
          boardEntries.length === 0 ? (
            <View ref={emptyRef} style={styles.emptyState}>
              <Ionicons name="heart-outline" size={36} color={colors.background} />
              <Text style={styles.emptyText}>Nothing saved here yet.</Text>
              <Text style={styles.emptyHint}>Long-press photos in Explore or save creators on their public profiles.</Text>
            </View>
          ) : (
            <View ref={gridRef} style={styles.cards} {...gridResponder.panHandlers}>
              {shownEntries.map((entry, index) => (
                <View
                  key={entry.id}
                  style={[styles.savedCard, dragId === entry.id && styles.dragPlaceholder]}
                  onLayout={e => { slotRects.current[index] = e.nativeEvent.layout; }}
                >
                  <TouchableOpacity
                    style={styles.savedTile}
                    delayLongPress={300}
                    onLongPress={e => { if (!editing) startDrag(entry, index, e.nativeEvent.pageX, e.nativeEvent.pageY); }}
                    // Released without moving: put the photo down again.
                    onPressOut={() => setTimeout(() => { if (drag.current && !drag.current.moved) finishDragRef.current(); }, 0)}
                    onPress={() => {
                      if (editing) { removeItem(entry); return; }
                      if (entry.kind === 'vendor') goToVendor(entry.vendorId);
                      else setSheetPostId(entry.targetId);
                    }}
                    accessibilityLabel={entry.kind === 'vendor' ? `Open ${entry.creatorName} profile` : 'Expand saved photo'}
                  >
                    {entry.kind === 'post' && entry.imageUri ? (
                      <Image source={{ uri: entry.imageUri }} style={styles.savedImage} />
                    ) : (
                      <View style={styles.profileTile}><CreatorAvatar entry={entry} size={91} /></View>
                    )}
                    {editing && <View style={styles.removeBadge}><Ionicons name="close-circle" size={23} color={ACCENT} /></View>}
                  </TouchableOpacity>
                  <Text style={styles.entryLabel} numberOfLines={1}>{handle(entry.creatorName)}</Text>
                </View>
              ))}
              {/* The picked-up photo follows the finger */}
              {dragId && (() => {
                const entry = boardEntries.find(e => e.id === dragId);
                if (!entry || !ghostWidth) return null;
                return (
                  <Animated.View
                    pointerEvents="none"
                    style={[styles.dragGhost, { width: ghostWidth, transform: [...dragPos.getTranslateTransform(), { scale: 1.05 }] }]}
                  >
                    <View style={styles.savedTile}>
                      {entry.kind === 'post' && entry.imageUri ? (
                        <Image source={{ uri: entry.imageUri }} style={styles.savedImage} />
                      ) : (
                        <View style={styles.profileTile}><CreatorAvatar entry={entry} size={91} /></View>
                      )}
                    </View>
                  </Animated.View>
                );
              })()}
            </View>
          )
        )}
        </View>
      </ScrollView>
      <RefreshStar refreshing={refreshing} y={150} />
      {/* Floating edit button (bottom-left, inside a collection only) */}
      {/* Inside a collection only: edit mode removes saved items. Collections are managed by press-and-hold. */}
      {selectedBoard && (
        <TouchableOpacity style={styles.editButton} onPress={() => setEditing(value => !value)}>
          <Text style={styles.editText}>{editing ? 'done' : 'edit'}</Text>
        </TouchableOpacity>
      )}
      <Modal visible={menuBoard !== null} transparent animationType="fade" onRequestClose={() => setMenuBoard(null)}>
        <TouchableOpacity style={styles.menuBackdrop} activeOpacity={1} onPress={() => setMenuBoard(null)}>
          <View style={styles.menuSheet}>
            <Text style={styles.menuTitle} numberOfLines={1}>{menuBoard?.name}</Text>
            <TouchableOpacity style={styles.menuOption} onPress={() => fromCollectionMenu(openRename)}>
              <Text style={[styles.menuText, styles.menuTextDark]}>rename collection</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuOption} onPress={() => fromCollectionMenu(board => void deleteCollection(board))}>
              <Text style={styles.menuText}>delete collection</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.menuOption, { borderBottomWidth: 0 }]} onPress={() => setMenuBoard(null)}>
              <Text style={[styles.menuText, styles.menuTextDark]}>cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
      {/* Remove-item pop-up (edit mode) */}
      <Modal visible={itemMenu !== null} transparent animationType="fade" onRequestClose={() => setItemMenu(null)}>
        {renderItemMenu()}
      </Modal>
      <Modal visible={formMode !== null} transparent animationType="fade" onRequestClose={() => setFormMode(null)}>
        <View style={styles.shade}>
          <View style={styles.dialog}>
            <View style={styles.dialogHeader}>
              <Text style={styles.dialogTitle}>{formMode === 'rename' ? 'rename collection' : 'new collection'}</Text>
              <TouchableOpacity onPress={() => setFormMode(null)}><Ionicons name="close" size={22} color="#151A17" /></TouchableOpacity>
            </View>
            <TextInput style={styles.input} autoFocus placeholder="e.g. wedding inspo" value={formName} onChangeText={setFormName} maxLength={60}/>
            <TouchableOpacity disabled={busy || !formName.trim()} style={styles.primaryButton} onPress={() => void submitForm()}>
              <Text style={styles.primaryText}>{busy ? 'saving…' : 'save collection'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      {/* The same photo view as in Explore: swipe through this collection's photos */}
      <PhotoBookSheet
        photos={sheetPhotos}
        openId={sheetPostId}
        savedIds={savedPostIds}
        onSavedChanged={() => void reload(true)}
        onClose={() => setSheetPostId(null)}
        onBook={isFreelancer ? undefined : bookCreator} // freelancers don't book
        onOpenProfile={goToVendor}
      />
      <BookingModal
        visible={booking !== null}
        creator={booking?.creator ?? null}
        initialDate={booking?.date ?? null}
        initialStart={booking?.start}
        initialServiceIds={booking?.serviceIds}
        onClose={() => setBooking(null)}
        onBooked={(a) => {
          setSheetPostId(null); // booked: done with the photo too
          setBooking(null);
          Alert.alert(a.status === 'pending' ? 'Request sent!' : 'Appointment booked!', 'See it in your calendar.');
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.blueMuted }, // muted light blue; text on it is off-white
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 20, marginBottom: 12, paddingHorizontal: 18 },
  headerTitleGroup: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  back: { padding: 5 },
  title: { fontSize: 28, fontFamily: fonts.title, color: colors.blueDeep, textTransform: 'lowercase', flexShrink: 1 },
  titleCaps: { textTransform: 'uppercase' },
  starTitle: { position: 'relative' },
  // Double stars tucked behind the left side of INSPIRATION
  starsDouble: { position: 'absolute', width: 48, height: 47, left: -14, top: -20 },
  // Small star above the final N
  starN: { position: 'absolute', width: 22, height: 22, left: 277, top: -12 },
  // Tiny star just to the right of the final N
  starTiny: { position: 'absolute', width: 16, height: 16, left: 304, top: 0 },
  editButton: { position: 'absolute', left: 18, bottom: 18, backgroundColor: colors.pink, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 9 },
  editText: { fontSize: 12, color: colors.wine, fontWeight: '700', textTransform: 'lowercase' },
  // Lines up under the collection name: 18 page margin + 33 back button (23 icon + 2×5 padding) + 8 gap
  subtitle: { fontSize: 12, color: colors.background, marginTop: -8, marginLeft: 59, marginRight: 18, marginBottom: 16 },
  titleSpacer: { height: 10 },
  addTile: { height: 160, borderRadius: 18, borderWidth: 2, borderStyle: 'dashed', borderColor: colors.pink, alignItems: 'center', justifyContent: 'center' },
  content: { flexGrow: 1, paddingHorizontal: 18, paddingBottom: 80 }, // room for the floating edit button
  cards: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 14 },
  boardCard: { width: '47.8%' },
  // backgroundColor shows through the padding as an off-white frame around the photos
  cover: { height: 160, borderRadius: 18, backgroundColor: colors.background, flexDirection: 'row', flexWrap: 'wrap', padding: 3, overflow: 'hidden' },
  coverCell: { width: '50%', height: '50%', padding: 2, alignItems: 'center', justifyContent: 'center' }, // padding = small gap between photos
  coverPhoto: { width: '100%', height: '100%', borderRadius: 12 },
  emptyCover: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 7 },
  emptyCoverText: { color: colors.wine, fontSize: 12 },
  boardMeta: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 6, marginTop: 9 },
  boardName: { color: colors.background, fontSize: 13, fontFamily: fonts.title, flexShrink: 1 },
  count: { color: colors.blueDeep, fontSize: 12 },
  savedCard: { width: '47.8%' },
  dragPlaceholder: { opacity: 0.25 },
  dragGhost: { position: 'absolute', left: 0, top: 0, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 10, shadowOffset: { width: 0, height: 6 }, elevation: 8 },
  savedTile: { width: '100%', height: 168, backgroundColor: '#F0EBF0', borderRadius: 16, overflow: 'hidden' },
  savedImage: { width: '100%', height: '100%' },
  profileTile: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F2E8ED' },
  removeBadge: { position: 'absolute', top: 6, right: 6, backgroundColor: '#FFF', borderRadius: 16 },
  entryLabel: { marginTop: 7, fontSize: 14, fontWeight: '700', color: colors.background },
  emptyState: { alignItems: 'center', marginTop: 80, paddingHorizontal: 34, gap: 10 },
  emptyText: { fontSize: 17, fontWeight: '700', color: colors.background },
  emptyHint: { fontSize: 13, color: colors.background, textAlign: 'center', lineHeight: 19 },
  menuBackdrop: { flex: 1, backgroundColor: 'rgba(24,20,22,0.45)', justifyContent: 'center', padding: 32 },
  menuSheet: { backgroundColor: colors.background, borderRadius: 20, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 8 },
  menuTitle: { fontFamily: fonts.title, fontSize: 18, color: colors.ink, marginBottom: 8 },
  menuOption: { paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  menuText: { color: colors.pink, fontSize: 16 },
  menuTextDark: { color: colors.ink },
  shade: { flex: 1, backgroundColor: 'rgba(24,20,22,0.55)', justifyContent: 'center', padding: 20 },
  dialog: { backgroundColor: '#FFF', padding: 19, borderRadius: 18 },
  dialogHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  dialogTitle: { fontSize: 18, fontWeight: '800', color: '#151A17' },
  input: { borderWidth: 1, borderColor: '#E5DFD7', borderRadius: 12, padding: 13, color: '#151A17', marginBottom: 12 },
  primaryButton: { backgroundColor: colors.pink, padding: 14, alignItems: 'center', borderRadius: 12 },
  primaryText: { color: colors.wine, fontWeight: '700' },
  action: { flexDirection: 'row', alignItems: 'center', gap: 5, padding: 9 },
  actionText: { color: ACCENT, fontWeight: '700', fontSize: 12 },
});
