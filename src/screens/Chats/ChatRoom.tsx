import React, { useState, useEffect, useRef } from 'react';
import { 
  View, 
  StyleSheet, 
  TextInput, 
  TouchableOpacity, 
  FlatList, 
  KeyboardAvoidingView, 
  Platform,
  ActivityIndicator
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '../../components/AppText'; 
import { supabase } from '../../services/supabase'; // Adjust path if needed

type Message = {
  id: string;
  chat_id: string;
  sender_id: string;
  text: string;
  created_at: string;
  is_booking_request: boolean;
};

export default function ChatRoom({ route, navigation }: any) {
  // We need a unique chat ID to know which conversation this is. 
  // You should pass this from ChatsCreator.tsx: navigation.navigate('ChatRoom', { chatId: '123', customerName: '...' })
  const chatId = route?.params?.chatId || 'test-chat-id';
  const customerName = route?.params?.customerName || 'Customer';

  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    let channel: any = null;

    const setupChat = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setCurrentUserId(user.id);

      await fetchMessages();

      // Create the channel, attach the listener, AND subscribe all in one clean chain
      channel = supabase
        .channel(`chat_${chatId}`)
        .on('postgres_changes', { 
            event: 'INSERT', 
            schema: 'public', 
            table: 'messages',
            filter: `chat_id=eq.${chatId}`
        }, (payload) => {
            const newMessage = payload.new as Message;
            
            setMessages((prev) => {
            // Filtrera bort meddelandet om vi redan har lagt till det lokalt
            const isDuplicate = prev.some(m => m.text === newMessage.text && m.sender_id === newMessage.sender_id);
            if (isDuplicate) return prev;
            
            return [...prev, newMessage];
            });
            
            setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
        })
        .subscribe();
    };

    setupChat();

    // This cleanup function is crucial! It destroys the channel when you close the chat or refresh the app.
    return () => {
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [chatId]);

  const fetchMessages = async () => {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('chat_id', chatId)
      .order('created_at', { ascending: true });

    if (data) {
      setMessages(data);
    }
    setLoading(false);
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: false }), 100);
  };

  const handleSendMessage = async () => {
  if (!inputText.trim() || !currentUserId) return;

  const newText = inputText.trim();
  setInputText(''); // Töm inmatningsfältet blixtsnabbt

  // 1. Visa meddelandet direkt för användaren (Optimistic Update)
  const tempMessage: Message = {
    id: Date.now().toString(), // Temporärt ID tills databasen ger ett riktigt
    chat_id: chatId,
    sender_id: currentUserId,
    text: newText,
    created_at: new Date().toISOString(),
    is_booking_request: false,
  };
  
  setMessages((prev) => [...prev, tempMessage]);
  setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);

  // 2. Skicka till Supabase i bakgrunden
  await supabase.from('messages').insert({
    chat_id: chatId,
    sender_id: currentUserId,
    text: newText,
    is_booking_request: false,
  });
};

  const handleOpenCalendar = () => {
    // Navigate directly to your calendar creator screen
    // Pass the chatId or customer details so the calendar knows who the booking is for
    navigation.navigate('CalendarCreator', { 
      chatId,
      customerName
    });
  };

  const renderMessage = ({ item }: { item: Message }) => {
    const isMe = item.sender_id === currentUserId;
    const timeString = new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    return (
      <View style={[styles.messageBubble, isMe ? styles.myMessage : styles.theirMessage]}>
        <Text style={[styles.messageText, isMe ? styles.myMessageText : styles.theirMessageText]}>
          {item.text}
        </Text>
        
        {item.is_booking_request && (
          <TouchableOpacity style={styles.acceptButton}>
            <Text style={styles.acceptButtonText}>View Booking</Text>
          </TouchableOpacity>
        )}
        
        <Text style={[styles.timestamp, isMe ? styles.myTimestamp : styles.theirTimestamp]}>
          {timeString}
        </Text>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView 
      style={styles.container} 
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#191919" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{customerName}</Text>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.navigate('CustomerProfile')}>
          <Ionicons name="person-circle-outline" size={28} color="#1D3979" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#1D3979" />
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderMessage}
          contentContainerStyle={styles.chatContainer}
          showsVerticalScrollIndicator={false}
          onLayout={() => flatListRef.current?.scrollToEnd({ animated: false })}
        />
      )}

      <View style={styles.inputContainer}>
        <TouchableOpacity style={styles.actionBtn} onPress={handleOpenCalendar}>
          <Ionicons name="calendar-outline" size={24} color="#1D3979" />
        </TouchableOpacity>
        
        <TextInput
          style={styles.textInput}
          placeholder="Type a message..."
          placeholderTextColor="#716C83"
          value={inputText}
          onChangeText={setInputText}
          multiline
        />

        <TouchableOpacity 
          style={[styles.sendBtn, !inputText.trim() && styles.sendBtnDisabled]} 
          onPress={handleSendMessage}
          disabled={!inputText.trim()}
        >
          <Ionicons name="send" size={20} color="#fff" />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9F9F9' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 60,
    paddingBottom: 15,
    paddingHorizontal: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  backBtn: { padding: 5 },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#191919' },
  chatContainer: { padding: 20, paddingBottom: 40 },
  messageBubble: { maxWidth: '80%', padding: 12, borderRadius: 16, marginBottom: 12 },
  myMessage: { alignSelf: 'flex-end', backgroundColor: '#1D3979', borderBottomRightRadius: 4 },
  theirMessage: { alignSelf: 'flex-start', backgroundColor: '#EAEAEA', borderBottomLeftRadius: 4 },
  messageText: { fontSize: 15, lineHeight: 22 },
  myMessageText: { color: '#fff' },
  theirMessageText: { color: '#191919' },
  timestamp: { fontSize: 11, marginTop: 6, alignSelf: 'flex-end' },
  myTimestamp: { color: 'rgba(255, 255, 255, 0.7)' },
  theirTimestamp: { color: '#716C83' },
  acceptButton: { backgroundColor: '#fff', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, marginTop: 10, alignItems: 'center' },
  acceptButtonText: { color: '#1D3979', fontWeight: 'bold', fontSize: 14 },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 15,
    paddingBottom: 30, 
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  actionBtn: { padding: 10, marginRight: 5 },
  textInput: {
    flex: 1, backgroundColor: '#F9F9F9', borderWidth: 1, borderColor: '#E0E0E0',
    borderRadius: 20, paddingHorizontal: 15, paddingTop: 12, paddingBottom: 12,
    fontSize: 15, maxHeight: 100, color: '#191919',
  },
  sendBtn: {
    backgroundColor: '#1D3979', width: 44, height: 44, borderRadius: 22,
    justifyContent: 'center', alignItems: 'center', marginLeft: 10,
  },
  sendBtnDisabled: { backgroundColor: '#A0AABF' },
});