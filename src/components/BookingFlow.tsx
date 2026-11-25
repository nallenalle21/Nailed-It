import { useState } from 'react';
import { ActivityIndicator, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from './AppText';
import { colors } from '../theme';
import { handle } from '../utils/handle';
import { canCancel, formatKr, isRequestExpired, type Appointment } from '../services/booking';
import { FLOW_DAYS } from '../services/bookingRequests';
import ReasonDialog from './ReasonDialog';
import SwipeToArchive from './SwipeToArchive';

const dateLabel = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
};
const hhmm = (t: string) => t.slice(0, 5);

/** "5 min ago", "3 h ago", "2 d ago" */
const ago = (iso: string | undefined, now: Date) => {
  if (!iso) return '';
  const min = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 60000));
  return min < 60 ? `${min} min ago` : min < 24 * 60 ? `${Math.round(min / 60)} h ago` : `${Math.round(min / 1440)} d ago`;
};

/** "answer within 5 h" / "answer within 20 min" */
const answerWithin = (iso: string | null | undefined, now: Date) => {
  if (!iso) return null;
  const min = Math.max(0, Math.round((new Date(iso).getTime() - now.getTime()) / 60000));
  return `Answer within ${min < 60 ? `${min} min` : `${Math.round(min / 60)} h`}`;
};

const STATUS_LABEL: Record<Appointment['status'], { text: string; color: string }> = {
  pending: { text: 'Request', color: colors.wine },
  confirmed: { text: 'Booked', color: colors.blue },
  cancelled: { text: 'Cancelled', color: colors.inkMuted },
  declined: { text: 'Declined', color: colors.inkMuted },
  expired: { text: 'Expired', color: colors.inkMuted },
  no_show: { text: 'No-show', color: colors.wine },
};

type Props = {
  items: Appointment[];
  loading: boolean;
  /** Booking being accepted/declined/cancelled right now. */
  busyId: string | null;
  /** Whose activity this is: the nail tech's (answers requests) or the customer's. */
  perspective?: 'creator' | 'customer';
  /** Nail tech only: answer a request. */
  onAccept?: (a: Appointment) => void;
  onDecline?: (a: Appointment, reason: string) => void;
  onCancel: (a: Appointment, reason: string) => void;
  onChat: (a: Appointment) => void;
  /** Tap a row to see the booking (customers: the booking card). */
  onView?: (a: Appointment) => void;
  /** Not seen yet: gets a pink dot. */
  isUnread: (a: Appointment) => boolean;
  /** Which list: what's going on now, or what has been archived. */
  tab: 'active' | 'archived';
  /** Happenings the freelancer archived (kept on this phone). */
  archivedIds: Set<string>;
  onArchive: (ids: string[]) => void;
  onUnarchive: (id: string) => void;
};

/** Requests still waiting for an answer: these can't be archived (answer them first). */
export function openRequests(items: Appointment[], now = new Date()) {
  return items.filter((a) => a.status === 'pending' && !isRequestExpired(a, now));
}

/**
 * The freelancer's booking activity (shown in the "Booking activity" pop-up in the Calendar):
 * requests waiting for an answer on top (Accept / Chat / Decline), then bookings, cancellations
 * and answers from the last days, newest first. A dot marks ones they haven't seen yet.
 * Each happening can be archived to clean up the list; the Archived tab shows them again.
 */
export default function BookingFlow({ items, loading, busyId, perspective = 'creator', onAccept, onDecline, onCancel, onChat, onView, isUnread, tab, archivedIds, onArchive, onUnarchive }: Props) {
  const isCreator = perspective === 'creator';
  // The decline/cancel dialog: which booking, and which of the two.
  const [asking, setAsking] = useState<{ a: Appointment; kind: 'decline' | 'cancel' } | null>(null);
  const now = new Date();

  // Everything can be archived (like email). Archived requests still need an answer, so
  // they keep their buttons in the Archived tab.
  const inThisTab = (a: Appointment) => (tab === 'archived') === archivedIds.has(a.id);
  // Nail techs answer requests in their own cards on top; customers see their requests as rows.
  const open = isCreator ? openRequests(items, now) : [];
  const requests = open.filter(inThisTab);
  const recent = items.filter((a) => !open.includes(a) && inThisTab(a));
  const swipe = (a: Appointment) => (tab === 'active' ? onArchive([a.id]) : onUnarchive(a.id));
  const swipeLabel = tab === 'active' ? 'Archive' : 'Unarchive';
  const swipeIcon = tab === 'active' ? 'archive-outline' as const : 'arrow-undo-outline' as const;

  return (
    <View style={styles.section}>
      {/* Clean up: archive everything that doesn't need an answer */}
      {tab === 'active' && recent.length > 1 && (
        <TouchableOpacity style={styles.archiveAll} onPress={() => onArchive(recent.map((a) => a.id))} hitSlop={8}>
          <Ionicons name="archive-outline" size={16} color={colors.wine} />
          <Text style={styles.archiveAllText}>Archive all</Text>
        </TouchableOpacity>
      )}

      {loading && items.length === 0 ? (
        <ActivityIndicator color={colors.wine} style={{ marginVertical: 12 }} />
      ) : requests.length + recent.length === 0 ? (
        <Text style={styles.empty}>
          {tab === 'archived' ? 'Nothing archived yet.' : `No booking activity in the last ${FLOW_DAYS} days.`}
        </Text>
      ) : null}

      {requests.map((a) => (
        <SwipeToArchive key={a.id} onSwiped={() => swipe(a)} label={swipeLabel} icon={swipeIcon} enabled={busyId !== a.id}>
        <View style={styles.request}>
          <View style={styles.requestTop}>
            <Text style={styles.name} numberOfLines={1}>{handle(a.customer_name)}</Text>
            <Text style={styles.deadline}>{answerWithin(a.expires_at, now)}</Text>
          </View>
          <Text style={styles.services}>{a.services.map((s) => s.name).join(', ')}</Text>
          <Text style={styles.meta}>
            {dateLabel(a.appointment_date)} · {hhmm(a.start_time)}–{hhmm(a.end_time)} · {formatKr(a.total_price)}
          </Text>
          {a.customer_note ? <Text style={styles.note}>“{a.customer_note}”</Text> : null}

          {busyId === a.id ? (
            <ActivityIndicator color={colors.wine} style={{ marginTop: 12 }} />
          ) : (
            <View style={styles.actions}>
              <TouchableOpacity style={[styles.button, styles.outline]} onPress={() => setAsking({ a, kind: 'decline' })}>
                <Text style={styles.outlineText}>Decline</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.button, styles.chat]} onPress={() => onChat(a)} accessibilityLabel={`Chat with ${handle(a.customer_name)}`}>
                <Ionicons name="chatbubble-ellipses-outline" size={18} color={colors.wine} />
              </TouchableOpacity>
              <TouchableOpacity style={[styles.button, styles.primary]} onPress={() => onAccept?.(a)}>
                <Text style={styles.primaryText}>Accept</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
        </SwipeToArchive>
      ))}

      {recent.map((a) => {
        const expired = isRequestExpired(a, now);
        const label = !isCreator && a.status === 'pending' && !expired
          ? { text: 'Waiting', color: colors.blue }
          : STATUS_LABEL[expired ? 'expired' : a.status];
        // Nail techs cancel bookings; customers can also withdraw a request that's waiting.
        const cancellable = isCreator ? a.status === 'confirmed' && canCancel(a, now) : canCancel(a, now);
        const other = isCreator ? a.customer_name : a.creator_name;
        const me = isCreator ? a.creator_id : a.customer_id;
        return (
          // Swipe right: archive (in Archived: move it back)
          <SwipeToArchive key={a.id} onSwiped={() => swipe(a)} label={swipeLabel} icon={swipeIcon} enabled={busyId !== a.id}>
          <TouchableOpacity style={styles.row} activeOpacity={onView ? 0.7 : 1} disabled={!onView} onPress={() => onView?.(a)}>
            <View style={[styles.dot, isUnread(a) && styles.dotNew]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle} numberOfLines={1}>
                {handle(other)} · {a.services.map((s) => s.name).join(', ')}
              </Text>
              <Text style={styles.meta}>
                {dateLabel(a.appointment_date)} {hhmm(a.start_time)} · booked {ago(a.created_at, now)}
              </Text>
              {a.status === 'cancelled' && (
                <Text style={styles.meta}>
                  {a.cancelled_by === me ? 'You cancelled' : isCreator ? 'The customer cancelled' : 'The nail tech cancelled'}
                  {a.cancel_reason ? `: “${a.cancel_reason}”` : ''}
                </Text>
              )}
              {!isCreator && a.status === 'declined' && a.decline_reason ? (
                <Text style={styles.meta}>“{a.decline_reason}”</Text>
              ) : null}
            </View>
            {busyId === a.id ? (
              <ActivityIndicator color={colors.wine} />
            ) : (
              <View style={styles.rowRight}>
                <Text style={[styles.status, { color: label.color }]}>{label.text}</Text>
                {cancellable && (
                  <TouchableOpacity onPress={() => setAsking({ a, kind: 'cancel' })} hitSlop={8}>
                    <Text style={styles.cancelLink}>{a.status === 'pending' ? 'Withdraw' : 'Cancel'}</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </TouchableOpacity>
          </SwipeToArchive>
        );
      })}

      {/* Decline / cancel, with an optional message to the customer */}
      {asking && (
        <ReasonDialog
          title={asking.kind === 'decline' ? 'Decline request' : asking.a.status === 'pending' ? 'Withdraw request' : 'Cancel booking'}
          subtitle={`${handle(isCreator ? asking.a.customer_name : asking.a.creator_name)} · ${dateLabel(asking.a.appointment_date)} ${hhmm(asking.a.start_time)}`}
          confirmLabel={asking.kind === 'decline' ? 'Decline' : asking.a.status === 'pending' ? 'Withdraw' : 'Cancel booking'}
          placeholder={isCreator ? 'Message to the customer (optional)' : 'Message to your nail tech (optional)'}
          onClose={() => setAsking(null)}
          onConfirm={(reason) => {
            const { a, kind } = asking;
            setAsking(null);
            if (kind === 'decline') onDecline?.(a, reason);
            else onCancel(a, reason);
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginHorizontal: 16, marginBottom: 16 },
  archiveAll: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-end', marginBottom: 8 },
  archiveAllText: { color: colors.wine, fontSize: 14, fontWeight: '700' },
  empty: { color: colors.inkMuted, paddingVertical: 6 },
  request: { padding: 14, borderRadius: 12, backgroundColor: colors.pinkTint },
  requestTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  name: { fontSize: 16, fontWeight: '700', color: colors.ink, flexShrink: 1 },
  deadline: { fontSize: 12, color: colors.wine, fontWeight: '600' },
  services: { fontSize: 15, color: colors.ink, marginTop: 4 },
  meta: { fontSize: 13, color: colors.inkMuted, marginTop: 2 },
  note: { fontSize: 13, color: colors.ink, fontStyle: 'italic', marginTop: 6 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  button: { borderRadius: 12, paddingVertical: 10, alignItems: 'center', justifyContent: 'center' },
  outline: { flex: 1, borderWidth: 1, borderColor: colors.wine },
  outlineText: { color: colors.wine, fontSize: 15, fontWeight: '600' },
  chat: { width: 46, borderWidth: 1, borderColor: colors.wine },
  primary: { flex: 1, backgroundColor: colors.pink },
  primaryText: { color: colors.wine, fontSize: 15, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 12, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line, backgroundColor: colors.background },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dotNew: { backgroundColor: colors.pink },
  rowTitle: { fontSize: 15, fontWeight: '600', color: colors.ink },
  status: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  rowRight: { alignItems: 'flex-end', gap: 6 },
  cancelLink: { fontSize: 13, color: colors.wine, fontWeight: '600', textDecorationLine: 'underline' },
});
