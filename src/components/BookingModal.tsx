import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Text } from './AppText';
import { colors, fonts } from '../theme';
import { handle } from '../utils/handle';
import { syncBookingReminders } from '../services/reminders';
import { HIDDEN_SPINNER, RefreshStar } from './SparkleStars';
import {
  availableDates,
  bookAppointment,
  effectivePrice,
  fetchCreatorServices,
  fetchSchedule,
  formatKr,
  quoteBooking,
  saveAppointmentNote,
  startTimesForDay,
  toDateKey,
  type Appointment,
  type BookingQuote,
  type CreatorService,
  type ScheduleEntry,
} from '../services/booking';
import { addAppointmentToCalendar } from '../services/deviceCalendar';

const STAR = require('../../assets/images/star.png');

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
  /** Services to tick from the start, e.g. from "book again". Ones no longer offered are skipped. */
  initialServiceIds?: string[] | null;
  /** Start time to pick from the start (with initialDate), e.g. a free time tapped in Explore. */
  initialStart?: string | null;
  onClose: () => void;
  onBooked: (appointment: Appointment) => void;
};

export default function BookingModal({ visible, creator, initialDate, initialServiceIds, initialStart, onClose, onBooked }: Props) {
  const [services, setServices] = useState<CreatorService[]>([]);
  const [schedule, setSchedule] = useState<ScheduleEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [date, setDate] = useState<string | null>(null);
  const [start, setStart] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [note, setNote] = useState(''); // optional comment to the nail tech
  const [addToCalendar, setAddToCalendar] = useState(false); // also save it in Apple/Google Calendar
  const [submitting, setSubmitting] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  // Pull-to-refresh reloads quietly (keeps the choices on screen) and shows the spinning star.
  const quietReload = useRef(false);
  const [pulling, setPulling] = useState(false);
  // Read when the services have loaded (kept out of the effect below so it doesn't reload).
  const presetServices = useRef(initialServiceIds);
  const presetStart = useRef(initialStart);
  useEffect(() => { presetServices.current = initialServiceIds; presetStart.current = initialStart; });

  const creatorId = creator?.id ?? null;

  // Closing the sheet clears the choices, so it opens fresh next time.
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (!visible) {
      setDate(null);
      setStart(null);
      setSelected([]);
      setNote('');
      setAddToCalendar(false);
    }
  }

  useEffect(() => {
    if (!visible || !creatorId) return;
    let active = true;
    const quiet = quietReload.current;
    quietReload.current = false;
    if (!quiet) setLoading(true);
    setLoadError(null); // eslint-disable-line react-hooks/set-state-in-effect -- loads data; results are set when they arrive
    const now = new Date();
    const to = new Date(now.getFullYear(), now.getMonth(), now.getDate() + HORIZON_DAYS);
    Promise.all([fetchCreatorServices(creatorId), fetchSchedule(creatorId, toDateKey(now), toDateKey(to))])
      .then(([svc, sched]) => {
        if (!active) return;
        setServices(svc);
        setSchedule(sched);
        const dates = availableDates(sched);
        // Nothing is pre-selected: keep the user's own pick on refresh, otherwise only the date
        // already chosen in Explore's date filter (if any).
        setDate((prev) => (prev && dates.includes(prev) ? prev : initialDate && dates.includes(initialDate) ? initialDate : null));
        // "Book again": tick the same services as last time, if the creator still offers them.
        const preset = (presetServices.current ?? []).filter((id) => svc.some((s) => s.id === id));
        if (preset.length) setSelected((prev) => (prev.length ? prev : preset));
        // A free time tapped in Explore: pick it, if it is still free.
        const wantedStart = presetStart.current;
        if (wantedStart && initialDate && startTimesForDay(sched, initialDate).includes(wantedStart)) {
          setStart((prev) => prev ?? wantedStart);
        }
      })
      .catch((e) => active && setLoadError(errorMessage(e)))
      .finally(() => { if (active) { setLoading(false); setPulling(false); } });
    return () => { active = false; };
  }, [visible, creatorId, initialDate, reloadKey]);

  const dates = useMemo(() => availableDates(schedule), [schedule]);
  const startTimes = useMemo(() => (date ? startTimesForDay(schedule, date) : []), [schedule, date]);

  // A start time that is no longer offered (other date, or taken on reload) is cleared.
  const [prevStartTimes, setPrevStartTimes] = useState(startTimes);
  if (startTimes !== prevStartTimes) {
    setPrevStartTimes(startTimes);
    if (start && !startTimes.includes(start)) setStart(null);
  }

  // The server is the source of truth for fit, duration and price. A quote only counts for the
  // exact choices (and load) it was asked for; until that one arrives, it is still quoting.
  const selectionKey = selected.join(',');
  const quoteKey = creatorId && date && start && selected.length > 0
    ? `${creatorId}|${date}|${start}|${selectionKey}|${reloadKey}`
    : null;
  const [quoted, setQuoted] = useState<{ key: string; quote: BookingQuote } | null>(null);
  const quote = quoteKey && quoted?.key === quoteKey ? quoted.quote : null;
  const quoting = !!quoteKey && quoted?.key !== quoteKey;
  useEffect(() => {
    if (!quoteKey || !creatorId || !date || !start) return;
    let active = true;
    quoteBooking(creatorId, date, start, selected)
      .then((q) => active && setQuoted({ key: quoteKey, quote: q }))
      .catch((e) => active && setQuoted({ key: quoteKey, quote: { ok: false, reason: errorMessage(e) } }));
    return () => { active = false; };
  }, [quoteKey]); // eslint-disable-line react-hooks/exhaustive-deps -- quoteKey covers all inputs

  const toggleService = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const confirm = async () => {
    if (!creatorId || !date || !start || !quote?.ok || submitting) return;
    setSubmitting(true);
    try {
      const appointment = await bookAppointment(creatorId, date, start, selected);
      const comment = note.trim();
      if (comment) {
        // The booking is already made; a failed comment shouldn't undo it.
        try {
          await saveAppointmentNote(appointment.id, comment);
          appointment.customer_note = comment;
        } catch (e) {
          console.warn('[BookingModal] Could not save comment:', errorMessage(e));
        }
      }
      // Opens the phone's "new event" screen; handles its own errors, so the booking stands either way.
      // A request waiting for approval isn't a booking yet: it can be added from the Calendar once accepted.
      if (addToCalendar && appointment.status === 'confirmed') await addAppointmentToCalendar(appointment, 'customer');
      onBooked(appointment);
      // Schedule the 36 h / 2 h reminders. The first booking is when we ask for permission.
      void syncBookingReminders({ askPermission: true });
    } catch (e) {
      Alert.alert('Could not book', errorMessage(e));
      setReloadKey((n) => n + 1); // reloads the times and asks for a fresh quote
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
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.close} onPress={onClose} hitSlop={16} accessibilityLabel="Close">
            <Ionicons name="close" size={28} color={colors.ink} />
          </TouchableOpacity>
          <Text style={styles.title} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>Book {handle(creator?.name)}</Text>
          <View style={{ width: 44 }} />
        </View>

        {loading ? (
          <ActivityIndicator style={{ marginTop: 40 }} color={colors.wine} size="large" />
        ) : loadError ? (
          <View style={styles.pad}>
            <Text style={styles.error}>Could not load booking options: {loadError}</Text>
            <TouchableOpacity onPress={() => setReloadKey((n) => n + 1)}>
              <Text style={styles.link}>Try again</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={{ paddingBottom: 24 }}
            keyboardShouldPersistTaps="handled"
            refreshControl={
              <RefreshControl
                refreshing={pulling}
                {...HIDDEN_SPINNER}
                onRefresh={() => { quietReload.current = true; setPulling(true); setReloadKey((n) => n + 1); }}
              />
            }
          >
            <SectionTitle label="1. date" done={!!date} />
            {dates.length === 0 ? (
              <Text style={styles.empty}>This creator has no available times right now.</Text>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                {dates.map((d) => (
                  <Chip key={d} label={dateLabel(d)} active={d === date} onPress={() => setDate(d === date ? null : d)} />
                ))}
              </ScrollView>
            )}

            <SectionTitle label="2. start time" done={!!start} />
            {startTimes.length === 0 ? (
              <Text style={styles.empty}>Pick a date with availability first.</Text>
            ) : (
              <View style={[styles.chipRow, { flexWrap: 'wrap' }]}>
                {startTimes.map((t) => (
                  <Chip key={t} label={t} active={t === start} onPress={() => setStart(t === start ? null : t)} />
                ))}
              </View>
            )}

            <SectionTitle label="3. services" done={selected.length > 0} />
            {services.length === 0 ? (
              <Text style={styles.empty}>This creator has not added any services yet.</Text>
            ) : (
              services.map((s) => {
                const active = selected.includes(s.id);
                const hasDiscount = s.discount_price !== null && Number(s.discount_price) < Number(s.price);
                return (
                  <TouchableOpacity key={s.id} style={[styles.service, active && styles.serviceActive]} onPress={() => toggleService(s.id)}>
                    <Ionicons name={active ? 'checkbox' : 'square-outline'} size={22} color={active ? colors.pink : colors.ink} />
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

            <SectionTitle label="4. comment (optional)" done={note.trim().length > 0} />
            <TextInput
              style={styles.noteInput}
              placeholder="e.g. red stars, short almond shape"
              placeholderTextColor={colors.inkMuted}
              value={note}
              onChangeText={setNote}
              multiline
              maxLength={300}
            />

            <TouchableOpacity
              style={styles.calendarToggle}
              onPress={() => setAddToCalendar((v) => !v)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: addToCalendar }}
            >
              <Ionicons name={addToCalendar ? 'checkbox' : 'square-outline'} size={22} color={addToCalendar ? colors.pink : colors.ink} />
              <View style={{ flex: 1 }}>
                <Text style={styles.serviceName}>Add to my phone calendar</Text>
                <Text style={styles.serviceMeta}>Apple Calendar, Google Calendar or another calendar on your phone</Text>
              </View>
            </TouchableOpacity>
          </ScrollView>
        )}

        <RefreshStar refreshing={pulling} y={125} />

        <View style={styles.footer}>
          {quoting ? (
            <ActivityIndicator color={colors.wine} />
          ) : quote?.ok ? (
            <Text style={[styles.summary, styles.centered]}>
              {start}–{quote.end_time} · {quote.total_minutes} min · total {formatKr(quote.total_price)}
            </Text>
          ) : quote ? (
            <Text style={[styles.error, styles.centered]}>{quote.reason}</Text>
          ) : (
            <Text style={[styles.empty, styles.centered]}>Choose a date, start time and at least one service.</Text>
          )}
          <TouchableOpacity style={[styles.confirm, !canConfirm && styles.confirmDisabled]} disabled={!canConfirm} onPress={confirm}>
            {submitting ? <ActivityIndicator color={colors.wine} /> : <Text style={styles.confirmText}>Confirm booking</Text>}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
      </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}

/** Section heading; a small yellow star appears next to it once something is chosen. */
function SectionTitle({ label, done }: { label: string; done: boolean }) {
  return (
    <View style={styles.sectionRow}>
      <Text style={styles.sectionText}>{label}</Text>
      {done && <Image source={STAR} style={styles.sectionStar} />}
    </View>
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
  title: { fontSize: 15, fontFamily: fonts.title, color: colors.ink, flex: 1, textAlign: 'center' }, // shrinks further if a name is very long
  pad: { padding: 16 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginTop: 20, marginBottom: 8 },
  sectionText: { fontSize: 15, fontFamily: fonts.title, color: colors.ink },
  sectionStar: { width: 18, height: 18 },
  chipRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: '#ddd', backgroundColor: '#fff', marginBottom: 8 },
  chipActive: { backgroundColor: colors.pink, borderColor: colors.pink },
  chipText: { fontSize: 14, color: colors.ink, fontWeight: '500' },
  chipTextActive: { color: colors.ink },
  empty: { color: colors.ink, fontSize: 14, marginHorizontal: 16 },
  service: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 16, marginBottom: 8, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#ddd' },
  serviceActive: { borderColor: colors.wine, backgroundColor: colors.primarySoft },
  serviceName: { fontSize: 16, fontWeight: '600', color: colors.ink },
  serviceMeta: { fontSize: 13, color: colors.ink, marginTop: 2 },
  servicePrice: { fontSize: 15, fontWeight: '700', color: colors.ink },
  strike: { fontSize: 12, color: colors.ink, textDecorationLine: 'line-through' },
  footer: { padding: 16, gap: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#ddd' },
  centered: { textAlign: 'center' }, // footer messages above Confirm booking
  summary: { fontSize: 16, fontWeight: '700', color: colors.ink },
  error: { color: '#A12339', fontSize: 14 },
  link: { color: colors.ink, fontWeight: '700', marginTop: 10 },
  confirm: { backgroundColor: colors.pink, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  confirmDisabled: { opacity: 0.4 },
  noteInput: { marginHorizontal: 16, minHeight: 80, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#ddd', fontSize: 15, color: colors.ink, textAlignVertical: 'top' },
  confirmText: { color: colors.wine, fontSize: 16, fontWeight: '700' },
  calendarToggle: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 16, marginTop: 16, padding: 14 },
});
