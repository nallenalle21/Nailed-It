import React, { useState, useEffect, useCallback } from 'react';
import { RefreshStar, useStarRefresh } from '../../components/SparkleStars';
import PageHeader from '../../components/PageHeader';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../../theme';
import { handle } from '../../utils/handle';
import { View, StyleSheet, FlatList, TouchableOpacity, Image, ActivityIndicator, RefreshControl } from 'react-native';
import { Text } from '../../components/AppText';
import { supabase } from '../../services/supabase';
import { getVendorAvatarUrl } from '../../services/vendorAvatar';
import NewChat from '../../components/NewChat';
import { useIsFocused } from '@react-navigation/native';

export default function ChatsCreator({ navigation }: any) {
  const [chats, setChats] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const isFocused = useIsFocused(); // För att uppdatera listan varje gång man går in på skärmen

  const fetchMyChats = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Hämta meddelanden där denna kreatör är med
    const { data } = await supabase
      .from('messages')
      .select('*')
      .like('chat_id', `%${user.id}%`)
      .order('created_at', { ascending: false });

    if (data) {
      // 1. Filtrera fram unika chattrum
      const uniqueChats = data.reduce((acc: any[], message) => {
        if (!acc.find((c: any) => c.id === message.chat_id)) {
          const ids = message.chat_id.split('_');
          const otherUserId = ids.find((id: string) => id !== user.id) || message.sender_id;

          acc.push({
            id: message.chat_id,
            otherUserId: otherUserId,
            customerName: 'Laddar...',
            lastMessage: message.text,
            time: new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            unread: false
          });
        }
        return acc;
      }, []);

      // 2. Slå upp namnet på kunden i profiles-tabellen
      for (let chat of uniqueChats) {
        if (chat.otherUserId) {
          // Their real profile picture (same storage as the profile pages); null → initial circle.
          chat.avatarUrl = await getVendorAvatarUrl(chat.otherUserId).catch(() => null);
          const { data: profile } = await supabase
            .from('profiles')
            .select('username')
            .eq('id', chat.otherUserId)
            .single();

          if (profile && profile.username) {
            chat.customerName = profile.username;
          } else {
            chat.customerName = "Okänd kund";
          }
        }
      }

      setChats(uniqueChats);
    }
    setLoading(false);
  }, []);

  // Pull down to refresh: spinning star instead of the system spinner.
  const pull = useStarRefresh(() => fetchMyChats());

  useEffect(() => {
    if (isFocused) {
      fetchMyChats(); // eslint-disable-line react-hooks/set-state-in-effect -- loads data; state is set when it arrives
    }
  }, [isFocused, fetchMyChats]);

  const handlePressChat = (chatId: string, customerName: string) => {
    navigation.navigate('ChatRoom', { chatId, customerName, role: 'creator' });
  };

  const renderItem = ({ item }: any) => (
    <TouchableOpacity style={styles.chatItem} onPress={() => handlePressChat(item.id, item.customerName)}>
      {item.avatarUrl ? (
        <Image source={{ uri: item.avatarUrl }} style={styles.avatar} />
      ) : (
        <View style={[styles.avatar, styles.avatarFallback]}>
          <Text style={styles.avatarInitial}>{(item.customerName || '?').replace('@', '').charAt(0).toUpperCase()}</Text>
        </View>
      )}
      <View style={styles.chatInfo}>
        <View style={styles.chatHeader}>
          <Text style={[styles.name, item.unread && styles.unreadText]}>{handle(item.customerName)}</Text>
          <Text style={styles.time}>{item.time}</Text>
        </View>
        <Text style={[styles.message, item.unread && styles.unreadText]} numberOfLines={1}>
          {item.lastMessage}
        </Text>
      </View>
      {item.unread && <View style={styles.unreadDot} />}
    </TouchableOpacity>
  );

  if (loading) {
    return <ActivityIndicator style={{ flex: 1, justifyContent: 'center' }} size="large" color={colors.blue} />;
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <PageHeader title="My Chats" star />
      <FlatList refreshControl={<RefreshControl {...pull.control} />}
        data={chats}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={[styles.listContainer, chats.length === 0 && styles.emptyContainer]}
        ListEmptyComponent={<Text style={styles.emptyText}>no messages yet</Text>}
      />
      <RefreshStar refreshing={pull.refreshing} y={155} />
      {/* New chat: search usernames (bottom right) */}
      <NewChat navigation={navigation} role="creator" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  // Centres "no messages yet" in the space below the title
  emptyContainer: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', paddingBottom: 80 },
  emptyText: { color: colors.inkMuted, fontSize: 15 },
  listContainer: { paddingHorizontal: 20, paddingBottom: 96 }, // room for the new-chat button
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