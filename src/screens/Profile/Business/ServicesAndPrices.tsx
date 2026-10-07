import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, Switch } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function ServicesAndPrices({ navigation }: any) {
  const [serviceName, setServiceName] = useState('');
  const [price, setPrice] = useState('');
  const [duration, setDuration] = useState('');
  const [category, setCategory] = useState('Nails');
  const [isDiscounted, setIsDiscounted] = useState(false);

  const [services, setServices] = useState([
    { id: '1', name: 'Advanced nail art', duration: '90', price: '600', category: 'Nails', type: 'regular' },
    { id: '2', name: 'Discount! Advanced nail art', duration: '90', price: '400', category: 'Nails', type: 'discounted' },
  ]);

  const handleAddService = () => {
    if (!serviceName || !price || !duration) return;
    
    const newService = {
      id: Date.now().toString(),
      name: isDiscounted ? `Discount! ${serviceName}` : serviceName,
      duration: duration,
      price: price,
      category,
      type: isDiscounted ? 'discounted' : 'regular'
    };
    
    setServices([newService, ...services]);
    setServiceName('');
    setPrice('');
    setDuration('');
    setIsDiscounted(false);
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
        <View style={styles.formContainer}>
          <Text style={styles.sectionTitle}>Add New Service</Text>
          
          <TextInput style={styles.input} placeholder="Service Name" value={serviceName} onChangeText={setServiceName} placeholderTextColor="#716C83" />
          
          <View style={styles.row}>
            <TextInput style={[styles.input, { flex: 1, marginRight: 10 }]} placeholder="Price (SEK)" value={price} onChangeText={setPrice} keyboardType="numeric" placeholderTextColor="#716C83" />
            <TextInput style={[styles.input, { flex: 1 }]} placeholder="Duration (min)" value={duration} onChangeText={setDuration} keyboardType="numeric" placeholderTextColor="#716C83" />
          </View>

          <TextInput style={styles.input} placeholder="Category" value={category} onChangeText={setCategory} placeholderTextColor="#716C83" />

          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>Is this a discounted service?</Text>
            <Switch 
              value={isDiscounted} 
              onValueChange={setIsDiscounted} 
              trackColor={{ false: '#e0e0e0', true: '#BFE34F' }}
              thumbColor={isDiscounted ? '#1D3979' : '#f4f3f4'}
            />
          </View>

          <TouchableOpacity style={styles.addButton} onPress={handleAddService}>
            <Text style={styles.addButtonText}>Save Service</Text>
          </TouchableOpacity>
        </View>

        <Text style={[styles.sectionTitle, { marginTop: 30 }]}>Your Offered Services</Text>
        
        {services.map((srv) => (
          <View key={srv.id} style={styles.serviceCard}>
            <View style={styles.serviceHeader}>
              <View style={styles.categoryBadge}>
                <Text style={styles.categoryText}>{srv.category}</Text>
              </View>
              {srv.type === 'discounted' && (
                <View style={styles.discountBadge}>
                  <Text style={styles.discountText}>Discount</Text>
                </View>
              )}
            </View>
            <Text style={styles.serviceName}>{srv.name}</Text>
            <View style={styles.serviceDetails}>
              <Text style={styles.serviceDetailText}>{srv.duration} min</Text>
              <Text style={styles.servicePrice}>{srv.price} sek</Text>
            </View>
            <TouchableOpacity style={styles.editButton}>
              <Text style={styles.editButtonText}>Edit</Text>
            </TouchableOpacity>
          </View>
        ))}
        
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
  formContainer: { backgroundColor: '#fff', padding: 20, borderRadius: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#191919', marginBottom: 15 },
  input: { backgroundColor: '#F9F9F9', borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 10, padding: 15, fontSize: 16, marginBottom: 15, color: '#191919' },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, paddingVertical: 5 },
  toggleLabel: { fontSize: 16, color: '#191919' },
  addButton: { backgroundColor: '#1D3979', padding: 16, borderRadius: 10, alignItems: 'center' },
  addButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  serviceCard: { backgroundColor: '#fff', padding: 16, borderRadius: 12, marginBottom: 15, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 },
  serviceHeader: { flexDirection: 'row', marginBottom: 10 },
  categoryBadge: { backgroundColor: '#f0f0f0', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, marginRight: 8 },
  categoryText: { fontSize: 12, color: '#716C83', fontWeight: 'bold' },
  discountBadge: { backgroundColor: '#BF0F46', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  discountText: { fontSize: 12, color: '#fff', fontWeight: 'bold' },
  serviceName: { fontSize: 18, fontWeight: 'bold', color: '#191919', marginBottom: 8 },
  serviceDetails: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  serviceDetailText: { fontSize: 14, color: '#716C83' },
  servicePrice: { fontSize: 18, fontWeight: 'bold', color: '#1D3979' },
  editButton: { alignSelf: 'flex-start', borderBottomWidth: 1, borderBottomColor: '#1D3979' },
  editButtonText: { color: '#1D3979', fontSize: 14, fontWeight: 'bold' }
});