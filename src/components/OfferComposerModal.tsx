import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { Text } from './AppText';
import { colors, fonts } from '../theme';
import { handle } from '../utils/handle';
import { fetchStudioAddress, formatKr, toDateKey, toTime } from '../services/booking';
import { sendBookingOffer } from '../services/offers';

const DURATIONS = [30, 45, 60, 75, 90, 120, 150, 180];

const errorMessage = (e: unknown) =>
  e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String((e as any).message) : String(e);

/** Tomorrow at 10:00: a sensible first suggestion. */
const defaultStart = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 10, 0);
};

const durationLabel = (min: number) =>
  min < 60 ? `${min} min` : `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ''}`;

type Props = {
  chatId: string;
  creatorId: string;
  customerName: string;
  onClose: () => void;
  onSent: () => void;
};

/**
 * The freelancer's "send a booking offer" sheet in the chat: header, optional notes, date,
 * start time, length, place and price. Mount it only while open, so it starts fresh each time.
 */
export default function OfferComposerModal({ chatId, creatorId, customerName, onClose, onSent }: Props) {
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [when, setWhen] = useState(defaultStart);
  const [duration, setDuration] = useState(60);
  const [place, setPlace] = useState('');
  const [price, setPrice] = useState('');
  const [androidPicker, setAndroidPicker] = useState<'date' | 'time' | null>(null);
  const [sending, setSending] = useState(false);

  // Start from the studio address in Work Locations (still editable), unless they already typed one.
  useEffect(() => {
    let active = true;
    fetchStudioAddress(creatorId)
      .then((address) => active && address && setPlace((current) => current || address))
      .catch(() => {});
    return () => { active = false; };
  }, [creatorId]);

  const startMinutes = when.getHours() * 60 + when.getMinutes();
  const endMinutes = startMinutes + duration;
  const priceValue = Number(price.replace(',', '.').replace(/\s/g, ''));
  const problem =
    !title.trim() ? 'Add a header.'
    : when <= new Date() ? 'Pick a time in the future.'
    : endMinutes >= 24 * 60 ? 'The appointment has to end before midnight.'
    : !price.trim() || !Number.isFinite(priceValue) || priceValue < 0 ? 'Enter a price.'
    : null;

  const pickDate = (d: Date) =>
    setWhen((prev) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), prev.getHours(), prev.getMinutes()));
  const pickTime = (d: Date) =>
    setWhen((prev) => new Date(prev.getFullYear(), prev.getMonth(), prev.getDate(), d.getHours(), d.getMinutes()));

  const send = async () => {
    if (problem || sending) return;
    setSending(true);
    try {
      await sendBookingOffer(chatId, {
        title: title.trim(),
        notes: notes.trim(),
        date: toDateKey(when),
        start: toTime(startMinutes),
        durationMinutes: duration,
        place: place.trim(),
        price: priceValue,
      });
      onSent();
    } catch (e) {
      Alert.alert('Could not send the offer', errorMessage(e));
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      {/* A Modal is a separate native window, so it needs its own safe-area provider. */}
      <SafeAreaProvider>
      <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.close} onPress={onClose} hitSlop={16} accessibilityLabel="Close">
            <Ionicons name="close" size={28} color={colors.ink} />
          </TouchableOpacity>
          <Text style={styles.title} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
            Offer to {handle(customerName)}
          </Text>
          <View style={{ width: 44 }} />
        </View>

        <ScrollView contentContainerStyle={{ paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
          <Text style={styles.sectionText}>header</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Gel extensions"
            placeholderTextColor={colors.inkMuted}
            value={title}
            onChangeText={setTitle}
            maxLength={80}
          />

          <Text style={styles.sectionText}>notes (optional)</Text>
          <TextInput
            style={[styles.input, styles.multiline]}
            placeholder="e.g. almond shape, two colours"
            placeholderTextColor={colors.inkMuted}
            value={notes}
            onChangeText={setNotes}
            multiline
            maxLength={300}
          />

          <Text style={styles.sectionText}>date and start time</Text>
          {Platform.OS === 'ios' ? (
            <View style={styles.pickerRow}>
              <DateTimePicker value={when} mode="date" display="compact" minimumDate={new Date()} accentColor={colors.blue}
                onChange={(_, d) => d && pickDate(d)} />
              <DateTimePicker value={when} mode="time" display="compact" minuteInterval={5} accentColor={colors.blue}
                onChange={(_, d) => d && pickTime(d)} />
            </View>
          ) : (
            <View style={styles.pickerRow}>
              <TouchableOpacity style={styles.pickerButton} onPress={() => setAndroidPicker('date')}>
                <Ionicons name="calendar-outline" size={18} color={colors.ink} />
                <Text style={styles.pickerText}>
                  {when.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.pickerButton} onPress={() => setAndroidPicker('time')}>
                <Ionicons name="time-outline" size={18} color={colors.ink} />
                <Text style={styles.pickerText}>{toTime(startMinutes)}</Text>
              </TouchableOpacity>
              {androidPicker && (
                <DateTimePicker
                  value={when}
                  mode={androidPicker}
                  is24Hour
                  minimumDate={androidPicker === 'date' ? new Date() : undefined}
                  onChange={(e, d) => {
                    const which = androidPicker;
                    setAndroidPicker(null);
                    if (e.type === 'set' && d) (which === 'date' ? pickDate : pickTime)(d);
                  }}
                />
              )}
            </View>
          )}

          <Text style={styles.sectionText}>length</Text>
          <View style={styles.chipRow}>
            {DURATIONS.map((min) => (
              <TouchableOpacity
                key={min}
                style={[styles.chip, min === duration && styles.chipActive]}
                onPress={() => setDuration(min)}
              >
                <Text style={styles.chipText}>{durationLabel(min)}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.sectionText}>place</Text>
          <TextInput
            style={styles.input}
            placeholder="Address"
            placeholderTextColor={colors.inkMuted}
            value={place}
            onChangeText={setPlace}
            maxLength={200}
          />

          <Text style={styles.sectionText}>price</Text>
          <View style={styles.priceRow}>
            <TextInput
              style={[styles.input, styles.priceInput]}
              placeholder="0"
              placeholderTextColor={colors.inkMuted}
              value={price}
              onChangeText={setPrice}
              keyboardType="decimal-pad"
              maxLength={8}
            />
            <Text style={styles.kr}>kr</Text>
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <Text style={[styles.summary, problem && styles.muted]}>
            {problem ?? `${toTime(startMinutes)}–${toTime(endMinutes)} · ${durationLabel(duration)} · ${formatKr(priceValue)}`}
          </Text>
          <TouchableOpacity style={[styles.send, (problem || sending) && styles.sendDisabled]} disabled={!!problem || sending} onPress={send}>
            {sending ? <ActivityIndicator color={colors.wine} /> : <Text style={styles.sendText}>Send offer</Text>}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
      </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingTop: Platform.OS === 'android' ? 12 : 4, paddingBottom: 10 },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 15, fontFamily: fonts.title, color: colors.ink, flex: 1, textAlign: 'center' },
  sectionText: { fontSize: 15, fontFamily: fonts.title, color: colors.ink, marginHorizontal: 16, marginTop: 20, marginBottom: 8 },
  input: { marginHorizontal: 16, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#ddd', fontSize: 15, color: colors.ink },
  multiline: { minHeight: 70, textAlignVertical: 'top' },
  pickerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16 },
  pickerButton: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: '#ddd' },
  pickerText: { fontSize: 15, color: colors.ink, fontWeight: '500' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: '#ddd', backgroundColor: '#fff' },
  chipActive: { backgroundColor: colors.pink, borderColor: colors.pink },
  chipText: { fontSize: 14, color: colors.ink, fontWeight: '500' },
  priceRow: { flexDirection: 'row', alignItems: 'center' },
  priceInput: { flex: 1, marginRight: 8 },
  kr: { fontSize: 16, fontWeight: '600', color: colors.ink, marginRight: 16 },
  footer: { padding: 16, gap: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#ddd' },
  summary: { fontSize: 16, fontWeight: '700', color: colors.ink, textAlign: 'center' },
  muted: { fontWeight: '400', color: colors.inkMuted },
  send: { backgroundColor: colors.pink, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  sendDisabled: { opacity: 0.4 },
  sendText: { color: colors.wine, fontSize: 16, fontWeight: '700' },
});
