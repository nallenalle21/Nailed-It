import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Image, Modal, Platform, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { Text } from './AppText';
import { colors, fonts } from '../theme';
import { formatKr, toDateKey } from '../services/booking';
import {
  findBookableCreators,
  freeTimeLabel,
  sortBookable,
  type BookSort,
  type BookableCreator,
  type FreeTime,
} from '../services/findBooking';
import { CATEGORY_LABELS, WORKPLACE_SHORT } from '../services/onboarding';

const PHOTOS_PER_CARD = 6;

const dateChipLabel = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
};

type Props = {
  /** Portfolio photo URLs per freelancer (from the Explore feed). */
  photosByCreator: Record<string, string[]>;
  serviceOptions: string[];
  /** Bumped by pull-to-refresh / the refresh button. */
  refreshKey: number;
  onLoaded?: () => void;
  /** A time chip (time) or "All times" (null). */
  onBook: (creator: BookableCreator, time: FreeTime | null) => void;
  onOpenProfile: (creatorId: string) => void;
  /** The Explore map, with these freelancers as pins. */
  renderMap: (creators: BookableCreator[]) => ReactNode;
  /** Left out of the list: a freelancer can't book themselves. */
  excludeCreatorId?: string | null;
};

/**
 * Explore's "Book" mode: every freelancer as a card with a strip of their photos and their
 * next free times. Tap a time to book it. Sort by next available time or price; filter by
 * date and service; switch between list and map.
 */
export default function BookView({ photosByCreator, serviceOptions, refreshKey, onLoaded, onBook, onOpenProfile, renderMap, excludeCreatorId }: Props) {
  const [sort, setSort] = useState<BookSort>('next');
  const [date, setDate] = useState<string | null>(null);
  const [service, setService] = useState<string | null>(null);
  const [display, setDisplay] = useState<'list' | 'map'>('list');
  const [datePicker, setDatePicker] = useState(false);
  const [draftDate, setDraftDate] = useState(new Date());
  const [servicePicker, setServicePicker] = useState(false);

  // Results belong to the filters (and refresh) they were loaded for.
  const loadKey = `${date ?? ''}|${service ?? ''}|${refreshKey}`;
  const [loaded, setLoaded] = useState<{ key: string; list: BookableCreator[]; error?: string } | null>(null);
  const loading = loaded?.key !== loadKey;

  useEffect(() => {
    let active = true;
    findBookableCreators({ date, service })
      .then((list) => active && setLoaded({ key: loadKey, list }))
      .catch((e) => active && setLoaded({ key: loadKey, list: [], error: e instanceof Error ? e.message : String(e?.message ?? e) }))
      .finally(() => { if (active) onLoaded?.(); });
    return () => { active = false; };
  }, [loadKey]); // eslint-disable-line react-hooks/exhaustive-deps -- loadKey covers date, service and refresh

  const creators = sortBookable((loaded?.list ?? []).filter((c) => c.id !== excludeCreatorId), sort);

  const pickDate = (d: Date) => {
    setDate(toDateKey(d));
    setDatePicker(false);
  };

  return (
    <View>
      {/* Sort + filters */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        <Chip label="Next available" icon="flash-outline" active={sort === 'next'} onPress={() => setSort('next')} />
        <Chip label="Price" icon="pricetag-outline" active={sort === 'price'} onPress={() => setSort('price')} />
        <Chip
          label={date ? dateChipLabel(date) : 'Date'}
          icon="calendar-outline"
          active={!!date}
          onPress={() => { setDraftDate(new Date()); setDatePicker(true); }}
          onClear={date ? () => setDate(null) : undefined}
        />
        <Chip
          label={service ?? 'Service'}
          icon="brush-outline"
          active={!!service}
          onPress={() => setServicePicker(true)}
          onClear={service ? () => setService(null) : undefined}
        />
        <Chip
          label={display === 'list' ? 'Map' : 'List'}
          icon={display === 'list' ? 'map-outline' : 'list-outline'}
          active={false}
          onPress={() => setDisplay((v) => (v === 'list' ? 'map' : 'list'))}
        />
      </ScrollView>

      {loading && creators.length === 0 ? (
        <ActivityIndicator style={{ marginTop: 28 }} color={colors.blue} size="large" />
      ) : loaded?.error ? (
        <Text style={styles.empty}>Could not load nail techs: {loaded.error}</Text>
      ) : creators.length === 0 ? (
        <Text style={styles.empty}>
          {date ? `No nail techs have free time on ${dateChipLabel(date)}${service ? ` for ${service}` : ''}.`
            : service ? `No nail techs offer ${service} yet.` : 'No nail techs yet.'}
        </Text>
      ) : display === 'map' ? (
        <View style={styles.mapWrap}>{renderMap(creators)}</View>
      ) : (
        creators.map((c) => (
          <CreatorCard
            key={c.id}
            creator={c}
            photos={(photosByCreator[c.id] ?? []).slice(0, PHOTOS_PER_CARD)}
            filtered={!!service}
            onBook={(t) => onBook(c, t)}
            onOpenProfile={() => onOpenProfile(c.id)}
          />
        ))
      )}

      {/* Date filter */}
      {Platform.OS === 'ios' ? (
        <Modal visible={datePicker} transparent animationType="slide" onRequestClose={() => setDatePicker(false)}>
          <View style={styles.backdrop}>
            <View style={styles.sheet}>
              <Text style={styles.sheetTitle}>Which day?</Text>
              <DateTimePicker value={draftDate} mode="date" display="inline" minimumDate={new Date()} accentColor={colors.blue}
                onChange={(_, d) => d && setDraftDate(d)} />
              <View style={styles.sheetButtons}>
                <TouchableOpacity onPress={() => setDatePicker(false)}><Text style={styles.cancel}>Cancel</Text></TouchableOpacity>
                <TouchableOpacity style={styles.done} onPress={() => pickDate(draftDate)}><Text style={styles.doneText}>Show</Text></TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      ) : datePicker ? (
        <DateTimePicker value={draftDate} mode="date" minimumDate={new Date()}
          onChange={(e, d) => { setDatePicker(false); if (e.type === 'set' && d) pickDate(d); }} />
      ) : null}

      {/* Service filter */}
      <Modal visible={servicePicker} transparent animationType="slide" onRequestClose={() => setServicePicker(false)}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={() => setServicePicker(false)}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Which service?</Text>
            {serviceOptions.map((opt) => (
              <TouchableOpacity key={opt} style={styles.option} onPress={() => { setService(opt); setServicePicker(false); }}>
                <Text style={styles.optionText}>{opt}</Text>
                {opt === service && <Ionicons name="checkmark" size={20} color={colors.blue} />}
              </TouchableOpacity>
            ))}
            {service && (
              <TouchableOpacity style={styles.option} onPress={() => { setService(null); setServicePicker(false); }}>
                <Text style={[styles.optionText, { color: colors.inkMuted }]}>Any service</Text>
              </TouchableOpacity>
            )}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

function Chip({ label, icon, active, onPress, onClear }: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  active: boolean;
  onPress: () => void;
  onClear?: () => void;
}) {
  return (
    <TouchableOpacity style={[styles.chip, active && styles.chipActive]} onPress={onPress} accessibilityState={{ selected: active }}>
      <Ionicons name={icon} size={15} color={active ? colors.wine : colors.ink} />
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
      {onClear && (
        <TouchableOpacity onPress={onClear} hitSlop={10} accessibilityLabel={`Clear ${label}`}>
          <Ionicons name="close" size={14} color={colors.wine} />
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}

function CreatorCard({ creator: c, photos, filtered, onBook, onOpenProfile }: {
  creator: BookableCreator;
  photos: string[];
  /** A service filter is on: say which service the times are for. */
  filtered: boolean;
  onBook: (time: FreeTime | null) => void;
  onOpenProfile: () => void;
}) {
  // Where (approximate area only) and how: "Södermalm · Home studio, Travels to you (10 km)"
  const where = c.workplaceTypes.length
    ? c.workplaceTypes.map((w) => (w === 'mobile' && c.travelKm ? `${WORKPLACE_SHORT[w]} (${c.travelKm} km)` : WORKPLACE_SHORT[w])).join(', ')
    : null;
  const details = [c.city, where].filter(Boolean).join(' · ');
  const offers = [c.categories.map((k) => CATEGORY_LABELS[k]).join(' · '), c.fromPrice !== null ? `from ${formatKr(c.fromPrice)}` : null]
    .filter(Boolean).join(' · ');
  return (
    <View style={styles.card}>
      {/* Their work first, so it still feels like the inspiration feed */}
      {photos.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photos}>
          {photos.map((uri) => (
            <TouchableOpacity key={uri} activeOpacity={0.85} onPress={onOpenProfile}>
              <Image source={{ uri }} style={styles.photo} />
            </TouchableOpacity>
          ))}
        </ScrollView>
      ) : (
        <TouchableOpacity style={styles.noPhotos} onPress={onOpenProfile}>
          <Ionicons name="images-outline" size={22} color={colors.inkMuted} />
          <Text style={styles.noPhotosText}>No photos yet</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity style={styles.who} onPress={onOpenProfile} accessibilityLabel={`Open @${c.username}'s profile`}>
        <View style={styles.avatar}>
          {c.avatarUrl ? <Image source={{ uri: c.avatarUrl }} style={styles.avatarPhoto} />
            : <Text style={styles.avatarInitial}>{c.username.charAt(0).toUpperCase()}</Text>}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.name} numberOfLines={1}>{c.displayName}</Text>
          <Text style={styles.details} numberOfLines={1}>@{c.username}{details ? ` · ${details}` : ''}</Text>
          {offers ? <Text style={styles.details} numberOfLines={1}>{offers}</Text> : null}
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.inkMuted} />
      </TouchableOpacity>

      {c.serviceNames.length > 0 && (
        <Text style={styles.services} numberOfLines={1}>{c.serviceNames.slice(0, 4).join(' · ')}</Text>
      )}

      {c.nextTimes.length > 0 ? (
        <>
          <Text style={styles.timesLabel}>
            Next free{filtered ? ` for ${c.serviceName}` : ''}
          </Text>
          <View style={styles.times}>
            {c.nextTimes.map((t) => (
              <TouchableOpacity key={`${t.date}-${t.start}`} style={styles.time} onPress={() => onBook(t)}
                accessibilityLabel={`Book ${freeTimeLabel(t)}`}>
                <Text style={styles.timeText}>{freeTimeLabel(t)}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={[styles.time, styles.allTimes]} onPress={() => onBook(null)}>
              <Text style={styles.allTimesText}>All times</Text>
            </TouchableOpacity>
          </View>
        </>
      ) : (
        <Text style={styles.noTimes}>No free times in the next 2 weeks.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  chips: { gap: 8, paddingHorizontal: 16, paddingBottom: 12 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 18, borderWidth: 1, borderColor: colors.line, backgroundColor: '#fff' },
  chipActive: { backgroundColor: colors.pinkTint, borderColor: colors.pink },
  chipText: { fontSize: 13, color: colors.ink, fontWeight: '600' },
  chipTextActive: { color: colors.wine },
  empty: { color: colors.inkMuted, textAlign: 'center', marginTop: 28, marginHorizontal: 24 },
  mapWrap: { marginHorizontal: 16, height: 420, borderRadius: 18, overflow: 'hidden' },
  card: { marginHorizontal: 16, marginBottom: 16, paddingVertical: 12, borderRadius: 18, backgroundColor: '#fff', borderWidth: 1, borderColor: colors.line },
  photos: { gap: 6, paddingHorizontal: 12 },
  photo: { width: 112, height: 140, borderRadius: 12, backgroundColor: '#F1E9EE' },
  noPhotos: { marginHorizontal: 12, height: 80, borderRadius: 12, backgroundColor: '#F7F1F4', alignItems: 'center', justifyContent: 'center', gap: 4 },
  noPhotosText: { fontSize: 12, color: colors.inkMuted },
  who: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, marginTop: 12 },
  avatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.pinkTint, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarPhoto: { width: '100%', height: '100%' },
  avatarInitial: { fontSize: 16, fontWeight: '700', color: colors.wine },
  name: { fontSize: 15, fontFamily: fonts.title, color: colors.ink },
  details: { fontSize: 13, color: colors.inkMuted, marginTop: 1 },
  services: { fontSize: 13, color: colors.ink, paddingHorizontal: 12, marginTop: 8 },
  timesLabel: { fontSize: 12, color: colors.inkMuted, paddingHorizontal: 12, marginTop: 10, textTransform: 'uppercase', fontWeight: '600' },
  times: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 12, marginTop: 6 },
  time: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14, backgroundColor: colors.pink },
  timeText: { fontSize: 13, fontWeight: '700', color: colors.wine },
  allTimes: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.pink },
  allTimesText: { fontSize: 13, fontWeight: '600', color: colors.wine },
  noTimes: { fontSize: 13, color: colors.inkMuted, paddingHorizontal: 12, marginTop: 10 },
  backdrop: { flex: 1, backgroundColor: 'rgba(11,21,14,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 36 },
  sheetTitle: { fontSize: 17, fontFamily: fonts.title, color: colors.ink, marginBottom: 12 },
  sheetButtons: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 20, marginTop: 8 },
  cancel: { fontSize: 16, color: colors.inkMuted },
  done: { backgroundColor: colors.pink, borderRadius: 10, paddingHorizontal: 18, paddingVertical: 8 },
  doneText: { color: colors.wine, fontSize: 16, fontWeight: '700' },
  option: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  optionText: { fontSize: 16, color: colors.ink },
});
