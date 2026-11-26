import { useEffect, useRef, useState, type ComponentRef, type ReactNode } from 'react';
import { ActivityIndicator, Image, Keyboard, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { TextInput } from './AppTextInput';
import { Ionicons } from '@expo/vector-icons';
import { Text } from './AppText';
import { colors } from '../theme';
import { formatKr } from '../services/booking';
import {
  clearRecentCreators,
  forgetCreator,
  getRecentCreators,
  rememberCreator,
  searchCreators,
  type CreatorSearchResult,
} from '../services/creatorSearch';

const DEBOUNCE_MS = 150; // waits for a pause in typing, so fast typing doesn't send a request per letter

type Props = {
  /** Text the photo feed is filtered by (only set via "See photos for …"). */
  feedQuery: string;
  onFeedQueryChange: (query: string) => void;
  onOpenProfile: (creatorId: string) => void;
  placeholder?: string;
  /** The bar is only shown once the search icon in the page header is tapped. */
  open: boolean;
  /** Called when the bar closes again (Cancel, picking a profile, "See photos for …"). */
  onClose: () => void;
  /** The page itself (map, feed …): hidden while searching, like Instagram. */
  children: ReactNode;
  /** The screen around it doesn't scroll (Explore's Feed/Book pages): let the search results scroll by themselves. */
  scrollResults?: boolean;
};

/**
 * Instagram-style search for the Explore pages. The search icon in the header opens the bar
 * (keyboard up right away) and swaps the page for results:
 * recent profiles at first, then matching freelancers that update with every letter. Tapping
 * one opens their profile; "See photos for …" filters the feed instead. The feed itself is
 * never filtered just by typing.
 */
export default function ExploreSearch({ feedQuery, onFeedQueryChange, onOpenProfile, placeholder, open: barOpen, onClose, children, scrollResults }: Props) {
  const inputRef = useRef<ComponentRef<typeof TextInput>>(null);
  const [query, setQuery] = useState(feedQuery);
  const [searching, setSearching] = useState(false);
  // Results belong to the text they were fetched for; older answers are ignored.
  const [found, setFound] = useState<{ q: string; items: CreatorSearchResult[]; error?: string } | null>(null);
  const [recents, setRecents] = useState<CreatorSearchResult[]>([]);

  const q = query.trim();
  const results = found?.q === q ? found.items : [];
  const loading = searching && q !== '' && found?.q !== q;

  // Live search: after each pause in typing.
  useEffect(() => {
    if (!searching || !q) return;
    let active = true;
    const timer = setTimeout(() => {
      searchCreators(q)
        .then((items) => active && setFound({ q, items }))
        .catch((e) => active && setFound({ q, items: [], error: e instanceof Error ? e.message : String(e?.message ?? e) }));
    }, DEBOUNCE_MS);
    return () => { active = false; clearTimeout(timer); };
  }, [searching, q]);

  // Recent profiles, read each time the search opens.
  useEffect(() => {
    if (!searching) return;
    let active = true;
    getRecentCreators().then((list) => active && setRecents(list));
    return () => { active = false; };
  }, [searching]);

  const close = () => {
    Keyboard.dismiss();
    inputRef.current?.blur();
    setSearching(false);
    onClose();
  };

  const cancel = () => {
    close();
    setQuery(feedQuery); // back to what the feed shows
  };

  const open = (c: CreatorSearchResult) => {
    void rememberCreator(c);
    cancel();
    onOpenProfile(c.id);
  };

  const seePhotos = () => {
    if (!q) return;
    onFeedQueryChange(q);
    setQuery(q);
    close();
  };

  const clearText = () => {
    setQuery('');
    if (!searching) onFeedQueryChange('');
  };

  return (
    <>
      {barOpen && (
      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color={colors.blue} />
          <TextInput
            ref={inputRef}
            style={styles.searchInput}
            placeholder={placeholder ?? 'search nail techs'}
            placeholderTextColor={colors.inkMuted}
            value={query}
            onChangeText={setQuery}
            onFocus={() => setSearching(true)}
            onSubmitEditing={seePhotos}
            returnKeyType="search"
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
          />
          {query ? (
            <TouchableOpacity onPress={clearText} hitSlop={10} accessibilityLabel="Clear search">
              <Ionicons name="close-circle" size={18} color="#bbb" />
            </TouchableOpacity>
          ) : null}
        </View>
        <TouchableOpacity onPress={cancel} hitSlop={8}>
          <Text style={styles.cancel}>Cancel</Text>
        </TouchableOpacity>
      </View>
      )}

      {!searching ? (
        <>
          {feedQuery ? (
            <View style={styles.activeRow}>
              <TouchableOpacity style={styles.activeChip} onPress={() => { onFeedQueryChange(''); setQuery(''); }} accessibilityLabel="Stop filtering photos">
                <Text style={styles.activeText} numberOfLines={1}>Photos matching “{feedQuery}”</Text>
                <Ionicons name="close" size={14} color={colors.wine} />
              </TouchableOpacity>
            </View>
          ) : null}
          {children}
        </>
      ) : (scrollResults ? (results: ReactNode) => (
        <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled">{results}</ScrollView>
      ) : (results: ReactNode) => results)(!q ? (
        // Empty search: recent profiles
        <View style={styles.panel}>
          {recents.length > 0 ? (
            <>
              <View style={styles.panelHeader}>
                <Text style={styles.panelTitle}>Recent</Text>
                <TouchableOpacity onPress={() => { void clearRecentCreators(); setRecents([]); }} hitSlop={8}>
                  <Text style={styles.clearAll}>Clear all</Text>
                </TouchableOpacity>
              </View>
              {recents.map((c) => (
                <ResultRow key={c.id} creator={c} onPress={() => open(c)}
                  onRemove={() => { void forgetCreator(c.id).then(setRecents); }} />
              ))}
            </>
          ) : (
            <Text style={styles.hint}>Search nail techs by their name.</Text>
          )}
        </View>
      ) : (
        // Typing: matching freelancers, then the option to filter the photos instead
        <View style={styles.panel}>
          {results.map((c) => <ResultRow key={c.id} creator={c} onPress={() => open(c)} />)}
          {loading && results.length === 0 ? <ActivityIndicator style={{ marginVertical: 16 }} color={colors.blue} /> : null}
          {!loading && found?.error ? <Text style={styles.hint}>Could not search: {found.error}</Text> : null}
          {!loading && !found?.error && results.length === 0 ? (
            <Text style={styles.hint}>No nail techs called “{q}”.</Text>
          ) : null}
          <TouchableOpacity style={styles.photosRow} onPress={seePhotos}>
            <View style={styles.photosIcon}>
              <Ionicons name="images-outline" size={20} color={colors.blue} />
            </View>
            <Text style={styles.photosText} numberOfLines={1}>See photos for “{q}”</Text>
          </TouchableOpacity>
        </View>
      ))}
    </>
  );
}

function ResultRow({ creator: c, onPress, onRemove }: { creator: CreatorSearchResult; onPress: () => void; onRemove?: () => void }) {
  const details = [c.city, c.fromPrice !== null ? `from ${formatKr(c.fromPrice)}` : null].filter(Boolean).join(' · ');
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} accessibilityLabel={`Open @${c.username}'s profile`}>
      <View style={styles.avatar}>
        {c.avatarUrl ? (
          <Image source={{ uri: c.avatarUrl }} style={styles.avatarPhoto} />
        ) : (
          <Text style={styles.avatarInitial}>{c.username.charAt(0).toUpperCase()}</Text>
        )}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.name} numberOfLines={1}>{c.displayName ?? `@${c.username}`}</Text>
        {c.displayName ? <Text style={styles.details} numberOfLines={1}>@{c.username}</Text> : null}
        {details ? <Text style={styles.details} numberOfLines={1}>{details}</Text> : null}
      </View>
      {onRemove ? (
        <TouchableOpacity onPress={onRemove} hitSlop={10} accessibilityLabel={`Remove @${c.username} from recent`}>
          <Ionicons name="close" size={18} color={colors.inkMuted} />
        </TouchableOpacity>
      ) : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16, marginBottom: 12 },
  // Same look as the Explore search bar before
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, paddingHorizontal: 14, height: 46, borderRadius: 23, backgroundColor: '#f2f2f2' },
  searchInput: { flex: 1, fontSize: 16, color: colors.ink },
  cancel: { fontSize: 15, color: colors.ink, fontWeight: '600' },
  activeRow: { flexDirection: 'row', marginHorizontal: 16, marginTop: -4, marginBottom: 10 },
  activeChip: { flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: '100%', backgroundColor: colors.pinkTint, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 6 },
  activeText: { fontSize: 13, color: colors.wine, fontWeight: '600', flexShrink: 1 },
  panel: { marginHorizontal: 16, minHeight: 400 },
  panelHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  panelTitle: { fontSize: 15, fontWeight: '700', color: colors.ink },
  clearAll: { fontSize: 14, color: colors.blue, fontWeight: '600' },
  hint: { color: colors.inkMuted, paddingVertical: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.pinkTint, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarPhoto: { width: '100%', height: '100%' },
  avatarInitial: { fontSize: 19, fontWeight: '700', color: colors.wine },
  name: { fontSize: 15, fontWeight: '700', color: colors.ink },
  details: { fontSize: 13, color: colors.inkMuted, marginTop: 1 },
  photosRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, marginTop: 4, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  photosIcon: { width: 48, height: 48, borderRadius: 24, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  photosText: { flex: 1, fontSize: 15, color: colors.ink, fontWeight: '600' },
});
