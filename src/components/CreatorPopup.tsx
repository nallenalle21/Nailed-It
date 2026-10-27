import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from './AppText';
import { colors } from '../theme';
import { effectivePrice, fetchCreatorServices, formatKr, type CreatorService } from '../services/booking';

type Props = {
  creator: { id: string; name: string } | null;
  onClose: () => void;
  onViewProfile: (creatorId: string) => void;
  onBook: (creator: { id: string; name: string }) => void;
};

/** Short profile card shown when a map pin is tapped. */
export default function CreatorPopup({ creator, onClose, onViewProfile, onBook }: Props) {
  const [services, setServices] = useState<CreatorService[]>([]);
  const [loading, setLoading] = useState(false);
  const creatorId = creator?.id ?? null;

  useEffect(() => {
    if (!creatorId) return;
    let active = true;
    setLoading(true);
    setServices([]);
    fetchCreatorServices(creatorId)
      .then((s) => active && setServices(s))
      .catch(() => active && setServices([]))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [creatorId]);

  const lowest = services.length ? Math.min(...services.map(effectivePrice)) : null;

  return (
    <Modal visible={creator !== null} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={styles.card}>
          <View style={styles.row}>
            <View style={styles.avatar}>
              <Ionicons name="person" size={26} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.name} numberOfLines={1}>{creator?.name}</Text>
              {lowest !== null && <Text style={styles.from}>from {formatKr(lowest)}</Text>}
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={10} accessibilityLabel="Close">
              <Ionicons name="close" size={24} color="#555" />
            </TouchableOpacity>
          </View>

          {loading ? (
            <ActivityIndicator style={{ marginVertical: 16 }} color={colors.danger} />
          ) : services.length === 0 ? (
            <Text style={styles.empty}>No services listed yet.</Text>
          ) : (
            <View style={styles.services}>
              {services.slice(0, 4).map((s) => (
                <View key={s.id} style={styles.serviceRow}>
                  <Text style={styles.serviceName} numberOfLines={1}>{s.name} · {s.duration_minutes} min</Text>
                  <Text style={styles.servicePrice}>{formatKr(effectivePrice(s))}</Text>
                </View>
              ))}
              {services.length > 4 && <Text style={styles.empty}>+ {services.length - 4} more</Text>}
            </View>
          )}

          <View style={styles.buttons}>
            <TouchableOpacity style={styles.secondary} onPress={() => creator && onViewProfile(creator.id)}>
              <Text style={styles.secondaryText}>View profile</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.primary} onPress={() => creator && onBook(creator)}>
              <Text style={styles.primaryText}>Book appointment</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  card: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 36 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 18, fontWeight: '700' },
  from: { fontSize: 14, color: '#888', marginTop: 2 },
  services: { marginTop: 14, gap: 8 },
  serviceRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  serviceName: { fontSize: 14, flex: 1 },
  servicePrice: { fontSize: 14, fontWeight: '700' },
  empty: { color: '#888', fontSize: 13, marginTop: 12 },
  buttons: { flexDirection: 'row', gap: 10, marginTop: 20 },
  secondary: { flex: 1, borderRadius: 12, borderWidth: 1, borderColor: colors.danger, paddingVertical: 13, alignItems: 'center' },
  secondaryText: { color: colors.danger, fontWeight: '700', fontSize: 15 },
  primary: { flex: 1.4, borderRadius: 12, backgroundColor: colors.danger, paddingVertical: 13, alignItems: 'center' },
  primaryText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
