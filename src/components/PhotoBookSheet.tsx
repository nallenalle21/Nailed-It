import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Modal, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from './AppText';
import { colors, fonts } from '../theme';
import { handle } from '../utils/handle';
import { formatKr } from '../services/booking';
import { findBookableCreators, freeTimeLabel, type BookableCreator, type FreeTime } from '../services/findBooking';

export type SheetPhoto = { id: string; uri: string; caption: string; vendorId: string; creatorName: string };

type Props = {
  photo: SheetPhoto | null;
  onClose: () => void;
  /** A time chip (time) or "Book this look" (null). */
  onBook: (creator: BookableCreator, time: FreeTime | null) => void;
  onOpenProfile: (creatorId: string) => void;
};

/** Tapping a photo in the feed: the photo large, who made it, their next free times and "Book this look". */
export default function PhotoBookSheet({ photo, onClose, onBook, onOpenProfile }: Props) {
  const vendorId = photo?.vendorId ?? null;
  // Free times belong to the freelancer they were loaded for.
  const [loaded, setLoaded] = useState<{ id: string; creator: BookableCreator | null } | null>(null);
  const creator = loaded?.id === vendorId ? loaded.creator : null;
  const loading = !!vendorId && loaded?.id !== vendorId;

  useEffect(() => {
    if (!vendorId) return;
    let active = true;
    findBookableCreators({ creatorId: vendorId })
      .then((list) => active && setLoaded({ id: vendorId, creator: list[0] ?? null }))
      .catch(() => active && setLoaded({ id: vendorId, creator: null }));
    return () => { active = false; };
  }, [vendorId]);

  return (
    <Modal visible={photo !== null} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={styles.sheet}>
          {photo && (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 8 }}>
              <View style={styles.handle} />
              <Image source={{ uri: photo.uri }} style={styles.photo} resizeMode="cover" />
              {photo.caption ? <Text style={styles.caption}>{photo.caption}</Text> : null}

              <TouchableOpacity style={styles.who} onPress={() => onOpenProfile(photo.vendorId)}>
                <View style={styles.avatar}>
                  {creator?.avatarUrl ? <Image source={{ uri: creator.avatarUrl }} style={styles.avatarPhoto} />
                    : <Text style={styles.avatarInitial}>{(photo.creatorName || '?').replace('@', '').charAt(0).toUpperCase()}</Text>}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name} numberOfLines={1}>{handle(photo.creatorName)}</Text>
                  <Text style={styles.details} numberOfLines={1}>
                    {[creator?.city, creator?.fromPrice != null ? `from ${formatKr(creator.fromPrice)}` : null].filter(Boolean).join(' · ') || 'View profile'}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.inkMuted} />
              </TouchableOpacity>

              {loading ? (
                <ActivityIndicator style={{ marginVertical: 16 }} color={colors.blue} />
              ) : creator && creator.nextTimes.length > 0 ? (
                <>
                  <Text style={styles.timesLabel}>Next free</Text>
                  <View style={styles.times}>
                    {creator.nextTimes.map((t) => (
                      <TouchableOpacity key={`${t.date}-${t.start}`} style={styles.time} onPress={() => onBook(creator, t)}>
                        <Text style={styles.timeText}>{freeTimeLabel(t)}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              ) : (
                <Text style={styles.noTimes}>
                  {creator ? 'No free times in the next 2 weeks.' : 'This nail tech hasn’t added any services yet.'}
                </Text>
              )}

              <TouchableOpacity
                style={[styles.book, !creator && styles.bookDisabled]}
                disabled={!creator}
                onPress={() => creator && onBook(creator, null)}
              >
                <Ionicons name="sparkles-outline" size={18} color={colors.wine} />
                <Text style={styles.bookText}>Book this look</Text>
              </TouchableOpacity>
            </ScrollView>
          )}
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(11,21,14,0.45)', justifyContent: 'flex-end' },
  sheet: { maxHeight: '88%', backgroundColor: colors.background, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 16, paddingBottom: 32 },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.line, marginVertical: 10 },
  photo: { width: '100%', aspectRatio: 4 / 5, borderRadius: 16, backgroundColor: '#F1E9EE' },
  caption: { fontSize: 14, color: colors.ink, marginTop: 10 },
  who: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.pinkTint, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarPhoto: { width: '100%', height: '100%' },
  avatarInitial: { fontSize: 17, fontWeight: '700', color: colors.wine },
  name: { fontSize: 15, fontFamily: fonts.title, color: colors.ink },
  details: { fontSize: 13, color: colors.inkMuted, marginTop: 1 },
  timesLabel: { fontSize: 12, color: colors.inkMuted, marginTop: 14, textTransform: 'uppercase', fontWeight: '600' },
  times: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  time: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14, backgroundColor: colors.pink },
  timeText: { fontSize: 13, fontWeight: '700', color: colors.wine },
  noTimes: { fontSize: 13, color: colors.inkMuted, marginTop: 14 },
  book: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 18, backgroundColor: colors.pink, borderRadius: 14, paddingVertical: 14 },
  bookDisabled: { opacity: 0.4 },
  bookText: { color: colors.wine, fontSize: 16, fontWeight: '700' },
});
