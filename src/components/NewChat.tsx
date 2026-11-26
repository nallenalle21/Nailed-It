import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Keyboard, Modal, StyleSheet, TouchableOpacity, View } from 'react-native';
import { TextInput } from './AppTextInput';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Text } from './AppText';
import { colors, fonts } from '../theme';
import { handle } from '../utils/handle';
import { supabase } from '../services/supabase';
import { getVendorAvatarUrl } from '../services/vendorAvatar';

type Person = { id: string; username: string; role: string | null; avatarUrl: string | null };

const SEARCH_DELAY_MS = 250; // wait until typing pauses
const MAX_RESULTS = 20;

/**
 * "New chat" on the Chats page: a round button bottom right. It opens a search for usernames;
 * tap a person to open the chat with them (the existing one if you've talked before).
 */
export default function NewChat({ navigation, role }: { navigation: any; role: 'user' | 'creator' }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Person[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [myId, setMyId] = useState<string | null>(null);
  const searchId = useRef(0);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMyId(data.user?.id ?? null)).catch(() => {});
  }, []);

  // Search usernames as you type (ignores a leading @).
  useEffect(() => {
    const text = query.trim().replace(/^@/, '');
    if (!open || !text) {
      setResults([]);
      setSearching(false);
      return;
    }
    const id = ++searchId.current;
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const escaped = text.replace(/[%_\\]/g, (c) => `\\${c}`);
        const { data, error: err } = await supabase
          .from('profiles')
          .select('id, username, role')
          .ilike('username', `%${escaped}%`)
          .order('username')
          .limit(MAX_RESULTS + 1);
        if (err) throw err;
        const people = ((data ?? []) as { id: string; username: string | null; role: string | null }[])
          .filter((p) => p.id !== myId && p.username)
          // Best matches first: exact, then starts with, then the rest.
          .sort((a, b) => {
            const rank = (u: string) => (u.toLowerCase() === text.toLowerCase() ? 0 : u.toLowerCase().startsWith(text.toLowerCase()) ? 1 : 2);
            return rank(a.username!) - rank(b.username!) || a.username!.length - b.username!.length;
          })
          .slice(0, MAX_RESULTS);
        const withAvatars = await Promise.all(people.map(async (p) => ({
          id: p.id,
          username: p.username!,
          role: p.role,
          avatarUrl: await getVendorAvatarUrl(p.id).catch(() => null),
        })));
        if (id === searchId.current) { setResults(withAvatars); setError(null); }
      } catch (e) {
        if (id === searchId.current) { setResults([]); setError(e instanceof Error ? e.message : String(e)); }
      } finally {
        if (id === searchId.current) setSearching(false);
      }
    }, SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [query, open, myId]);

  const close = () => {
    Keyboard.dismiss();
    setOpen(false);
    setQuery('');
    setResults([]);
    setError(null);
  };

  const startChat = (p: Person) => {
    if (!myId) return;
    // Same id as everywhere else in the app: both user ids, sorted, joined with "_".
    const chatId = [myId, p.id].sort().join('_');
    close();
    navigation.navigate('ChatRoom', { chatId, customerName: p.username, role });
  };

  return (
    <>
      <TouchableOpacity style={styles.fab} onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel="New chat">
        <Ionicons name="create-outline" size={26} color={colors.wine} />
      </TouchableOpacity>

      <Modal visible={open} animationType="slide" presentationStyle="fullScreen" onRequestClose={close}>
        <SafeAreaProvider>
          <SafeAreaView style={styles.sheet} edges={['top', 'bottom']}>
            <View style={styles.header}>
              <Text style={styles.title}>New chat</Text>
              <TouchableOpacity onPress={close} hitSlop={12} accessibilityLabel="Close">
                <Ionicons name="close" size={26} color={colors.ink} />
              </TouchableOpacity>
            </View>

            <View style={styles.searchBox}>
              <Ionicons name="search" size={18} color={colors.inkMuted} />
              <TextInput
                style={styles.input}
                value={query}
                onChangeText={setQuery}
                placeholder="search usernames"
                placeholderTextColor={colors.inkMuted}
                autoFocus
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="search"
                clearButtonMode="while-editing"
              />
              {searching && <ActivityIndicator size="small" color={colors.wine} />}
            </View>

            <FlatList
              data={results}
              keyExtractor={(p) => p.id}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }}
              ListEmptyComponent={
                <Text style={styles.empty}>
                  {error ? `Could not search: ${error}`
                    : !query.trim() ? 'Type a username to start a chat.'
                    : searching ? '' : 'No one with that username.'}
                </Text>
              }
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.row} onPress={() => startChat(item)} accessibilityLabel={`Chat with ${handle(item.username)}`}>
                  {item.avatarUrl ? (
                    <Image source={{ uri: item.avatarUrl }} style={styles.avatar} />
                  ) : (
                    <View style={[styles.avatar, styles.avatarFallback]}>
                      <Text style={styles.avatarInitial}>{item.username.charAt(0).toUpperCase()}</Text>
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name} numberOfLines={1}>{handle(item.username)}</Text>
                    {item.role === 'creator' && <Text style={styles.role}>nail tech</Text>}
                  </View>
                  <Ionicons name="chatbubble-outline" size={20} color={colors.wine} />
                </TouchableOpacity>
              )}
            />
          </SafeAreaView>
        </SafeAreaProvider>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute', right: 20, bottom: 24, width: 58, height: 58, borderRadius: 29,
    backgroundColor: colors.pink, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 5,
  },
  sheet: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 },
  title: { fontSize: 20, color: colors.ink, fontFamily: fonts.title },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 20, marginBottom: 8,
    paddingHorizontal: 14, height: 46, borderRadius: 23, backgroundColor: '#f2f2f2',
  },
  input: { flex: 1, fontSize: 16, color: colors.ink },
  empty: { color: colors.inkMuted, textAlign: 'center', marginTop: 40 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  avatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.line },
  avatarFallback: { backgroundColor: colors.pink, alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { color: colors.wine, fontSize: 18, fontWeight: '700' },
  name: { fontSize: 16, color: colors.ink, fontWeight: '600' },
  role: { fontSize: 12, color: colors.inkMuted, marginTop: 2 },
});
