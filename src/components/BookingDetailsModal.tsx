import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Modal, Platform, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Text } from './AppText';
import { colors, fonts } from '../theme';
import { handle } from '../utils/handle';
import { fetchStudioAddress, formatKr, type Appointment } from '../services/booking';
import { getVendorAvatarUrl } from '../services/vendorAvatar';

const STAR = require('../../assets/images/star.png');

const dateLabel = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
};
const hhmm = (t: string) => t.slice(0, 5);

type Props = {
  appointment: Appointment | null;
  onClose: () => void;
  /** Opens the nail tech's public profile. */
  onViewProfile: (creatorId: string) => void;
};

/** "View" on a booking: date, nail tech, services, place and the customer's comment. */
export default function BookingDetailsModal({ appointment, onClose, onViewProfile }: Props) {
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  // undefined = still loading, null = no studio address set
  const [address, setAddress] = useState<string | null | undefined>(undefined);

  const creatorId = appointment?.creator_id ?? null;
  useEffect(() => {
    if (!creatorId) return;
    let active = true;
    setAvatarUrl(null);
    setAddress(undefined);
    getVendorAvatarUrl(creatorId).then((url) => active && setAvatarUrl(url)).catch(() => {});
    fetchStudioAddress(creatorId)
      .then((value) => active && setAddress(value))
      .catch((e) => {
        console.warn('[BookingDetails] Could not load studio address:', e?.message ?? e);
        if (active) setAddress(null);
      });
    return () => { active = false; };
  }, [creatorId]);

  const a = appointment;
  const name = a ? handle(a.creator_name) : '';

  return (
    <Modal visible={a !== null} animationType="slide" onRequestClose={onClose}>
      {/* A Modal is a separate native window, so it needs its own safe-area provider. */}
      <SafeAreaProvider>
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.close} onPress={onClose} hitSlop={16} accessibilityLabel="Close">
            <Ionicons name="close" size={28} color={colors.ink} />
          </TouchableOpacity>
          <Text style={styles.title}>Your Booking</Text>
          <View style={{ width: 44 }} />
        </View>

        {a && (
          <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
            {/* Same blue card as "Next Booking" in the calendar */}
            <View style={styles.whenCard}>
              <View style={styles.whenRow}>
                <Text style={styles.whenText}>{dateLabel(a.appointment_date)}</Text>
                <Image source={STAR} style={styles.whenStar} />
              </View>
              <Text style={styles.whenTime}>
                {hhmm(a.start_time)}–{hhmm(a.end_time)} · {a.total_minutes} min
              </Text>
            </View>

            <SectionTitle label="nail tech" />
            <TouchableOpacity
              style={styles.row}
              onPress={() => onViewProfile(a.creator_id)}
              accessibilityRole="button"
              accessibilityLabel={`View ${name}'s profile`}
            >
              <View style={styles.avatar}>
                {avatarUrl ? (
                  <Image source={{ uri: avatarUrl }} style={styles.avatarPhoto} />
                ) : (
                  <Text style={styles.avatarInitial}>{(a.creator_name || '?').charAt(0).toUpperCase()}</Text>
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{name}</Text>
                <Text style={styles.rowMeta}>view profile</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.ink} />
            </TouchableOpacity>

            <SectionTitle label="services" />
            <View style={styles.box}>
              {a.services.map((s) => (
                <View key={s.id} style={styles.serviceRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle}>{s.name}</Text>
                    <Text style={styles.rowMeta}>{s.duration_minutes} min</Text>
                  </View>
                  <Text style={styles.price}>{formatKr(s.price)}</Text>
                </View>
              ))}
              <View style={[styles.serviceRow, styles.totalRow]}>
                <Text style={[styles.rowTitle, { flex: 1 }]}>total</Text>
                <Text style={styles.price}>{formatKr(a.total_price)}</Text>
              </View>
            </View>

            <SectionTitle label="place" />
            <View style={[styles.box, styles.infoRow]}>
              <Ionicons name="location-outline" size={20} color={colors.ink} />
              {address === undefined ? (
                <ActivityIndicator color={colors.wine} />
              ) : (
                <Text style={[styles.infoText, !address && styles.muted]}>
                  {address ?? 'No address yet. Ask your nail tech in chat.'}
                </Text>
              )}
            </View>

            <SectionTitle label="comment" />
            <View style={[styles.box, styles.infoRow]}>
              <Ionicons name="chatbubble-ellipses-outline" size={20} color={colors.ink} />
              <Text style={[styles.infoText, !a.customer_note && styles.muted]}>
                {a.customer_note?.trim() || 'No comment added.'}
              </Text>
            </View>

            <TouchableOpacity style={styles.profileButton} onPress={() => onViewProfile(a.creator_id)}>
              <Text style={styles.profileButtonText}>View {name}'s Profile</Text>
            </TouchableOpacity>
          </ScrollView>
        )}
      </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}

/** Same section heading as the booking screen. */
function SectionTitle({ label }: { label: string }) {
  return <Text style={styles.sectionText}>{label}</Text>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingTop: Platform.OS === 'android' ? 12 : 4, paddingBottom: 10 },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 15, fontFamily: fonts.title, color: colors.ink, flex: 1, textAlign: 'center' },
  whenCard: { marginHorizontal: 16, marginTop: 4, padding: 18, borderRadius: 14, backgroundColor: colors.blue },
  whenRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  whenText: { fontSize: 24, fontWeight: '700', color: colors.background },
  whenStar: { width: 18, height: 18, alignSelf: 'flex-start', marginTop: -2, marginLeft: -5 },
  whenTime: { fontSize: 15, marginTop: 4, color: colors.background },
  sectionText: { fontSize: 15, fontFamily: fonts.title, color: colors.ink, marginHorizontal: 16, marginTop: 22, marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 16, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#ddd' },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.pinkTint, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarPhoto: { width: '100%', height: '100%' },
  avatarInitial: { fontSize: 18, fontWeight: '700', color: colors.wine },
  rowTitle: { fontSize: 16, fontWeight: '600', color: colors.ink },
  rowMeta: { fontSize: 13, color: colors.inkMuted, marginTop: 2 },
  box: { marginHorizontal: 16, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: '#ddd' },
  serviceRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
  totalRow: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#ddd' },
  price: { fontSize: 15, fontWeight: '700', color: colors.ink },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
  infoText: { flex: 1, fontSize: 15, color: colors.ink, lineHeight: 21 },
  muted: { color: colors.inkMuted },
  profileButton: { marginHorizontal: 16, marginTop: 28, backgroundColor: colors.pink, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  profileButtonText: { color: colors.wine, fontSize: 16, fontWeight: '700' },
});
