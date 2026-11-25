import { useEffect, useRef, useState } from 'react';
import { Modal, StyleSheet, TouchableOpacity, View } from 'react-native';
// Gesture-aware scroll list + root: swiping a card and scrolling the list work together (also in a pop-up).
import { GestureHandlerRootView, ScrollView } from 'react-native-gesture-handler';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { Text } from './AppText';
import { colors, fonts } from '../theme';
import type { Appointment } from '../services/booking';
import { supabase } from '../services/supabase';
import BookingFlow, { openRequests } from './BookingFlow';

type Props = {
  /** Whose activity: the nail tech's (answers requests) or the customer's. */
  perspective?: 'creator' | 'customer';
  /** The signed-in user (archived/seen activities are kept per account on this phone). Looked up if left out. */
  userId?: string | null;
  items: Appointment[];
  loading: boolean;
  busyId: string | null;
  onAccept?: (a: Appointment) => void;
  onDecline?: (a: Appointment, reason: string) => void;
  onCancel: (a: Appointment, reason: string) => void;
  onChat: (a: Appointment) => void;
  /** Tap an activity to see that booking. */
  onView?: (a: Appointment) => void;
  /** Nail techs: not seen yet (from the database). Customers: tracked on this phone. */
  isUnread?: (a: Appointment) => boolean;
  /** The pop-up was opened: these unread activities now count as seen. */
  onOpened?: (unread: Appointment[]) => void;
};

const archiveKey = (userId: string) => `bookingActivity.archived.${userId}`;
const seenKey = (userId: string) => `bookingActivity.seen.${userId}`;
// An activity is "seen" in a certain state: if it changes (e.g. a request gets accepted) it's unread again.
const seenToken = (a: Appointment) => `${a.id}:${a.status}`;
// How long the "Archived · Undo" bar stays.
const UNDO_MS = 4000;

/**
 * "Booking activity" in the freelancer's Calendar: one button with how many activities there
 * are (and requests to answer). "See all" opens a pop-up with everything: requests to accept or
 * decline, bookings and cancellations. Happenings can be archived to clean up; the Archived tab
 * still shows them.
 */
export default function BookingActivity({
  perspective = 'creator', userId: userIdProp, items, loading, busyId, onAccept, onDecline, onCancel, onChat, onView, isUnread: isUnreadProp, onOpened,
}: Props) {
  const isCreator = perspective === 'creator';
  const [lookedUpId, setLookedUpId] = useState<string | null>(null);
  useEffect(() => {
    if (userIdProp !== undefined) return;
    supabase.auth.getUser().then(({ data }) => setLookedUpId(data.user?.id ?? null)).catch(() => {});
  }, [userIdProp]);
  const userId = userIdProp !== undefined ? userIdProp : lookedUpId;

  // Customers: what's been seen is remembered on this phone (nail techs use the database).
  const [seenTokens, setSeenTokens] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!userId || isUnreadProp) return;
    let active = true;
    AsyncStorage.getItem(seenKey(userId))
      .then((saved) => { if (active && saved) setSeenTokens(new Set(JSON.parse(saved) as string[])); })
      .catch(() => {});
    return () => { active = false; };
  }, [userId, isUnreadProp]);
  const isUnread = isUnreadProp ?? ((a: Appointment) => !seenTokens.has(seenToken(a)));
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'active' | 'archived'>('active');

  // Archived ids, remembered on this phone for this account.
  const [archived, setArchived] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!userId) return;
    let active = true;
    AsyncStorage.getItem(archiveKey(userId))
      .then((saved) => { if (active && saved) setArchived(new Set(JSON.parse(saved) as string[])); })
      .catch(() => {});
    return () => { active = false; };
  }, [userId]);
  const saveArchived = (next: Set<string>) => {
    setArchived(next);
    // Only keep ids that are still in the list (older activities drop out by themselves).
    const known = new Set(items.map((a) => a.id));
    if (userId) AsyncStorage.setItem(archiveKey(userId), JSON.stringify([...next].filter((id) => known.has(id)))).catch(() => {});
  };
  // After archiving (or moving back): a small bar at the bottom with Undo, for a few seconds.
  const [undo, setUndo] = useState<{ text: string; restore: Set<string> } | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showUndo = (text: string, restore: Set<string>) => {
    setUndo({ text, restore });
    if (undoTimer.current) clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => setUndo(null), UNDO_MS);
  };
  useEffect(() => () => { if (undoTimer.current) clearTimeout(undoTimer.current); }, []);

  const archive = (ids: string[]) => {
    const before = archived;
    saveArchived(new Set([...archived, ...ids]));
    showUndo(ids.length > 1 ? `${ids.length} archived` : 'Archived', before);
  };
  const unarchive = (id: string) => {
    const before = archived;
    const next = new Set(archived);
    next.delete(id);
    saveArchived(next);
    showUndo('Moved back to activity', before);
  };
  const undoLast = () => {
    if (!undo) return;
    saveArchived(undo.restore);
    setUndo(null);
  };

  // Requests to answer: nail techs only.
  const requests = isCreator ? openRequests(items) : [];
  const activeCount = items.filter((a) => !archived.has(a.id)).length;
  const archivedCount = items.filter((a) => archived.has(a.id)).length;
  // "New" = not seen yet. Once the pop-up has been opened they stop counting on the button
  // (the dots inside the list stay for this visit, so you can still see what was new).
  const [seenHere, setSeenHere] = useState<Set<string>>(new Set());
  const unseen = items.filter((a) => isUnread(a) && !archived.has(a.id));
  const newCount = unseen.filter((a) => !seenHere.has(seenToken(a))).length;

  const openPopup = () => {
    setTab('active');
    setOpen(true);
    if (newCount > 0) {
      setSeenHere((prev) => new Set([...prev, ...unseen.map(seenToken)]));
      onOpened?.(unseen);
      // Customers: remember on this phone (the dots stay in the list for this visit).
      if (!isUnreadProp && userId) {
        const known = new Set(items.map(seenToken));
        const next = [...new Set([...seenTokens, ...unseen.map(seenToken)])].filter((t) => known.has(t));
        AsyncStorage.setItem(seenKey(userId), JSON.stringify(next)).catch(() => {});
      }
    }
  };
  // Closing: customers' dots go away now (nail techs' go when the list reloads from the database).
  const close = () => {
    setOpen(false);
    if (!isUnreadProp) setSeenTokens((prev) => new Set([...prev, ...seenHere]));
  };
  // Chat leaves the Calendar, and the booking card is its own pop-up: close this one first.
  const chat = (a: Appointment) => {
    close();
    onChat(a);
  };
  const view = onView ? (a: Appointment) => {
    close();
    setTimeout(() => onView(a), 350);
  } : undefined;

  // Unread = activities you haven't seen yet (the pink dots in the list).
  const summary = [
    `${activeCount} ${activeCount === 1 ? 'activity' : 'activities'}`,
    newCount > 0 ? `${newCount} unread` : 'all read',
  ].join(' · ');
  const unreadInList = unseen.length;

  return (
    <>
      <TouchableOpacity style={styles.button} onPress={openPopup} accessibilityRole="button" accessibilityLabel={`Booking activity, ${summary}. See all`}>
        <View style={styles.icon}>
          <Ionicons name="notifications-outline" size={20} color={colors.wine} />
          {(requests.length > 0 || newCount > 0) && <View style={styles.iconDot} />}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Booking activity</Text>
          <Text style={styles.summary}>{loading && items.length === 0 ? 'Loading…' : summary}</Text>
        </View>
        {requests.length > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{requests.length} to answer</Text>
          </View>
        )}
        <Text style={styles.seeAll}>See all</Text>
        <Ionicons name="chevron-forward" size={16} color={colors.wine} />
      </TouchableOpacity>

      {/* Full screen (not the iOS "card" style): in a card sheet iOS drops touch starts, which breaks swipe-to-archive */}
      <Modal visible={open} animationType="slide" presentationStyle="fullScreen" onRequestClose={close}>
        <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <SafeAreaView style={styles.sheet} edges={['top', 'bottom']}>
            <View style={styles.header}>
              <View>
                <Text style={styles.headerTitle}>Booking activity</Text>
                <Text style={styles.headerSub}>
                  {unreadInList > 0 ? `${unreadInList} unread · marked with a dot` : 'All read'}
                </Text>
              </View>
              <TouchableOpacity onPress={close} hitSlop={12} accessibilityLabel="Close">
                <Ionicons name="close" size={26} color={colors.ink} />
              </TouchableOpacity>
            </View>

            {/* Activity / Archived */}
            <View style={styles.tabs}>
              {(['active', 'archived'] as const).map((t) => (
                <TouchableOpacity
                  key={t}
                  style={[styles.tab, tab === t && styles.tabActive]}
                  onPress={() => setTab(t)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: tab === t }}
                >
                  <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
                    {t === 'active' ? `Activity (${activeCount})` : `Archived (${archivedCount})`}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <ScrollView contentContainerStyle={{ paddingTop: 4, paddingBottom: 32 }}>
              <BookingFlow
                perspective={perspective}
                isUnread={isUnread}
                onView={view}
                items={items}
                loading={loading}
                busyId={busyId}
                onAccept={onAccept}
                onDecline={onDecline}
                onCancel={onCancel}
                onChat={chat}
                tab={tab}
                archivedIds={archived}
                onArchive={archive}
                onUnarchive={unarchive}
              />
            </ScrollView>

            {/* "Archived · Undo" */}
            {undo && (
              <View style={styles.undoBar}>
                <Ionicons name="archive" size={18} color={colors.background} />
                <Text style={styles.undoText}>{undo.text}</Text>
                <TouchableOpacity onPress={undoLast} hitSlop={10} accessibilityLabel="Undo">
                  <Text style={styles.undoAction}>Undo</Text>
                </TouchableOpacity>
              </View>
            )}
          </SafeAreaView>
        </SafeAreaProvider>
        </GestureHandlerRootView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16, marginBottom: 16,
    padding: 14, borderRadius: 14, backgroundColor: colors.pinkTint,
  },
  icon: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
  iconDot: { position: 'absolute', top: 7, right: 8, width: 9, height: 9, borderRadius: 5, backgroundColor: colors.pink, borderWidth: 1.5, borderColor: colors.background },
  title: { fontSize: 14, color: colors.ink, fontFamily: fonts.title },
  summary: { fontSize: 13, color: colors.inkMuted, marginTop: 2 },
  badge: { backgroundColor: colors.pink, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 12, fontWeight: '700', color: colors.wine },
  seeAll: { fontSize: 13, fontWeight: '700', color: colors.wine },
  sheet: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  headerTitle: { fontSize: 18, color: colors.ink, fontFamily: fonts.title },
  headerSub: { fontSize: 13, color: colors.inkMuted, marginTop: 2 },
  undoBar: {
    position: 'absolute', left: 16, right: 16, bottom: 34, flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingVertical: 13, borderRadius: 14, backgroundColor: colors.ink,
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 6,
  },
  undoText: { flex: 1, color: colors.background, fontSize: 15, fontWeight: '600' },
  undoAction: { color: colors.pink, fontSize: 15, fontWeight: '800' },
  tabs: { flexDirection: 'row', marginHorizontal: 16, marginBottom: 12, padding: 4, borderRadius: 16, backgroundColor: '#f2f2f2' },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 12 },
  tabActive: { backgroundColor: colors.pink },
  tabText: { fontSize: 14, fontWeight: '600', color: colors.ink },
  tabTextActive: { color: colors.wine, fontWeight: '700' },
});
