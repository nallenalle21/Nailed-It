import React, { useState, useEffect } from 'react';
import { View, StyleSheet, FlatList, TouchableOpacity, Image, ActivityIndicator } from 'react-native';
import { Text } from '../../components/AppText';
import { supabase } from '../../services/supabase';

export default function ChatsUser({ navigation }: any) {
  const [chats, setChats] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMyChats();
  }, []);

  const fetchMyChats = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Hämta meddelanden som kunden skickat eller tagit emot
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .order('created_at', { ascending: false });

    if (data) {
      // Filtrera fram unika chattrum för just denna användare i JavaScript
      // (Ett enklare sätt att göra det på innan du bygger en dedikerad "chats"-tabell)
      const uniqueChats = data.reduce((acc: any[], message) => {
        if (!acc.find(c => c.id === message.chat_id)) {
          acc.push({
            id: message.chat_id,
            creatorName: 'Företag', // Låtsasnamn tills vi kopplar profiler
            lastMessage: message.text,
            time: new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            unread: false
          });
        }
        return acc;
      }, []);
      
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
      <Image source={{ uri: 'https://via.placeholder.com/50' }} style={styles.avatar} />
      <View style={styles.chatInfo}>
        <View style={styles.chatHeader}>
          <Text style={[styles.name, item.unread && styles.unreadText]}>{item.creatorName}</Text>
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