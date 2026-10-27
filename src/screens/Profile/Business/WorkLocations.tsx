import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Switch, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../../services/supabase'; // Adjust path if needed

export default function WorkLocations({ navigation }: any) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [locationId, setLocationId] = useState<string | null>(null);

  const [studioEnabled, setStudioEnabled] = useState(true);
  const [studioAddress, setStudioAddress] = useState('');

  const [homeEnabled, setHomeEnabled] = useState(false);
  const [homeRadius, setHomeRadius] = useState('');
  const [homeFee, setHomeFee] = useState('');

  const [eventEnabled, setEventEnabled] = useState(false);
  const [eventTerms, setEventTerms] = useState('');

  // 1. Load saved settings from Supabase when opening the screen
  useEffect(() => {
    fetchLocations();
  }, []);

  const fetchLocations = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('work_locations')
      .select('*')
      .limit(1)
      .maybeSingle();

    if (error) {
      Alert.alert("Error fetching locations", error.message);
    } else if (data) {
      setLocationId(data.id);
      setStudioEnabled(data.studio_enabled ?? false);
      setStudioAddress(data.studio_address ?? '');
      setHomeEnabled(data.home_enabled ?? false);
      setHomeRadius(data.home_radius ?? '');
      setHomeFee(data.home_fee ?? '');
      setEventEnabled(data.event_enabled ?? false);
      setEventTerms(data.event_terms ?? '');
    }
    setLoading(false);
  };

  // 2. Save or update settings in Supabase
  const handleSave = async () => {
    setSaving(true);
    const payload = {
      studio_enabled: studioEnabled,
      studio_address: studioAddress,
      home_enabled: homeEnabled,
      home_radius: homeRadius,
      home_fee: homeFee,
      event_enabled: eventEnabled,
      event_terms: eventTerms,
      updated_at: new Date().toISOString(),
    };

    let error;

    if (locationId) {
      // Update existing row
      const res = await supabase
        .from('work_locations')
        .update(payload)
        .eq('id', locationId);
      error = res.error;
    } else {
      // Insert first row
      const res = await supabase
        .from('work_locations')
        .insert([payload])
        .select()
        .single();
      error = res.error;
      if (res.data) setLocationId(res.data.id);
    }

    setSaving(false);

    if (error) {
      Alert.alert("Error saving", error.message);
    } else {
      Alert.alert("Saved!", "Your work locations have been updated.");
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#191919" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Work Locations</Text>
        <View style={{ width: 24 }} />
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#1D3979" style={{ marginTop: 40 }} />
      ) : (
        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          <Text style={styles.sectionDescription}>
            Choose where you offer your services. You can combine multiple options to maximize your bookings.
          </Text>

          {/* 1. Salon / Studio */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.titleRow}>
                <Ionicons name="business-outline" size={22} color="#1D3979" style={{ marginRight: 10 }} />
                <Text style={styles.cardTitle}>Salon / Studio</Text>
              </View>
              <Switch
                value={studioEnabled}
                onValueChange={setStudioEnabled}
                trackColor={{ false: '#e0e0e0', true: '#1D3979' }}
              />
            </View>
            <Text style={styles.cardSubtitle}>Clients visit you at your fixed address.</Text>

            {studioEnabled && (
              <View style={styles.expandedContent}>
                <Text style={styles.label}>Studio Address</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. Drottninggatan 12, Stockholm"
                  value={studioAddress}
                  onChangeText={setStudioAddress}
                  placeholderTextColor="#716C83"
                />
              </View>
            )}
          </View>

          {/* 2. Home Visits (Mobile) */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.titleRow}>
                <Ionicons name="car-outline" size={22} color="#1D3979" style={{ marginRight: 10 }} />
                <Text style={styles.cardTitle}>Home Visits</Text>
              </View>
              <Switch
                value={homeEnabled}
                onValueChange={setHomeEnabled}
                trackColor={{ false: '#e0e0e0', true: '#1D3979' }}
              />
            </View>
            <Text style={styles.cardSubtitle}>You travel to the client's home.</Text>

            {homeEnabled && (
              <View style={styles.expandedContent}>
                <Text style={styles.label}>Max Travel Distance (km)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. 15 km"
                  value={homeRadius}
                  onChangeText={setHomeRadius}
                  placeholderTextColor="#716C83"
                />
                <Text style={styles.label}>Travel Fee (SEK)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. 150"
                  keyboardType="numeric"
                  value={homeFee}
                  onChangeText={setHomeFee}
                  placeholderTextColor="#716C83"
                />
              </View>
            )}
          </View>

          {/* 3. Events & Groups */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.titleRow}>
                <Ionicons name="sparkles-outline" size={22} color="#1D3979" style={{ marginRight: 10 }} />
                <Text style={styles.cardTitle}>Events & Parties</Text>
              </View>
              <Switch
                value={eventEnabled}
                onValueChange={setEventEnabled}
                trackColor={{ false: '#e0e0e0', true: '#1D3979' }}
              />
            </View>
            <Text style={styles.cardSubtitle}>Available for weddings, bachelorette parties, or corporate events.</Text>

            {eventEnabled && (
              <View style={styles.expandedContent}>
                <Text style={styles.label}>Terms & Info for Clients</Text>
                <TextInput
                  style={[styles.input, { height: 80, textAlignVertical: 'top' }]}
                  placeholder="e.g. Minimum 4 people. Contact me for a custom quote."
                  multiline
                  value={eventTerms}
                  onChangeText={setEventTerms}
                  placeholderTextColor="#716C83"
                />
              </View>
            )}
          </View>

          <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
            <Text style={styles.saveBtnText}>{saving ? "Saving..." : "Save Locations"}</Text>
          </TouchableOpacity>

          <View style={{ height: 50 }} />
        </ScrollView>
      )}
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
  card: { backgroundColor: '#fff', padding: 20, borderRadius: 16, marginBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  titleRow: { flexDirection: 'row', alignItems: 'center' },
  cardTitle: { fontSize: 17, fontWeight: 'bold', color: '#191919' },
  cardSubtitle: { fontSize: 13, color: '#716C83' },
  expandedContent: { marginTop: 15, paddingTop: 15, borderTopWidth: 1, borderTopColor: '#f0f0f0' },
  label: { fontSize: 13, fontWeight: '600', color: '#191919', marginBottom: 6 },
  input: { backgroundColor: '#F9F9F9', borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 10, padding: 12, fontSize: 15, color: '#191919', marginBottom: 12 },
  saveBtn: { backgroundColor: '#1D3979', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 10 },
  saveBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 }
});