import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function BusinessCreator({ navigation }: any) {
  const navigateTo = (screen: string) => {
    Alert.alert("Navigation", `Detta kommer ta dig till: ${screen}`);
  };

  return (
    <ScrollView style={styles.container}>
      {/* Header med en tillbaka-knapp */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#191919" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Business Dashboard</Text>
        <View style={{ width: 24 }} /> {/* Tom view för balansering av flex */}
      </View>

      <Text style={styles.sectionDescription}>
        Hantera dina tjänster, priser, certifikat och din bokföring här.
      </Text>
      
      <View style={styles.menuContainer}>
        {/* Services & Prices */}
        <TouchableOpacity style={styles.menuItem} onPress={() => navigateTo('ServicesAndPrices')}>
          <View style={styles.menuIconBox}><Ionicons name="pricetags-outline" size={22} color="#1D3979" /></View>
          <View style={styles.menuTextContent}>
            <Text style={styles.menuTitle}>Services, Prices & Discounts</Text>
            <Text style={styles.menuSubtitle}>Add/edit services (e.g. Advanced nail art, 90min) and set discounts.</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="gray" />
        </TouchableOpacity>

        {/* Work Locations */}
        <TouchableOpacity style={styles.menuItem} onPress={() => navigateTo('WorkLocations')}>
          <View style={styles.menuIconBox}><Ionicons name="location-outline" size={22} color="#1D3979" /></View>
          <View style={styles.menuTextContent}>
            <Text style={styles.menuTitle}>Work Locations</Text>
            <Text style={styles.menuSubtitle}>Manage Studio, Home, or Event setups.</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="gray" />
        </TouchableOpacity>

        {/* Certificates & Diplomas */}
        <TouchableOpacity style={styles.menuItem} onPress={() => navigateTo('Certificates')}>
          <View style={styles.menuIconBox}><Ionicons name="document-text-outline" size={22} color="#1D3979" /></View>
          <View style={styles.menuTextContent}>
            <Text style={styles.menuTitle}>Certificates & Diplomas</Text>
            <Text style={styles.menuSubtitle}>Upload proofs of your licenses and skills.</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="gray" />
        </TouchableOpacity>

        {/* Bookkeeping & Fortnox */}
        <TouchableOpacity onPress={() => navigateTo('Bookkeeping')} style={[styles.menuItem, { borderBottomWidth: 0 }]}>
          <View style={styles.menuIconBox}><Ionicons name="bar-chart-outline" size={22} color="#1D3979" /></View>
          <View style={styles.menuTextContent}>
            <Text style={styles.menuTitle}>Bookkeeping & Bank</Text>
            <Text style={styles.menuSubtitle}>Fortnox status, payment history and overview.</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="gray" />
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9f9f9', paddingHorizontal: 20 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 60, marginBottom: 20 },
  backBtn: { padding: 5 },
  headerTitle: { fontSize: 22, fontWeight: '900', color: '#191919' },
  sectionDescription: { fontSize: 14, color: '#716C83', marginBottom: 20 },
  menuContainer: { backgroundColor: '#fff', borderRadius: 16, paddingVertical: 5, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  menuItem: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  menuIconBox: { width: 40, height: 40, borderRadius: 10, backgroundColor: '#F0F4FF', justifyContent: 'center', alignItems: 'center', marginRight: 15 },
  menuTextContent: { flex: 1 },
  menuTitle: { fontSize: 16, fontWeight: 'bold', color: '#191919', marginBottom: 3 },
  menuSubtitle: { fontSize: 12, color: '#716C83', lineHeight: 16 }
});