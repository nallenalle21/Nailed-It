import React, { useState, useEffect } from 'react';
import { View, StyleSheet, FlatList, TouchableOpacity, Image, ActivityIndicator } from 'react-native';
import { Text } from '../../components/AppText';
import { supabase } from '../../services/supabase';
import { useIsFocused } from '@react-navigation/native';

export default function ChatsCreator({ navigation }: any) {
  const [chats, setChats] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const isFocused = useIsFocused(); // För att uppdatera listan varje gång man går in på skärmen

  useEffect(() => {
    if (isFocused) {
      fetchMyChats();
    }
  }, [isFocused]);

  const fetchMyChats = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Hämta meddelanden där denna kreatör är med
    const { data, error } = await supabase
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
  };

  const handlePressChat = (chatId: string, customerName: string) => {
    navigation.navigate('ChatRoom', { chatId, customerName, role: 'creator' });
  };

  const renderItem = ({ item }: any) => (
    <TouchableOpacity style={styles.chatItem} onPress={() => handlePressChat(item.id, item.customerName)}>
      <Image source={{ uri: 'https://via.placeholder.com/50' }} style={styles.avatar} />
      <View style={styles.chatInfo}>
        <View style={styles.chatHeader}>
          <Text style={[styles.name, item.unread && styles.unreadText]}>{item.customerName}</Text>
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
    return <ActivityIndicator style={{ flex: 1, justifyContent: 'center' }} size="large" color="#1D3979" />;
  }

  return (
    <View style={styles.container}>
      <Text style={styles.headerTitle}>Messages</Text>
      <FlatList
        data={chats}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContainer}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  headerTitle: { fontSize: 24, fontWeight: 'bold', marginHorizontal: 20, marginTop: 60, marginBottom: 10 },
  listContainer: { paddingHorizontal: 20 },
  chatItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  avatar: { width: 50, height: 50, borderRadius: 25, marginRight: 15, backgroundColor: '#e0e0e0' },
  chatInfo: { flex: 1, justifyContent: 'center' },
  chatHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  name: { fontSize: 16, fontWeight: '500' },
  time: { fontSize: 12, color: 'gray' },
  message: { fontSize: 14, color: 'gray' },
  unreadText: { fontWeight: 'bold', color: '#191919' },
  unreadDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: 'red', marginLeft: 10 },
});