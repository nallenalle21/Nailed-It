import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../../services/supabase'; // Adjust path if needed

type Service = {
  id: string;
  name: string;
  price: number;
  discount_price: number | null;
};

export default function ServicesAndPrices({ navigation }: any) {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);

  const [newName, setNewName] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [newDiscount, setNewDiscount] = useState('');

  // 1. Fetch services from Supabase when screen loads
  useEffect(() => {
    fetchServices();
  }, []);

  const fetchServices = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('services')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      Alert.alert("Error fetching services", error.message);
    } else if (data) {
      setServices(data);
    }
    setLoading(false);
  };

  // 2. Add a new service to Supabase
  const handleAddService = async () => {
    if (!newName.trim() || !newPrice.trim()) {
      Alert.alert("Missing info", "Please enter both a service name and a regular price.");
      return;
    }

    const priceNum = parseFloat(newPrice);
    const discountNum = newDiscount.trim() ? parseFloat(newDiscount) : null;

    if (isNaN(priceNum) || (discountNum !== null && isNaN(discountNum))) {
      Alert.alert("Invalid price", "Please enter valid numbers for the price fields.");
      return;
    }

    const { data, error } = await supabase
      .from('services')
      .insert([
        {
          name: newName.trim(),
          price: priceNum,
          discount_price: discountNum,
        }
      ])
      .select();

    if (error) {
      Alert.alert("Could not save service", error.message);
      return;
    }

    if (data) {
      setServices([data[0], ...services]);
      setNewName('');
      setNewPrice('');
      setNewDiscount('');
    }
  };

  // 3. Delete a service from Supabase
  const handleDelete = (id: string, name: string) => {
    Alert.alert("Delete Service", `Are you sure you want to remove "${name}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          const { error } = await supabase
            .from('services')
            .delete()
            .eq('id', id);

          if (error) {
            Alert.alert("Error deleting", error.message);
          } else {
            setServices(services.filter(s => s.id !== id));
          }
        }
      }
    ]);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#191919" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Services & Prices</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionDescription}>
          Add the treatments you offer, set your regular prices, and add optional discounted prices for campaigns.
        </Text>

        {/* Form to add a new service */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Add New Service</Text>

          <Text style={styles.label}>Service Name</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Gel Nails - New Set"
            value={newName}
            onChangeText={setNewName}
            placeholderTextColor="#716C83"
          />

          <View style={styles.row}>
            <View style={{ flex: 1, marginRight: 10 }}>
              <Text style={styles.label}>Regular Price (SEK)</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. 650"
                keyboardType="numeric"
                value={newPrice}
                onChangeText={setNewPrice}
                placeholderTextColor="#716C83"
              />
            </View>

            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Discount Price (Optional)</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. 500"
                keyboardType="numeric"
                value={newDiscount}
                onChangeText={setNewDiscount}
                placeholderTextColor="#716C83"
              />
            </View>
          </View>

          <TouchableOpacity style={styles.addBtn} onPress={handleAddService}>
            <Ionicons name="add-circle-outline" size={20} color="#fff" style={{ marginRight: 8 }} />
            <Text style={styles.addBtnText}>Add Service</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionTitle}>Your Offered Services</Text>

        {loading ? (
          <ActivityIndicator size="large" color="#1D3979" style={{ marginTop: 20 }} />
        ) : services.length === 0 ? (
          <Text style={styles.emptyText}>No services added yet.</Text>
        ) : (
          services.map((service) => (
            <View key={service.id} style={styles.serviceItem}>
              <View style={styles.serviceInfo}>
                <Text style={styles.serviceName}>{service.name}</Text>
                <View style={styles.priceRow}>
                  {service.discount_price ? (
                    <>
                      <Text style={styles.oldPrice}>{service.price} kr</Text>
                      <Text style={styles.discountPrice}>{service.discount_price} kr</Text>
                    </>
                  ) : (
                    <Text style={styles.regularPrice}>{service.price} kr</Text>
                  )}
                </View>
              </View>
              <TouchableOpacity onPress={() => handleDelete(service.id, service.name)} style={styles.deleteBtn}>
                <Ionicons name="trash-outline" size={20} color="#BF0F46" />
              </TouchableOpacity>
            </View>
          ))
        )}

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
  card: { backgroundColor: '#fff', padding: 20, borderRadius: 16, marginBottom: 30, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  cardTitle: { fontSize: 18, fontWeight: 'bold', color: '#191919', marginBottom: 15 },
  label: { fontSize: 13, fontWeight: '600', color: '#191919', marginBottom: 6 },
  input: { backgroundColor: '#F9F9F9', borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 10, padding: 12, fontSize: 15, color: '#191919', marginBottom: 15 },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  addBtn: { backgroundColor: '#1D3979', flexDirection: 'row', justifyContent: 'center', alignItems: 'center', padding: 15, borderRadius: 12, marginTop: 5 },
  addBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#191919', marginBottom: 15 },
  emptyText: { fontSize: 14, color: '#716C83', fontStyle: 'italic', marginTop: 10 },
  serviceItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#fff', padding: 16, borderRadius: 12, marginBottom: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 },
  serviceInfo: { flex: 1 },
  serviceName: { fontSize: 16, fontWeight: 'bold', color: '#191919', marginBottom: 4 },
  priceRow: { flexDirection: 'row', alignItems: 'center' },
  regularPrice: { fontSize: 14, color: '#1D3979', fontWeight: 'bold' },
  oldPrice: { fontSize: 14, color: '#716C83', textDecorationLine: 'line-through', marginRight: 8 },
  discountPrice: { fontSize: 14, color: '#BF0F46', fontWeight: 'bold' },
  deleteBtn: { padding: 8 }
});