import React from 'react';
import { View, StyleSheet, FlatList, TouchableOpacity, Image } from 'react-native';
import { Text } from '../../components/AppText'; // Using your custom Text component
import { Ionicons } from '@expo/vector-icons';

// Temporary mock data until we connect this to Supabase
const mockChats = [
  {
    id: '1',
    customerName: 'Anna Svensson',
    lastMessage: 'Hi! Are you available next Tuesday for a new set?',
    avatar: 'https://i.pravatar.cc/150?u=anna',
    unread: true,
    hasBookingRequest: true,
  },
  {
    id: '2',
    customerName: 'Elin Johansson',
    lastMessage: 'Perfect, see you then!',
    avatar: 'https://i.pravatar.cc/150?u=elin',
    unread: false,
    hasBookingRequest: false,
  }
];

export default function ChatsCreator({ navigation }: any) {

  const handlePressChat = (chatId: string, customerName: string) => {
    navigation.navigate('ChatRoom', { chatId, customerName });
  };

  const handlePressProfile = (customerId: string) => {
    // Navigate to the Customer Profile view (Booking overview, reviews, etc.)
    // navigation.navigate('CustomerProfile', { customerId });
    navigation.navigate('CustomerProfile', { customerId });
  };

  const renderChatItem = ({ item }: { item: typeof mockChats[0] }) => (
    <View style={styles.chatRow}>
      {/* Left side: Avatar and Message Preview */}
      <View style={styles.chatInfo}>
        <Image source={{ uri: item.avatar }} style={styles.avatar} />
        <View style={styles.textContainer}>
          <View style={styles.nameRow}>
            <Text style={styles.customerName}>{item.customerName}</Text>
            {item.unread && <View style={styles.unreadDot} />}
          </View>
          <Text 
            style={[styles.lastMessage, item.unread && styles.lastMessageUnread]}
            numberOfLines={1}
          >
            {item.hasBookingRequest ? 'New booking request!' : item.lastMessage}
          </Text>
        </View>
      </View>

      {/* Right side: Action Icons (Profile & Chat) */}
      <View style={styles.actionButtons}>
        <TouchableOpacity 
          style={styles.iconButton} 
          onPress={() => handlePressProfile(item.id)}
        >
          <Ionicons name="person-circle-outline" size={28} color="#1D3979" />
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={styles.iconButton} 
          onPress={() => handlePressChat(item.id, item.customerName)}
        >
          <Ionicons name="chatbubble-ellipses-outline" size={26} color="#1D3979" />
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Messages</Text>
      </View>

      <FlatList
        data={mockChats}
        keyExtractor={(item) => item.id}
        renderItem={renderChatItem}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9F9F9',
  },
  header: {
    paddingTop: 60,
    paddingBottom: 15,
    paddingHorizontal: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#191919',
  },
  listContent: {
    paddingTop: 10,
  },
  chatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    paddingVertical: 15,
    paddingHorizontal: 20,
    marginBottom: 2, // Slight gap between rows
  },
  chatInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#E0E0E0',
  },
  textContainer: {
    marginLeft: 15,
    flex: 1,
    paddingRight: 10,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  customerName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#191919',
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#BF0F46', // Red indicator for unread/requests
    marginLeft: 8,
  },
  lastMessage: {
    fontSize: 14,
    color: '#716C83',
    marginTop: 4,
  },
  lastMessageUnread: {
    color: '#191919',
    fontWeight: '600',
  },
  actionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconButton: {
    marginLeft: 15,
    padding: 4,
  },
});