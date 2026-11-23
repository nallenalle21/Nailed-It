import { ActivityIndicator, Image, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from './AppText';
import { colors, fonts } from '../theme';
import { formatKr } from '../services/booking';
import { isOfferExpired, offerEndTime, type BookingOffer } from '../services/offers';

const STAR = require('../../assets/images/star.png');

const dateLabel = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
};

type Props = {
  offer: BookingOffer;
  /** Whether the person looking at it sent it (the freelancer) or received it (the customer). */
  sentByMe: boolean;
  busy: boolean;
  onAccept: () => void;
  onDecline: () => void;
  onWithdraw: () => void;
};

/** A booking offer in the chat: what, when, where and price, with Accept/Decline (or Withdraw). */
export default function OfferCard({ offer: o, sentByMe, busy, onAccept, onDecline, onWithdraw }: Props) {
  const expired = isOfferExpired(o);
  const open = o.status === 'pending' && !expired;
  const badge =
    o.status === 'accepted' ? { label: 'Booked', icon: 'checkmark-circle' as const, color: colors.blue }
    : o.status === 'declined' ? { label: 'Declined', icon: 'close-circle' as const, color: colors.wine }
    : o.status === 'withdrawn' ? { label: 'Withdrawn', icon: 'remove-circle' as const, color: colors.inkMuted }
    : expired ? { label: 'Expired', icon: 'time' as const, color: colors.inkMuted }
    : { label: sentByMe ? 'Waiting for answer' : 'Booking offer', icon: 'hourglass-outline' as const, color: colors.ink };

  return (
    <View style={[styles.card, sentByMe ? styles.mine : styles.theirs, !open && o.status !== 'accepted' && styles.closed]}>
      <View style={styles.badgeRow}>
        <Ionicons name={badge.icon} size={15} color={badge.color} />
        <Text style={[styles.badge, { color: badge.color }]}>{badge.label}</Text>
      </View>

      <View style={styles.titleRow}>
        <Text style={styles.title}>{o.title}</Text>
        {o.status === 'accepted' && <Image source={STAR} style={styles.star} />}
      </View>
      {o.notes ? <Text style={styles.notes}>{o.notes}</Text> : null}

      <Row icon="calendar-outline" text={`${dateLabel(o.offer_date)} · ${o.start_time.slice(0, 5)}–${offerEndTime(o)}`} />
      <Row icon="hourglass-outline" text={`${o.duration_minutes} min`} />
      {o.place ? <Row icon="location-outline" text={o.place} /> : null}
      <Row icon="pricetag-outline" text={formatKr(o.price)} bold />

      {open && (busy ? (
        <ActivityIndicator style={{ marginTop: 12 }} color={colors.wine} />
      ) : sentByMe ? (
        <TouchableOpacity style={[styles.button, styles.secondary]} onPress={onWithdraw}>
          <Text style={styles.secondaryText}>Withdraw offer</Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.buttons}>
          <TouchableOpacity style={[styles.button, styles.secondary, { flex: 1 }]} onPress={onDecline}>
            <Text style={styles.secondaryText}>Decline</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.button, styles.primary, { flex: 1 }]} onPress={onAccept}>
            <Text style={styles.primaryText}>Accept & book</Text>
          </TouchableOpacity>
        </View>
      ))}
    </View>
  );
}

function Row({ icon, text, bold }: { icon: keyof typeof Ionicons.glyphMap; text: string; bold?: boolean }) {
  return (
    <View style={styles.row}>
      <Ionicons name={icon} size={16} color={colors.ink} />
      <Text style={[styles.rowText, bold && styles.bold]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { width: '82%', padding: 14, borderRadius: 16, marginBottom: 12, borderWidth: 1, borderColor: colors.line, backgroundColor: '#fff' },
  mine: { alignSelf: 'flex-end', borderBottomRightRadius: 4 },
  theirs: { alignSelf: 'flex-start', borderBottomLeftRadius: 4 },
  closed: { opacity: 0.6 },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 6 },
  badge: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { fontSize: 16, fontFamily: fonts.title, color: colors.ink, flexShrink: 1 },
  star: { width: 16, height: 16, alignSelf: 'flex-start' },
  notes: { fontSize: 14, color: colors.inkMuted, marginTop: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  rowText: { flex: 1, fontSize: 14, color: colors.ink },
  bold: { fontWeight: '700', fontSize: 15 },
  buttons: { flexDirection: 'row', gap: 8 },
  button: { marginTop: 14, borderRadius: 12, paddingVertical: 11, alignItems: 'center' },
  primary: { backgroundColor: colors.pink },
  primaryText: { color: colors.wine, fontSize: 15, fontWeight: '700' },
  secondary: { borderWidth: 1, borderColor: colors.pink },
  secondaryText: { color: colors.wine, fontSize: 15, fontWeight: '600' },
});
