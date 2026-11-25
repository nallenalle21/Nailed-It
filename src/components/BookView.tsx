import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Image, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from './AppText';
import { colors, fonts } from '../theme';
import { formatKr } from '../services/booking';
import {
  findBookableCreatorsForServices,
  freeTimeLabel,
  sortBookable,
  type BookSort,
  type BookableCreator,
  type FreeTime,
} from '../services/findBooking';
import { CATEGORY_LABELS, WORKPLACE_SHORT } from '../services/onboarding';

const PHOTOS_PER_CARD = 6;
// Free times shown on each card (plus the "All times" button).
const TIMES_PER_CARD = 2;

const dateLabel = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
};

type Props = {
  /** Portfolio photo URLs per freelancer (from the Explore feed). */
  photosByCreator: Record<string, string[]>;
  /** The Explore filter menu (same one as "Get inspired"): services, date, price and sort. */
  services: string[];
  /** "2026-11-27", or null = the next 14 days. */
  date: string | null;
  /** Null = any price. */
  matchesPrice: ((price: number) => boolean) | null;
  sort: BookSort;
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
  /** A touch started on something that scrolls sideways (map, photo strip): don't switch Explore tabs. */
  onSidewaysTouch?: () => void;
};

/**
 * Explore's "Book" mode: the map on top, then every freelancer as a card with a strip of
 * their photos and their next free times. Tap a time to book it. Filters and sorting come
 * from Explore's filter button, so both tabs use the same one.
 */
export default function BookView({
  photosByCreator, services, date, matchesPrice, sort, refreshKey, onLoaded, onBook, onOpenProfile, renderMap, excludeCreatorId, onSidewaysTouch,
}: Props) {
  // Results belong to the filters (and refresh) they were loaded for.
  const loadKey = `${date ?? ''}|${services.join(',')}|${refreshKey}`;
  const [loaded, setLoaded] = useState<{ key: string; list: BookableCreator[]; error?: string } | null>(null);
  const loading = loaded?.key !== loadKey;

  useEffect(() => {
    let active = true;
    findBookableCreatorsForServices({ date, services })
      .then((list) => active && setLoaded({ key: loadKey, list }))
      .catch((e) => active && setLoaded({ key: loadKey, list: [], error: e instanceof Error ? e.message : String(e?.message ?? e) }))
      .finally(() => { if (active) onLoaded?.(); });
    return () => { active = false; };
  }, [loadKey]); // eslint-disable-line react-hooks/exhaustive-deps -- loadKey covers date, services and refresh

  const creators = sortBookable(
    (loaded?.list ?? []).filter((c) =>
      c.id !== excludeCreatorId && (!matchesPrice || (c.fromPrice !== null && matchesPrice(c.fromPrice)))),
    sort,
  );
  const filtersOn = services.length > 0 || !!date || !!matchesPrice;

  return (
    <View>
      {/* Map on top: shows the nail techs that match the filters */}
      <View style={styles.mapWrap} onTouchStart={onSidewaysTouch}>{renderMap(creators)}</View>

      {loading && creators.length === 0 ? (
        <ActivityIndicator style={{ marginTop: 28 }} color={colors.blue} size="large" />
      ) : loaded?.error ? (
        <Text style={styles.empty}>Could not load nail techs: {loaded.error}</Text>
      ) : creators.length === 0 ? (
        <Text style={styles.empty}>
          {date ? `No nail techs have free time on ${dateLabel(date)} that match your filters.`
            : filtersOn ? 'No nail techs match your filters.' : 'No nail techs yet.'}
        </Text>
      ) : (
        creators.map((c) => (
          <CreatorCard
            key={c.id}
            creator={c}
            photos={(photosByCreator[c.id] ?? []).slice(0, PHOTOS_PER_CARD)}
            filtered={services.length > 0}
            onSidewaysTouch={onSidewaysTouch}
            onBook={(t) => onBook(c, t)}
            onOpenProfile={() => onOpenProfile(c.id)}
          />
        ))
      )}
    </View>
  );
}

function CreatorCard({ creator: c, photos, filtered, onBook, onOpenProfile, onSidewaysTouch }: {
  creator: BookableCreator;
  photos: string[];
  /** A service filter is on: say which service the times are for. */
  filtered: boolean;
  onBook: (time: FreeTime | null) => void;
  onOpenProfile: () => void;
  onSidewaysTouch?: () => void;
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
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photos} onTouchStart={onSidewaysTouch}>
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

      {c.nextTimes.length > 0 ? (
        <>
          <Text style={styles.timesLabel}>
            Next free{filtered ? ` for ${c.serviceName}` : ''}
          </Text>
          {/* One row of equal buttons: the next 2 free times + "All times" (text shrinks to fit, never overlaps) */}
          <View style={styles.timesRow}>
            {c.nextTimes.slice(0, TIMES_PER_CARD).map((t) => (
              <TouchableOpacity key={`${t.date}-${t.start}`} style={styles.time} onPress={() => onBook(t)}
                accessibilityLabel={`Book ${freeTimeLabel(t)}`}>
                <Text style={styles.timeText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{freeTimeLabel(t)}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={[styles.time, styles.allTimes]} onPress={() => onBook(null)}>
              <Text style={styles.allTimesText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>All times</Text>
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
  empty: { color: colors.inkMuted, textAlign: 'center', marginTop: 28, marginHorizontal: 24 },
  mapWrap: { marginHorizontal: 16, marginBottom: 12, height: 280, borderRadius: 16, overflow: 'hidden' },
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
  timesLabel: { fontSize: 12, color: colors.inkMuted, paddingHorizontal: 12, marginTop: 10, textTransform: 'uppercase', fontWeight: '600' },
  timesRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, marginTop: 6 },
  time: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8, paddingVertical: 9, borderRadius: 14, backgroundColor: colors.pink },
  timeText: { fontSize: 13, fontWeight: '700', color: colors.wine },
  allTimes: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.pink },
  allTimesText: { fontSize: 13, fontWeight: '600', color: colors.wine },
  noTimes: { fontSize: 13, color: colors.inkMuted, paddingHorizontal: 12, marginTop: 10 },
});
