import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, TextInput, TouchableOpacity, FlatList, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { Text } from '../../components/AppText';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../services/supabase';

type Message = {
  id: string;
  chat_id: string;
  sender_id: string;
  text: string;
  created_at: string;
};

export default function ChatRoom({ route, navigation }: any) {
  const { chatId, customerName, role } = route.params;
  
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    let channel: any;

    const setupChat = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setCurrentUserId(user.id);
        await fetchMessages();
      }

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
            const isDuplicate = prev.some(m => m.text === newMessage.text && m.sender_id === newMessage.sender_id);
            if (isDuplicate) return prev;
            return [...prev, newMessage];
          });
          setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
        })
        .subscribe();
    };

    setupChat();

    return () => {
      if (channel) supabase.removeChannel(channel);
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
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: false }), 200);
    }
    setLoading(false);
  };

  const handleSendMessage = async () => {
    if (!inputText.trim() || !currentUserId) return;

    const newText = inputText.trim();
    setInputText(''); 

    const tempMessage: Message = {
      id: Date.now().toString(),
      chat_id: chatId,
      sender_id: currentUserId,
      text: newText,
      created_at: new Date().toISOString(),
    };
    
    setMessages((prev) => [...prev, tempMessage]);
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);

    await supabase.from('messages').insert({
      chat_id: chatId,
      sender_id: currentUserId,
      text: newText,
    });
  };

  const renderMessage = ({ item }: { item: Message }) => {
    const isMyMessage = item.sender_id === currentUserId;
    const timeString = new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    return (
      <View style={[styles.messageBubble, isMyMessage ? styles.myMessage : styles.theirMessage]}>
        <Text style={[styles.messageText, isMyMessage ? styles.myMessageText : styles.theirMessageText]}>
          {item.text}
        </Text>
        <Text style={[styles.timestamp, isMyMessage ? styles.myTimestamp : styles.theirTimestamp]}>
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
      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#191919" />
        </TouchableOpacity>
        
        <View style={styles.titleContainer}>
          <Text style={styles.headerTitle}>{customerName}</Text>
          
          {/* Profil-ikonen visas nu för BÅDA, men leder till olika sidor beroende på roll */}
          <TouchableOpacity 
            style={styles.profileBtn} 
            onPress={() => {
              if (role === 'creator') {
                navigation.navigate('CustomerProfile', { 
                  customerName: customerName, 
                  chatId: chatId 
                });
              } else {
                // Om kunden klickar: Utvinn företagets ID från chatId och gå till VendorProfile
                const ids = chatId.split('_');
                const vendorId = ids.find((id: string) => id !== currentUserId);
                
                navigation.navigate('VendorProfile', { 
                  vendorId: vendorId 
                });
              }
            }}
          >
            <Ionicons name="person-circle-outline" size={22} color="#1D3979" />
          </TouchableOpacity>
        </View>

        <View style={{ width: 34 }} /> {/* Skapar balans i headern */}
      </View>

      {/* CHATT-LISTA */}
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

      {/* TEXT-INPUT */}
      <View style={styles.inputContainer}>
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
  titleContainer: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#191919' },
  profileBtn: { padding: 2 },
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
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 15,
    paddingBottom: 30, 
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
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