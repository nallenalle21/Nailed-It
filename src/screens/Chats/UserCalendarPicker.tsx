import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { Text } from '../../components/AppText';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../services/supabase';

// Låtsasdata för tillgängliga dagar och tider (Detta hämtar du senare från Supabase)
const availableDates = [
  { id: '1', day: 'Mån', date: '28 Okt' },
  { id: '2', day: 'Tis', date: '29 Okt' },
  { id: '3', day: 'Ons', date: '30 Okt' },
  { id: '4', day: 'Tors', date: '31 Okt' },
];

const availableTimes = ['09:00', '10:30', '13:00', '14:30', '16:00'];

export default function UserCalendarPicker({ route, navigation }: any) {
  const { chatId, creatorName } = route.params;

  const [selectedDate, setSelectedDate] = useState(availableDates[0].date);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);

  const handleSendBookingRequest = async () => {
    if (!selectedTime) {
      Alert.alert('Välj en tid', 'Du måste välja en tid innan du skickar förfrågan.');
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const requestText = `📅 Bokningsförfrågan:\n${selectedDate} kl ${selectedTime}`;

    // 1. Stäng kalendern DIREKT för att slippa fördröjningen (bättre UX)
    navigation.goBack();

    // 2. Skicka meddelandet till Supabase i bakgrunden
    await supabase.from('messages').insert({
      chat_id: chatId,
      sender_id: user.id,
      text: requestText,
      is_booking_request: true,
    });
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.closeBtn}>
          <Ionicons name="close" size={28} color="#191919" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Boka {creatorName}</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        
        {/* Datumväljare */}
        <Text style={styles.sectionTitle}>Välj Datum</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.dateScroll}>
          {availableDates.map((item) => {
            const isSelected = selectedDate === item.date;
            return (
              <TouchableOpacity 
                key={item.id} 
                style={[styles.dateCard, isSelected && styles.dateCardActive]}
                onPress={() => {
                  setSelectedDate(item.date);
                  setSelectedTime(null); // Nollställ tiden när man byter dag
                }}
              >
                <Text style={[styles.dayText, isSelected && styles.textActive]}>{item.day}</Text>
                <Text style={[styles.dateText, isSelected && styles.textActive]}>{item.date}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Tidsväljare */}
        <Text style={styles.sectionTitle}>Lediga Tider</Text>
        <View style={styles.timeGrid}>
          {availableTimes.map((time, index) => {
            const isSelected = selectedTime === time;
            return (
              <TouchableOpacity 
                key={index} 
                style={[styles.timeSlot, isSelected && styles.timeSlotActive]}
                onPress={() => setSelectedTime(time)}
              >
                <Text style={[styles.timeText, isSelected && styles.timeTextActive]}>{time}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

      </ScrollView>

      {/* Footer med bokningsknapp */}
      <View style={styles.footer}>
        <TouchableOpacity 
          style={[styles.requestBtn, !selectedTime && styles.requestBtnDisabled]} 
          onPress={handleSendBookingRequest}
          disabled={!selectedTime}
        >
          <Text style={styles.requestBtnText}>Skicka Bokningsförfrågan</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9F9F9' },
  header: { 
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', 
    paddingTop: 60, paddingHorizontal: 20, paddingBottom: 15, backgroundColor: '#fff', 
    borderBottomWidth: 1, borderBottomColor: '#F0F0F0' 
  },
  closeBtn: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#191919' },
  scrollContent: { padding: 20 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#191919', marginBottom: 15, marginTop: 10 },
  
  dateScroll: { flexDirection: 'row', marginBottom: 30 },
  dateCard: { 
    backgroundColor: '#fff', paddingVertical: 15, paddingHorizontal: 20, 
    borderRadius: 12, marginRight: 10, alignItems: 'center', 
    borderWidth: 1, borderColor: '#EFEFEF' 
  },
  dateCardActive: { backgroundColor: '#1D3979', borderColor: '#1D3979' },
  dayText: { fontSize: 14, color: '#716C83', marginBottom: 4 },
  dateText: { fontSize: 16, fontWeight: 'bold', color: '#191919' },
  textActive: { color: '#fff' },

  timeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  timeSlot: { 
    backgroundColor: '#fff', paddingVertical: 12, paddingHorizontal: 20, 
    borderRadius: 10, borderWidth: 1, borderColor: '#EFEFEF', minWidth: '30%', alignItems: 'center' 
  },
  timeSlotActive: { backgroundColor: '#1D3979', borderColor: '#1D3979' },
  timeText: { fontSize: 15, color: '#191919', fontWeight: '500' },
  timeTextActive: { color: '#fff' },

  footer: { 
    padding: 20, paddingBottom: 40, backgroundColor: '#fff', 
    borderTopWidth: 1, borderTopColor: '#F0F0F0' 
  },
  requestBtn: { backgroundColor: '#1D3979', padding: 16, borderRadius: 12, alignItems: 'center' },
  requestBtnDisabled: { backgroundColor: '#A0AABF' },
  requestBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' }
});