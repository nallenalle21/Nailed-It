import React, { useState, useEffect, useRef, useCallback } from 'react';
import { colors, fonts } from '../../theme';
import { handle } from '../../utils/handle';
import { View, StyleSheet, TextInput, TouchableOpacity, FlatList, KeyboardAvoidingView, Platform, ActivityIndicator, Alert } from 'react-native';
import { Text } from '../../components/AppText';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../services/supabase';
import { formatKr } from '../../services/booking';
import { fetchChatOffers, offerEndTime, respondToOffer, withdrawOffer, type BookingOffer } from '../../services/offers';
import { addAppointmentToCalendar } from '../../services/deviceCalendar';
import OfferCard from '../../components/OfferCard';
import OfferComposerModal from '../../components/OfferComposerModal';

type Message = {
  id: string;
  chat_id: string;
  sender_id: string;
  text: string;
  created_at: string;
  /** Set when the message shows a booking offer card (see supabase/booking_offers.sql). */
  offer_id?: string | null;
};

const errorMessage = (e: unknown) =>
  e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String((e as any).message) : String(e);

export default function ChatRoom({ route, navigation }: any) {
  const { chatId, customerName, role } = route.params;

  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const flatListRef = useRef<FlatList>(null);
  // Booking offers in this chat, by id; the cards look them up from their message.
  const [offers, setOffers] = useState<Record<string, BookingOffer>>({});
  const [composerOpen, setComposerOpen] = useState(false);
  const [busyOfferId, setBusyOfferId] = useState<string | null>(null);

  const fetchOffers = useCallback(async () => {
    try {
      const rows = await fetchChatOffers(chatId);
      setOffers(Object.fromEntries(rows.map((o) => [o.id, o])));
    } catch (e) {
      // Before booking_offers.sql has been run the table is missing; the chat still works.
      console.warn('[ChatRoom] Could not load offers:', errorMessage(e));
    }
  }, [chatId]);

  const fetchMessages = useCallback(async () => {
    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('chat_id', chatId)
      .order('created_at', { ascending: true });

    if (data) {
      await fetchOffers();
      setMessages(data);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: false }), 200);
    }
    setLoading(false);
  }, [chatId, fetchOffers]);

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
          if (newMessage.offer_id) void fetchOffers();
          setMessages((prev) => {
            const isDuplicate = prev.some(m => m.id === newMessage.id ||
              (m.id.startsWith('temp-') && m.text === newMessage.text && m.sender_id === newMessage.sender_id));
            if (isDuplicate) return prev;
            return [...prev, newMessage];
          });
          setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
        })
        // Accepted / declined / withdrawn: the card updates for both people.
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'booking_offers',
          filter: `chat_id=eq.${chatId}`
        }, (payload) => {
          const offer = payload.new as BookingOffer;
          if (offer?.id) setOffers((prev) => ({ ...prev, [offer.id]: offer }));
        })
        .subscribe();
    };

    setupChat();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [chatId, fetchMessages, fetchOffers]);

  const handleSendMessage = async () => {
    if (!inputText.trim() || !currentUserId) return;

    const newText = inputText.trim();
    setInputText('');

    const tempMessage: Message = {
      id: `temp-${Date.now()}`,
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

  const runOfferAction = async (offerId: string, action: () => Promise<void>) => {
    setBusyOfferId(offerId);
    try {
      await action();
    } catch (e) {
      Alert.alert('Something went wrong', errorMessage(e));
    } finally {
      setBusyOfferId(null);
      void fetchOffers();
    }
  };

  const acceptOffer = (o: BookingOffer) =>
    Alert.alert('Book this?', `${o.title}\n${o.offer_date} · ${o.start_time.slice(0, 5)}–${offerEndTime(o)}\n${formatKr(o.price)}`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Accept & book',
        onPress: () => runOfferAction(o.id, async () => {
          const appointment = await respondToOffer(o.id, true);
          if (!appointment) return;
          Alert.alert('Booked!', 'It is in your Calendar. Add it to your phone calendar too?', [
            { text: 'Not now', style: 'cancel' },
            { text: 'Add to calendar', onPress: () => addAppointmentToCalendar(appointment, 'customer') },
          ]);
        }),
      },
    ]);

  const declineOffer = (o: BookingOffer) =>
    Alert.alert('Decline this offer?', o.title, [
      { text: 'Keep', style: 'cancel' },
      { text: 'Decline', style: 'destructive', onPress: () => runOfferAction(o.id, async () => { await respondToOffer(o.id, false); }) },
    ]);

  const withdraw = (o: BookingOffer) =>
    Alert.alert('Withdraw this offer?', o.title, [
      { text: 'Keep', style: 'cancel' },
      { text: 'Withdraw', style: 'destructive', onPress: () => runOfferAction(o.id, () => withdrawOffer(o.id)) },
    ]);

  const renderMessage = ({ item }: { item: Message }) => {
    const offer = item.offer_id ? offers[item.offer_id] : undefined;
    if (offer) {
      return (
        <OfferCard
          offer={offer}
          sentByMe={offer.creator_id === currentUserId}
          busy={busyOfferId === offer.id}
          onAccept={() => acceptOffer(offer)}
          onDecline={() => declineOffer(offer)}
          onWithdraw={() => withdraw(offer)}
        />
      );
    }
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
          <Ionicons name="arrow-back" size={24} color={colors.ink} />
        </TouchableOpacity>

        <View style={styles.titleContainer}>
          <Text style={styles.headerTitle}>{handle(customerName)}</Text>

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
            <Ionicons name="person-circle-outline" size={22} color={colors.blue} />
          </TouchableOpacity>
        </View>

        {/* Skapar balans i headern */}
        <View style={{ width: 34 }} />
      </View>

      {/* CHATT-LISTA */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.blue} />
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderMessage}
          extraData={[offers, busyOfferId, currentUserId]}
          contentContainerStyle={styles.chatContainer}
          showsVerticalScrollIndicator={false}
          onLayout={() => flatListRef.current?.scrollToEnd({ animated: false })}
        />
      )}

      {/* TEXT-INPUT */}
      <View style={styles.inputContainer}>
        {role === 'creator' && (
          <TouchableOpacity
            style={styles.offerBtn}
            onPress={() => setComposerOpen(true)}
            disabled={!currentUserId}
            accessibilityLabel="Send a booking offer"
          >
            <Ionicons name="calendar-outline" size={22} color={colors.blue} />
          </TouchableOpacity>
        )}
        <TextInput
          style={styles.textInput}
          placeholder="Type a message..."
          placeholderTextColor={colors.inkMuted}
          value={inputText}
          onChangeText={setInputText}
          multiline
        />

        <TouchableOpacity
          style={[styles.sendBtn, !inputText.trim() && styles.sendBtnDisabled]}
          onPress={handleSendMessage}
          disabled={!inputText.trim()}
        >
          <Ionicons name="send" size={20} color={colors.background} />
        </TouchableOpacity>
      </View>

      {composerOpen && currentUserId && (
        <OfferComposerModal
          chatId={chatId}
          creatorId={currentUserId}
          customerName={customerName}
          onClose={() => setComposerOpen(false)}
          onSent={() => {
            setComposerOpen(false);
            void fetchMessages();
          }}
        />
      )}

    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 60,
    paddingBottom: 15,
    paddingHorizontal: 20,
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  backBtn: { padding: 5 },
  titleContainer: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headerTitle: { fontSize: 18, color: colors.ink, fontFamily: fonts.title },
  profileBtn: { padding: 2 },
  chatContainer: { padding: 20, paddingBottom: 40 },
  messageBubble: { maxWidth: '80%', padding: 12, borderRadius: 16, marginBottom: 12 },
  myMessage: { alignSelf: 'flex-end', backgroundColor: colors.blue, borderBottomRightRadius: 4 },
  theirMessage: { alignSelf: 'flex-start', backgroundColor: colors.line, borderBottomLeftRadius: 4 },
  messageText: { fontSize: 15, lineHeight: 22 },
  myMessageText: { color: colors.background },
  theirMessageText: { color: colors.ink },
  timestamp: { fontSize: 11, marginTop: 6, alignSelf: 'flex-end' },
  myTimestamp: { color: 'rgba(250,249,246,0.75)' },
  theirTimestamp: { color: colors.inkMuted },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 15,
    paddingBottom: 30,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  textInput: {
    flex: 1, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.line,
    borderRadius: 20, paddingHorizontal: 15, paddingTop: 12, paddingBottom: 12,
    fontSize: 15, maxHeight: 100, color: colors.ink,
  },
  sendBtn: {
    backgroundColor: colors.blue, width: 44, height: 44, borderRadius: 22,
    justifyContent: 'center', alignItems: 'center', marginLeft: 10,
  },
  sendBtnDisabled: { backgroundColor: colors.inkMuted },
  offerBtn: {
    width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: colors.line,
    justifyContent: 'center', alignItems: 'center', marginRight: 10,
  },
});