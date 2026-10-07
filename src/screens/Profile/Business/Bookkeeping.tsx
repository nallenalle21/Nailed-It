import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function Bookkeeping({ navigation }: any) {
  // Exempeldata för tidigare transaktioner
  const [transactions] = useState([
    { id: '1', service: 'Advanced nail art', date: '2026-10-07', amount: '600 SEK', status: 'Paid' },
    { id: '2', service: 'Discount! Quick Fix', date: '2026-10-06', amount: '250 SEK', status: 'Paid' },
    { id: '3', service: 'Bridal Makeup', date: '2026-10-02', amount: '1500 SEK', status: 'Pending' },
  ]);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#191919" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Bookkeeping</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionDescription}>
          Håll koll på dina intäkter och din bokföring.
        </Text>

        {/* Integration Status Card */}
        <View style={styles.integrationCard}>
          <View style={styles.integrationHeader}>
            <View style={styles.integrationIconBox}>
              <Ionicons name="swap-horizontal" size={28} color="#1D3979" />
            </View>
            <View style={styles.integrationInfo}>
              <Text style={styles.integrationTitle}>Fortnox & Bank</Text>
              <Text style={styles.integrationSubtitle}>Auto-sync aktiverad</Text>
            </View>
            <View style={styles.statusBadge}>
              <View style={styles.statusDot} />
              <Text style={styles.statusText}>Connected</Text>
            </View>
          </View>
          <Text style={styles.integrationBody}>
            Dina genomförda tjänster och betalningar synkas automatiskt till din bokföring.
          </Text>
          <TouchableOpacity style={styles.settingsBtn}>
            <Text style={styles.settingsBtnText}>Hantera anslutning</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionTitle}>Tidigare Tjänster & Betalningar</Text>

        {/* Transaktionslista */}
        <View style={styles.transactionsContainer}>
          {transactions.map((tx) => (
            <View key={tx.id} style={styles.txRow}>
              <View style={styles.txLeft}>
                <View style={styles.txIcon}>
                  <Ionicons name="receipt-outline" size={18} color="#716C83" />
                </View>
                <View>
                  <Text style={styles.txService}>{tx.service}</Text>
                  <Text style={styles.txDate}>{tx.date}</Text>
                </View>
              </View>
              <View style={styles.txRight}>
                <Text style={styles.txAmount}>{tx.amount}</Text>
                <Text style={[styles.txStatus, { color: tx.status === 'Paid' ? '#BFE34F' : '#F29C38' }]}>
                  {tx.status}
                </Text>
              </View>
            </View>
          ))}
        </View>

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
  sectionDescription: { fontSize: 14, color: '#716C83', marginBottom: 25 },
  
  integrationCard: { backgroundColor: '#fff', borderRadius: 16, padding: 20, marginBottom: 30, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  integrationHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 15 },
  integrationIconBox: { width: 50, height: 50, borderRadius: 12, backgroundColor: '#F0F4FF', justifyContent: 'center', alignItems: 'center', marginRight: 15 },
  integrationInfo: { flex: 1 },
  integrationTitle: { fontSize: 18, fontWeight: 'bold', color: '#191919' },
  integrationSubtitle: { fontSize: 13, color: '#716C83', marginTop: 2 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F0FFF0', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: '#BFE34F' },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#BFE34F', marginRight: 6 },
  statusText: { fontSize: 12, fontWeight: 'bold', color: '#191919' },
  integrationBody: { fontSize: 14, color: '#716C83', lineHeight: 20, marginBottom: 15 },
  settingsBtn: { alignSelf: 'flex-start', borderBottomWidth: 1, borderBottomColor: '#1D3979', paddingBottom: 2 },
  settingsBtnText: { color: '#1D3979', fontSize: 14, fontWeight: 'bold' },

  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#191919', marginBottom: 15 },
  
  transactionsContainer: { backgroundColor: '#fff', borderRadius: 16, paddingVertical: 10, paddingHorizontal: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 },
  txRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  txLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  txIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#F9F9F9', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  txService: { fontSize: 15, fontWeight: 'bold', color: '#191919', marginBottom: 2 },
  txDate: { fontSize: 12, color: '#716C83' },
  txRight: { alignItems: 'flex-end' },
  txAmount: { fontSize: 15, fontWeight: 'bold', color: '#1D3979', marginBottom: 2 },
  txStatus: { fontSize: 12, fontWeight: 'bold' }
});