import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Text } from './AppText';
import { colors } from '../theme';
import {
  availableDates,
  bookAppointment,
  effectivePrice,
  fetchCreatorServices,
  fetchSchedule,
  formatKr,
  quoteBooking,
  startTimesForDay,
  toDateKey,
  type Appointment,
  type BookingQuote,
  type CreatorService,
  type ScheduleEntry,
} from '../services/booking';

const HORIZON_DAYS = 60;

const errorMessage = (e: unknown) =>
  e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String((e as any).message) : String(e);

const dateLabel = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
};

type Props = {
  visible: boolean;
  creator: { id: string; name: string } | null;
  initialDate?: string | null;
  onClose: () => void;
  onBooked: (appointment: Appointment) => void;
};

export default function BookingModal({ visible, creator, initialDate, onClose, onBooked }: Props) {
  const [services, setServices] = useState<CreatorService[]>([]);
  const [schedule, setSchedule] = useState<ScheduleEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [date, setDate] = useState<string | null>(null);
  const [start, setStart] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [quote, setQuote] = useState<BookingQuote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const creatorId = creator?.id ?? null;

  useEffect(() => {
    if (!visible || !creatorId) return;
    let active = true;
    setLoading(true);
    setLoadError(null);
    const now = new Date();
    const to = new Date(now.getFullYear(), now.getMonth(), now.getDate() + HORIZON_DAYS);
    Promise.all([fetchCreatorServices(creatorId), fetchSchedule(creatorId, toDateKey(now), toDateKey(to))])
      .then(([svc, sched]) => {
        if (!active) return;
        setServices(svc);
        setSchedule(sched);
        const dates = availableDates(sched);
        setDate((prev) => (prev && dates.includes(prev) ? prev : initialDate && dates.includes(initialDate) ? initialDate : dates[0] ?? null));
      })
      .catch((e) => active && setLoadError(errorMessage(e)))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [visible, creatorId, initialDate, reloadKey]);

  useEffect(() => {
    if (!visible) {
      setDate(null);
      setStart(null);
      setSelected([]);
      setQuote(null);
    }
  }, [visible]);

  const dates = useMemo(() => availableDates(schedule), [schedule]);
  const startTimes = useMemo(() => (date ? startTimesForDay(schedule, date) : []), [schedule, date]);

  useEffect(() => {
    setStart((prev) => (prev && startTimes.includes(prev) ? prev : null));
  }, [startTimes]);

  // The server is the source of truth for fit, duration and price.
  const selectionKey = selected.join(',');
  useEffect(() => {
    if (!creatorId || !date || !start || selected.length === 0) {
      setQuote(null);
      return;
    }
    let active = true;
    setQuoting(true);
    quoteBooking(creatorId, date, start, selected)
      .then((q) => active && setQuote(q))
      .catch((e) => active && setQuote({ ok: false, reason: errorMessage(e) }))
      .finally(() => active && setQuoting(false));
    return () => { active = false; };
  }, [creatorId, date, start, selectionKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleService = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const confirm = async () => {
    if (!creatorId || !date || !start || !quote?.ok || submitting) return;
    setSubmitting(true);
    try {
      const appointment = await bookAppointment(creatorId, date, start, selected);
      onBooked(appointment);
    } catch (e) {
      Alert.alert('Could not book', errorMessage(e));
      setReloadKey((n) => n + 1);
      setQuote(null);
    } finally {
      setSubmitting(false);
    }
  };

  const canConfirm = !!quote?.ok && !quoting && !submitting;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      {/* A Modal is a separate native window, so it needs its own safe-area provider. */}
      <SafeAreaProvider>
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.close} onPress={onClose} hitSlop={16} accessibilityLabel="Close">
            <Ionicons name="close" size={28} color="#222" />
          </TouchableOpacity>
          <Text style={styles.title} numberOfLines={1}>Book {creator?.name ?? ''}</Text>
          <View style={{ width: 44 }} />
        </View>

        {loading ? (
          <ActivityIndicator style={{ marginTop: 40 }} color={colors.danger} size="large" />
        ) : loadError ? (
          <View style={styles.pad}>
            <Text style={styles.error}>Could not load booking options: {loadError}</Text>
            <TouchableOpacity onPress={() => setReloadKey((n) => n + 1)}>
              <Text style={styles.link}>Try again</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
            <Text style={styles.section}>1. date</Text>
            {dates.length === 0 ? (
              <Text style={styles.empty}>This creator has no available times right now.</Text>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                {dates.map((d) => (
                  <Chip key={d} label={dateLabel(d)} active={d === date} onPress={() => setDate(d)} />
                ))}
              </ScrollView>
            )}

            <Text style={styles.section}>2. start time</Text>
            {startTimes.length === 0 ? (
              <Text style={styles.empty}>Pick a date with availability first.</Text>
            ) : (
              <View style={[styles.chipRow, { flexWrap: 'wrap' }]}>
                {startTimes.map((t) => (
                  <Chip key={t} label={t} active={t === start} onPress={() => setStart(t)} />
                ))}
              </View>
            )}

            <Text style={styles.section}>3. services</Text>
            {services.length === 0 ? (
              <Text style={styles.empty}>This creator has not added any services yet.</Text>
            ) : (
              services.map((s) => {
                const active = selected.includes(s.id);
                const hasDiscount = s.discount_price !== null && Number(s.discount_price) < Number(s.price);
                return (
                  <TouchableOpacity key={s.id} style={[styles.service, active && styles.serviceActive]} onPress={() => toggleService(s.id)}>
                    <Ionicons name={active ? 'checkbox' : 'square-outline'} size={22} color={active ? colors.danger : '#999'} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.serviceName}>{s.name}</Text>
                      <Text style={styles.serviceMeta}>{s.duration_minutes} min</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={styles.servicePrice}>{formatKr(effectivePrice(s))}</Text>
                      {hasDiscount && <Text style={styles.strike}>{formatKr(s.price)}</Text>}
                    </View>
                  </TouchableOpacity>
                );
              })
            )}
          </ScrollView>
        )}

        <View style={styles.footer}>
          {quoting ? (
            <ActivityIndicator color={colors.danger} />
          ) : quote?.ok ? (
            <Text style={styles.summary}>
              {start}–{quote.end_time} · {quote.total_minutes} min · total {formatKr(quote.total_price)}
            </Text>
          ) : quote ? (
            <Text style={styles.error}>{quote.reason}</Text>
          ) : (
            <Text style={styles.empty}>Choose a date, start time and at least one service.</Text>
          )}
          <TouchableOpacity style={[styles.confirm, !canConfirm && styles.confirmDisabled]} disabled={!canConfirm} onPress={confirm}>
            {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.confirmText}>Confirm booking</Text>}
          </TouchableOpacity>
        </View>
      </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={[styles.chip, active && styles.chipActive]} onPress={onPress}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingTop: Platform.OS === 'android' ? 12 : 4, paddingBottom: 10 },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 20, fontWeight: '700', flex: 1, textAlign: 'center' },
  pad: { padding: 16 },
  section: { fontSize: 16, fontWeight: '700', marginHorizontal: 16, marginTop: 20, marginBottom: 8 },
  chipRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: '#ddd', backgroundColor: '#fff', marginBottom: 8 },
  chipActive: { backgroundColor: colors.danger, borderColor: colors.danger },
  chipText: { fontSize: 14, color: '#333', fontWeight: '500' },
  chipTextActive: { color: '#fff' },
  empty: { color: '#888', fontSize: 14, marginHorizontal: 16 },
  service: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 16, marginBottom: 8, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#ddd' },
  serviceActive: { borderColor: colors.danger, backgroundColor: colors.primarySoft },
  serviceName: { fontSize: 16, fontWeight: '600' },
  serviceMeta: { fontSize: 13, color: '#888', marginTop: 2 },
  servicePrice: { fontSize: 15, fontWeight: '700' },
  strike: { fontSize: 12, color: '#999', textDecorationLine: 'line-through' },
  footer: { padding: 16, gap: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#ddd' },
  summary: { fontSize: 16, fontWeight: '700' },
  error: { color: '#A12339', fontSize: 14 },
  link: { color: colors.danger, fontWeight: '700', marginTop: 10 },
  confirm: { backgroundColor: colors.danger, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  confirmDisabled: { opacity: 0.4 },
  confirmText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
