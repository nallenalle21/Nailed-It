import React, { useState, useEffect } from 'react';
import { RefreshStar, useStarRefresh } from '../../components/SparkleStars';
import StarredTitle from '../../components/StarredTitle';
import { colors } from '../../theme';
import { handle } from '../../utils/handle';
import { View, StyleSheet, FlatList, TouchableOpacity, Image, ActivityIndicator, RefreshControl } from 'react-native';
import { Text } from '../../components/AppText';
import { supabase } from '../../services/supabase';
import { getVendorAvatarUrl } from '../../services/vendorAvatar';

export default function ChatsUser({ navigation }: any) {
  // Pull down to refresh: spinning star instead of the system spinner.
  const pull = useStarRefresh(() => fetchMyChats());
  const [chats, setChats] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMyChats();
  }, []);

  const fetchMyChats = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Hämta meddelanden för denna användare
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .like('chat_id', `%${user.id}%`) // Hämtar bara chattar där din inloggade användare är med
      .order('created_at', { ascending: false });

    if (data) {
      // 1. Filtrera fram unika chattrum
      const uniqueChats = data.reduce((acc: any[], message) => {
        if (!acc.find(c => c.id === message.chat_id)) {

          // Eftersom vi bygger chat_id som "id1_id2", kan vi dela på det för att hitta den andra personen
          const ids = message.chat_id.split('_');
          const otherUserId = ids.find((id: string) => id !== user.id) || message.sender_id;

          acc.push({
            id: message.chat_id,
            otherUserId: otherUserId, // Spara den andra personens ID
            creatorName: 'Laddar...', // Platshållare medan vi hämtar namnet
            lastMessage: message.text,
            time: new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            unread: false
          });
        }
        return acc;
      }, []);

      // 2. Slå upp `username` för varje chatt i din profiles-tabell
      for (let chat of uniqueChats) {
        if (chat.otherUserId) {
          // Their real profile picture (same storage as the profile pages); null → initial circle.
          chat.avatarUrl = await getVendorAvatarUrl(chat.otherUserId).catch(() => null);
          const { data: profile } = await supabase
            .from('profiles')
            .select('username') // Hämtar username från din databas
            .eq('id', chat.otherUserId)
            .single();

          if (profile && profile.username) {
            chat.creatorName = profile.username;
          } else {
            chat.creatorName = "Okänd användare";
          }
        }
      }

      setChats(uniqueChats);
    }
    setLoading(false);
  };

  const handlePressChat = (chatId: string, creatorName: string) => {
    navigation.navigate('ChatRoom', { chatId, customerName: creatorName, role: 'user' });
  };

  if (loading) return <ActivityIndicator style={{ flex: 1 }} size="large" />;

  const renderItem = ({ item }: any) => (
    <TouchableOpacity style={styles.chatItem} onPress={() => handlePressChat(item.id, item.creatorName)}>
      {item.avatarUrl ? (
        <Image source={{ uri: item.avatarUrl }} style={styles.avatar} />
      ) : (
        <View style={[styles.avatar, styles.avatarFallback]}>
          <Text style={styles.avatarInitial}>{(item.creatorName || '?').replace('@', '').charAt(0).toUpperCase()}</Text>
        </View>
      )}
      <View style={styles.chatInfo}>
        <View style={styles.chatHeader}>
          <Text style={[styles.name, item.unread && styles.unreadText]}>{handle(item.creatorName)}</Text>
          <Text style={styles.time}>{item.time}</Text>
        </View>
        <Text style={[styles.message, item.unread && styles.unreadText]} numberOfLines={1}>
          {item.lastMessage}
        </Text>
      </View>
      {item.unread && <View style={styles.unreadDot} />}
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <StarredTitle style={styles.headerTitle} containerStyle={styles.headerTitleWrap}>My Chats</StarredTitle>
      <FlatList refreshControl={<RefreshControl {...pull.control} />}
        data={chats}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={[styles.listContainer, chats.length === 0 && styles.emptyContainer]}
        ListEmptyComponent={<Text style={styles.emptyText}>no messages yet</Text>}
      />
      <RefreshStar refreshing={pull.refreshing} y={155} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  headerTitleWrap: { alignSelf: 'flex-start', marginHorizontal: 20, marginTop: 84, marginBottom: 10 },
  // Centres "no messages yet" in the space below the title
  emptyContainer: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', paddingBottom: 80 },
  emptyText: { color: colors.inkMuted, fontSize: 15 },
  headerTitle: { fontSize: 24 },
  listContainer: { paddingHorizontal: 20 },
  chatItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: colors.line },
  avatar: { width: 50, height: 50, borderRadius: 25, marginRight: 15, backgroundColor: colors.line },
  avatarFallback: { backgroundColor: colors.pink, alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { color: colors.wine, fontSize: 20, fontWeight: '700' },
  chatInfo: { flex: 1, justifyContent: 'center' },
  chatHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  name: { fontSize: 16, fontWeight: '500' },
  time: { fontSize: 12, color: colors.inkMuted },
  message: { fontSize: 14, color: colors.inkMuted },
  unreadText: { fontWeight: 'bold', color: colors.ink },
  unreadDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: 'red', marginLeft: 10 },
});