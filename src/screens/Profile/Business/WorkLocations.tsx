import React, { useState, useEffect } from 'react';
import { RefreshStar, useStarRefresh } from '../../../components/SparkleStars';
import StarredTitle from '../../../components/StarredTitle';
import { colors, fonts } from '../../../theme';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Switch, Alert, ActivityIndicator, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../../services/supabase'; // Adjust path if needed

export default function WorkLocations({ navigation }: any) {
  // Pull down to refresh: spinning star instead of the system spinner.
  const pull = useStarRefresh(() => fetchLocations());
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
          <Ionicons name="arrow-back" size={24} color={colors.ink} />
        </TouchableOpacity>
        <StarredTitle style={styles.headerTitle}>Work Locations</StarredTitle>
        <View style={{ width: 24 }} />
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={colors.blue} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView refreshControl={<RefreshControl {...pull.control} />} style={styles.content} showsVerticalScrollIndicator={false}>
          <Text style={styles.sectionDescription}>
            Choose where you offer your services. You can combine multiple options to maximize your bookings.
          </Text>

          {/* 1. Salon / Studio */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.titleRow}>
                <Ionicons name="business-outline" size={22} color={colors.blue} style={{ marginRight: 10 }} />
                <Text style={styles.cardTitle}>Salon / Studio</Text>
              </View>
              <Switch
                value={studioEnabled}
                onValueChange={setStudioEnabled}
                trackColor={{ false: colors.line, true: colors.blue }}
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
                  placeholderTextColor={colors.inkMuted}
                />
              </View>
            )}
          </View>

          {/* 2. Home Visits (Mobile) */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.titleRow}>
                <Ionicons name="car-outline" size={22} color={colors.blue} style={{ marginRight: 10 }} />
                <Text style={styles.cardTitle}>Home Visits</Text>
              </View>
              <Switch
                value={homeEnabled}
                onValueChange={setHomeEnabled}
                trackColor={{ false: colors.line, true: colors.blue }}
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
                  placeholderTextColor={colors.inkMuted}
                />
                <Text style={styles.label}>Travel Fee (SEK)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. 150"
                  keyboardType="numeric"
                  value={homeFee}
                  onChangeText={setHomeFee}
                  placeholderTextColor={colors.inkMuted}
                />
              </View>
            )}
          </View>

          {/* 3. Events & Groups */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.titleRow}>
                <Ionicons name="sparkles-outline" size={22} color={colors.blue} style={{ marginRight: 10 }} />
                <Text style={styles.cardTitle}>Events & Parties</Text>
              </View>
              <Switch
                value={eventEnabled}
                onValueChange={setEventEnabled}
                trackColor={{ false: colors.line, true: colors.blue }}
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
                  placeholderTextColor={colors.inkMuted}
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
      <RefreshStar refreshing={pull.refreshing} y={130} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 60, marginBottom: 10, paddingHorizontal: 20 },
  backBtn: { padding: 5 },
  headerTitle: { fontSize: 22, color: colors.ink, fontFamily: fonts.title },
  content: { paddingHorizontal: 20 },
  sectionDescription: { fontSize: 14, color: colors.inkMuted, marginBottom: 20 },
  card: { backgroundColor: colors.background, padding: 20, borderRadius: 16, marginBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  titleRow: { flexDirection: 'row', alignItems: 'center' },
  cardTitle: { fontSize: 17, color: colors.ink, fontFamily: fonts.title },
  cardSubtitle: { fontSize: 13, color: colors.inkMuted },
  expandedContent: { marginTop: 15, paddingTop: 15, borderTopWidth: 1, borderTopColor: colors.line },
  label: { fontSize: 13, fontWeight: '600', color: colors.ink, marginBottom: 6 },
  input: { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.line, borderRadius: 10, padding: 12, fontSize: 15, color: colors.ink, marginBottom: 12 },
  saveBtn: { backgroundColor: colors.blue, padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 10 },
  saveBtnText: { color: colors.background, fontWeight: 'bold', fontSize: 16 }
});