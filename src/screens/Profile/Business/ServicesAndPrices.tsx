/**
 * Creator-only management of services offered by the signed-in vendor.
 * Depends on supabase/02_prepare_services.sql (duration_minutes and category columns).
 */
import React, { useCallback, useState } from 'react';
import { RefreshStar, useStarRefresh } from '../../../components/SparkleStars';
import StarredTitle from '../../../components/StarredTitle';
import { colors, fonts } from '../../../theme';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../../services/supabase';

type Service = {
  id: string;
  user_id: string;
  name: string;
  category: string;
  duration_minutes: number;
  price: number | string;
  discount_price: number | string | null;
};

const formatPrice = (amount: number | string) => `${Number(amount).toLocaleString('sv-SE')} kr`;

export default function ServicesAndPrices({ navigation }: any) {
  // Pull down to refresh: spinning star instead of the system spinner.
  const pull = useStarRefresh();
  const [userId, setUserId] = useState<string | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [newDuration, setNewDuration] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [newDiscount, setNewDiscount] = useState('');

  // Reload when the Business screen is opened again.
  useFocusEffect(useCallback(() => {
    let active = true;
    setLoading(true);
    setServices([]);
    setUserId(null);

    const load = async () => {
      try {
        const { data: auth, error: authError } = await supabase.auth.getUser();
        if (authError) throw authError;
        const uid = auth.user?.id;
        if (!uid) throw new Error('Please sign in again.');

        const { data: vendor, error: vendorError } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', uid)
          .single();
        if (vendorError) throw vendorError;
        if (vendor?.role !== 'creator') throw new Error('Only vendors can manage services.');

        const { data, error } = await supabase
          .from('services')
          .select('id, user_id, name, category, duration_minutes, price, discount_price')
          .eq('user_id', uid)
          .order('created_at', { ascending: false });
        if (error) throw error;
        if (!active) return;
        setUserId(uid);
        setServices((data ?? []) as Service[]);
      } catch (caughtError) {
        if (active) Alert.alert('Could not load services', String(caughtError));
      } finally {
        if (active) setLoading(false);
        pull.doneLoading();
      }
    };

    void load();
    return () => { active = false; };
  }, [pull.refreshKey])); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAddService = async () => {
    if (!userId || saving) return;

    const name = newName.trim();
    const category = newCategory.trim();
    const durationMinutes = Number(newDuration.trim());
    const price = Number(newPrice.trim().replace(',', '.'));
    const discountPrice = newDiscount.trim()
      ? Number(newDiscount.trim().replace(',', '.'))
      : null;

    if (!name || !category || !newDuration.trim() || !newPrice.trim()) {
      Alert.alert('Missing information', 'Enter a service name, category, duration and price.');
      return;
    }
    if (!Number.isInteger(durationMinutes) || durationMinutes <= 0) {
      Alert.alert('Invalid duration', 'Enter a duration in whole minutes, such as 60 or 90.');
      return;
    }
    if (!Number.isFinite(price) || price < 0 ||
        (discountPrice !== null && (!Number.isFinite(discountPrice) || discountPrice < 0 || discountPrice > price))) {
      Alert.alert('Invalid price', 'Enter valid prices. A discount must not exceed the regular price.');
      return;
    }

    setSaving(true);
    try {
      // Confirm session identity at the moment of writing, not only on screen load.
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!auth.user || auth.user.id !== userId) throw new Error('Session changed. Please reopen this screen.');

      const { data, error } = await supabase
        .from('services')
        .insert({
          user_id: auth.user.id,
          name,
          category,
          duration_minutes: durationMinutes,
          price,
          discount_price: discountPrice,
        })
        .select('id, user_id, name, category, duration_minutes, price, discount_price')
        .single();
      if (error) throw error;
      setServices(previous => [data as Service, ...previous]);
      setNewName('');
      setNewCategory('');
      setNewDuration('');
      setNewPrice('');
      setNewDiscount('');
    } catch (caughtError) {
      Alert.alert('Could not save service', String(caughtError));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (service: Service) => {
    if (!userId) return;
    Alert.alert('Delete service?', `Remove "${service.name}" from your services?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            const { data: auth, error: authError } = await supabase.auth.getUser();
            if (authError) throw authError;
            if (!auth.user || auth.user.id !== userId) throw new Error('Session changed. Reopen this screen.');
            const { data, error } = await supabase
              .from('services')
              .delete()
              .eq('id', service.id)
              .eq('user_id', auth.user.id)
              .select('id');
            if (error) throw error;
            if (!data?.length) throw new Error('Service not found or you do not have permission to delete it.');
            setServices(previous => previous.filter(item => item.id !== service.id));
          } catch (caughtError) {
            Alert.alert('Could not delete service', String(caughtError));
          }
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} accessibilityLabel="Go back">
          <Ionicons name="arrow-back" size={24} color={colors.ink} />
        </TouchableOpacity>
        <StarredTitle style={styles.headerTitle}>Services & Prices</StarredTitle>
        <View style={{ width: 24 }} />
      </View>
      <ScrollView refreshControl={<RefreshControl {...pull.control} />} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <Text style={styles.sectionDescription}>
          Add services that customers can see on your public vendor profile. Each service belongs to your account only.
        </Text>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Add New Service</Text>
          <Text style={styles.label}>Service Name</Text>
          <TextInput style={styles.input} placeholder="e.g. Advanced nail art"
            value={newName} onChangeText={setNewName} placeholderTextColor={colors.inkMuted} />
          <Text style={styles.label}>Service Category</Text>
          <TextInput style={styles.input} placeholder="e.g. Nails, Hair, Makeup"
            value={newCategory} onChangeText={setNewCategory} placeholderTextColor={colors.inkMuted} />
          <Text style={styles.label}>Duration (minutes)</Text>
          <TextInput style={styles.input} placeholder="e.g. 90" keyboardType="number-pad"
            value={newDuration} onChangeText={setNewDuration} placeholderTextColor={colors.inkMuted} />
          <View style={styles.row}>
            <View style={styles.priceColumn}>
              <Text style={styles.label}>Regular Price (SEK)</Text>
              <TextInput style={styles.input} placeholder="e.g. 650" keyboardType="decimal-pad"
                value={newPrice} onChangeText={setNewPrice} placeholderTextColor={colors.inkMuted} />
            </View>
            <View style={styles.priceColumn}>
              <Text style={styles.label}>Discount Price (Optional)</Text>
              <TextInput style={styles.input} placeholder="e.g. 500" keyboardType="decimal-pad"
                value={newDiscount} onChangeText={setNewDiscount} placeholderTextColor={colors.inkMuted} />
            </View>
          </View>
          <TouchableOpacity
            style={[styles.addBtn, (saving || loading || !userId) && styles.disabled]}
            onPress={handleAddService} disabled={saving || loading || !userId}>
            <Ionicons name="add-circle-outline" size={20} color={colors.background} style={{ marginRight: 8 }} />
            <Text style={styles.addBtnText}>{saving ? 'Saving…' : 'Add Service'}</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.sectionTitle}>Your Offered Services</Text>
        {loading ? (
          <ActivityIndicator size="large" color={colors.blue} style={{ marginTop: 20 }} />
        ) : services.length === 0 ? (
          <Text style={styles.emptyText}>No services added yet.</Text>
        ) : (
          services.map(service => (
            <View key={service.id} style={styles.serviceItem}>
              <View style={styles.serviceInfo}>
                <Text style={styles.serviceName}>{service.name}</Text>
                <Text style={styles.serviceMeta}>{service.category} · {service.duration_minutes} min</Text>
                <View style={styles.priceRow}>
                  {service.discount_price !== null ? (
                    <>
                      <Text style={styles.oldPrice}>{formatPrice(service.price)}</Text>
                      <Text style={styles.discountPrice}>{formatPrice(service.discount_price)}</Text>
                    </>
                  ) : (
                    <Text style={styles.regularPrice}>{formatPrice(service.price)}</Text>
                  )}
                </View>
              </View>
              <TouchableOpacity onPress={() => handleDelete(service)} style={styles.deleteBtn} accessibilityLabel={`Delete ${service.name}`}>
                <Ionicons name="trash-outline" size={20} color={colors.wine} />
              </TouchableOpacity>
            </View>
          ))
        )}
      </ScrollView>
      <RefreshStar refreshing={pull.refreshing} y={130} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 60, marginBottom: 10, paddingHorizontal: 20 },
  backBtn: { padding: 5 },
  headerTitle: { fontSize: 22, color: colors.ink, fontFamily: fonts.title },
  content: { paddingHorizontal: 20, paddingBottom: 50 },
  sectionDescription: { fontSize: 14, color: colors.inkMuted, marginBottom: 20 },
  card: { backgroundColor: colors.background, padding: 20, borderRadius: 16, marginBottom: 30, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  cardTitle: { fontSize: 18, color: colors.ink, marginBottom: 15, fontFamily: fonts.title },
  label: { fontSize: 13, color: colors.ink, fontWeight: '600', marginBottom: 6 },
  input: { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.line, borderRadius: 10, padding: 12, fontSize: 15, color: colors.ink, marginBottom: 15 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  priceColumn: { flex: 1 },
  addBtn: { backgroundColor: colors.blue, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', padding: 15, borderRadius: 12, marginTop: 5 },
  disabled: { opacity: 0.5 },
  addBtnText: { color: colors.background, fontWeight: 'bold', fontSize: 16 },
  sectionTitle: { fontSize: 18, color: colors.ink, marginBottom: 15, fontFamily: fonts.title },
  emptyText: { fontSize: 14, color: colors.inkMuted, fontStyle: 'italic', marginTop: 10 },
  serviceItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.background, padding: 16, borderRadius: 12, marginBottom: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 },
  serviceInfo: { flex: 1 },
  serviceName: { fontSize: 16, fontWeight: 'bold', color: colors.ink, marginBottom: 4 },
  serviceMeta: { fontSize: 12, color: colors.inkMuted, marginBottom: 6 },
  priceRow: { flexDirection: 'row', alignItems: 'center' },
  regularPrice: { fontSize: 14, color: colors.blue, fontWeight: 'bold' },
  oldPrice: { fontSize: 14, color: colors.inkMuted, textDecorationLine: 'line-through', marginRight: 8 },
  discountPrice: { fontSize: 14, color: colors.wine, fontWeight: 'bold' },
  deleteBtn: { padding: 8 },
});
