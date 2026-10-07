import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function WorkLocations({ navigation }: any) {
  const [hasStudio, setHasStudio] = useState(true);
  const [studioAddress, setStudioAddress] = useState('Drottninggatan 12, Stockholm');

  const [doesHomeVisits, setDoesHomeVisits] = useState(false);
  const [homeConditions, setHomeConditions] = useState('');

  const [doesEvents, setDoesEvents] = useState(false);
  const [eventDetails, setEventDetails] = useState('');

  const handleSave = () => {
    // Här sparar vi till Supabase senare
    navigation.goBack();
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#191919" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Work Locations</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionDescription}>
          Välj var du erbjuder dina tjänster och ange relevanta adresser eller villkor.
        </Text>

        {/* Studio Location */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={styles.iconBox}><Ionicons name="business" size={20} color="#1D3979" /></View>
              <Text style={styles.cardTitle}>Studio / Salong</Text>
            </View>
            <Switch 
              value={hasStudio} 
              onValueChange={setHasStudio} 
              trackColor={{ false: '#e0e0e0', true: '#BFE34F' }}
              thumbColor={hasStudio ? '#1D3979' : '#f4f3f4'}
            />
          </View>
          {hasStudio && (
            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Studioadress</Text>
              <TextInput 
                style={styles.input} 
                placeholder="Gatuadress, Postnummer, Ort" 
                value={studioAddress} 
                onChangeText={setStudioAddress} 
                placeholderTextColor="#716C83" 
              />
            </View>
          )}
        </View>

        {/* Home Visits */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={styles.iconBox}><Ionicons name="home" size={20} color="#1D3979" /></View>
              <Text style={styles.cardTitle}>Hembesök hos kund</Text>
            </View>
            <Switch 
              value={doesHomeVisits} 
              onValueChange={setDoesHomeVisits} 
              trackColor={{ false: '#e0e0e0', true: '#BFE34F' }}
              thumbColor={doesHomeVisits ? '#1D3979' : '#f4f3f4'}
            />
          </View>
          {doesHomeVisits && (
            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Villkor för hembesök</Text>
              <TextInput 
                style={[styles.input, { height: 80, paddingTop: 12 }]} 
                placeholder="T.ex. 'Åker max 20 km från centrum. Reseersättning på 100 kr tillkommer.'" 
                value={homeConditions} 
                onChangeText={setHomeConditions} 
                multiline 
                placeholderTextColor="#716C83" 
              />
            </View>
          )}
        </View>

        {/* Events & Popups */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={styles.iconBox}><Ionicons name="calendar" size={20} color="#1D3979" /></View>
              <Text style={styles.cardTitle}>Events & Pop-ups</Text>
            </View>
            <Switch 
              value={doesEvents} 
              onValueChange={setDoesEvents} 
              trackColor={{ false: '#e0e0e0', true: '#BFE34F' }}
              thumbColor={doesEvents ? '#1D3979' : '#f4f3f4'}
            />
          </View>
          {doesEvents && (
            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Eventdetaljer</Text>
              <TextInput 
                style={[styles.input, { height: 80, paddingTop: 12 }]} 
                placeholder="T.ex. 'Kan bokas för bröllop och företagsevent. Minst 3 personer.'" 
                value={eventDetails} 
                onChangeText={setEventDetails} 
                multiline 
                placeholderTextColor="#716C83" 
              />
            </View>
          )}
        </View>

        <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
          <Text style={styles.saveButtonText}>Spara Platser</Text>
        </TouchableOpacity>

        <View style={{ height: 50 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9F9F9' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 60, marginBottom: 10, paddingHorizontal: 20 },
  backBtn: { padding: 5 },
  headerTitle: { fontSize: 22, fontWeight: 'bold', color: '#191919' },
  content: { paddingHorizontal: 20 },
  sectionDescription: { fontSize: 14, color: '#716C83', marginBottom: 20 },
  
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  iconBox: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#F0F4FF', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  cardTitle: { fontSize: 16, fontWeight: 'bold', color: '#191919' },
  
  inputContainer: { marginTop: 16, borderTopWidth: 1, borderTopColor: '#f0f0f0', paddingTop: 16 },
  inputLabel: { fontSize: 12, fontWeight: 'bold', color: '#716C83', marginBottom: 8, textTransform: 'uppercase' },
  input: { backgroundColor: '#F9F9F9', borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 10, padding: 15, fontSize: 15, color: '#191919' },
  
  saveButton: { backgroundColor: '#1D3979', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 10 },
  saveButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' }
});