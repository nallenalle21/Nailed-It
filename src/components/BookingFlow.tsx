import { useState } from 'react';
import { ActivityIndicator, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from './AppText';
import { colors, fonts } from '../theme';
import { handle } from '../utils/handle';
import { canCancel, formatKr, isRequestExpired, type Appointment } from '../services/booking';
import { FLOW_DAYS } from '../services/bookingRequests';
import ReasonDialog from './ReasonDialog';

const RECENT_SHOWN = 5; // more behind "Show all"

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
  onAccept: (a: Appointment) => void;
  onDecline: (a: Appointment, reason: string) => void;
  onCancel: (a: Appointment, reason: string) => void;
  onChat: (a: Appointment) => void;
};

/**
 * The freelancer's booking flow in the Calendar: requests waiting for an answer on top
 * (Accept / Chat / Decline), then bookings from the last days, newest first. A dot marks
 * bookings they haven't seen yet.
 */
export default function BookingFlow({ items, loading, busyId, onAccept, onDecline, onCancel, onChat }: Props) {
  const [showAll, setShowAll] = useState(false);
  // The decline/cancel dialog: which booking, and which of the two.
  const [asking, setAsking] = useState<{ a: Appointment; kind: 'decline' | 'cancel' } | null>(null);
  const now = new Date();

  const requests = items.filter((a) => a.status === 'pending' && !isRequestExpired(a, now));
  const recent = items.filter((a) => !requests.includes(a));
  const shownRecent = showAll ? recent : recent.slice(0, RECENT_SHOWN);

  return (
    <View style={styles.section}>
      <View style={styles.titleRow}>
        <Text style={styles.title}>Booking flow</Text>
        {requests.length > 0 && (
          <View style={styles.countBadge}>
            <Text style={styles.countText}>{requests.length} {requests.length === 1 ? 'request' : 'requests'}</Text>
          </View>
        )}
      </View>

      {loading && items.length === 0 ? (
        <ActivityIndicator color={colors.wine} style={{ marginVertical: 12 }} />
      ) : items.length === 0 ? (
        <Text style={styles.empty}>No new bookings in the last {FLOW_DAYS} days.</Text>
      ) : null}

      {requests.map((a) => (
        <View key={a.id} style={styles.request}>
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
              <TouchableOpacity style={[styles.button, styles.primary]} onPress={() => onAccept(a)}>
                <Text style={styles.primaryText}>Accept</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      ))}

      {shownRecent.map((a) => {
        const label = STATUS_LABEL[isRequestExpired(a, now) ? 'expired' : a.status];
        const cancellable = a.status === 'confirmed' && canCancel(a, now);
        return (
          <View key={a.id} style={styles.row}>
            <View style={[styles.dot, !a.seen_by_creator_at && styles.dotNew]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle} numberOfLines={1}>
                {handle(a.customer_name)} · {a.services.map((s) => s.name).join(', ')}
              </Text>
              <Text style={styles.meta}>
                {dateLabel(a.appointment_date)} {hhmm(a.start_time)} · booked {ago(a.created_at, now)}
              </Text>
              {a.status === 'cancelled' && (
                <Text style={styles.meta}>
                  {a.cancelled_by === a.creator_id ? 'You cancelled' : 'The customer cancelled'}
                  {a.cancel_reason ? `: “${a.cancel_reason}”` : ''}
                </Text>
              )}
            </View>
            {busyId === a.id ? (
              <ActivityIndicator color={colors.wine} />
            ) : (
              <View style={styles.rowRight}>
                <Text style={[styles.status, { color: label.color }]}>{label.text}</Text>
                {cancellable && (
                  <TouchableOpacity onPress={() => setAsking({ a, kind: 'cancel' })} hitSlop={8}>
                    <Text style={styles.cancelLink}>Cancel</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
        );
      })}
      {recent.length > RECENT_SHOWN && (
        <TouchableOpacity onPress={() => setShowAll((v) => !v)} hitSlop={8}>
          <Text style={styles.more}>{showAll ? 'Show less' : `Show all (${recent.length})`}</Text>
        </TouchableOpacity>
      )}

      {/* Decline / cancel, with an optional message to the customer */}
      {asking && (
        <ReasonDialog
          title={asking.kind === 'decline' ? 'Decline request' : 'Cancel booking'}
          subtitle={`${handle(asking.a.customer_name)} · ${dateLabel(asking.a.appointment_date)} ${hhmm(asking.a.start_time)}`}
          confirmLabel={asking.kind === 'decline' ? 'Decline' : 'Cancel booking'}
          placeholder="Message to the customer (optional)"
          onClose={() => setAsking(null)}
          onConfirm={(reason) => {
            const { a, kind } = asking;
            setAsking(null);
            (kind === 'decline' ? onDecline : onCancel)(a, reason);
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginHorizontal: 16, marginBottom: 16 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  title: { fontSize: 13, color: colors.ink, fontFamily: fonts.title },
  countBadge: { backgroundColor: colors.pink, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  countText: { fontSize: 12, fontWeight: '700', color: colors.wine },
  empty: { color: colors.inkMuted, paddingVertical: 6 },
  request: { padding: 14, borderRadius: 12, backgroundColor: colors.pinkTint, marginBottom: 10 },
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
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dotNew: { backgroundColor: colors.pink },
  rowTitle: { fontSize: 15, fontWeight: '600', color: colors.ink },
  status: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  rowRight: { alignItems: 'flex-end', gap: 6 },
  cancelLink: { fontSize: 13, color: colors.wine, fontWeight: '600', textDecorationLine: 'underline' },
  more: { color: colors.wine, fontWeight: '700', marginTop: 10 },
});
