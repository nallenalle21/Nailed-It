import React, { useState } from 'react';
import { RefreshStar, useStarRefresh } from '../../../components/SparkleStars';
import StarredTitle from '../../../components/StarredTitle';
import { colors, fonts } from '../../../theme';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function Bookkeeping({ navigation }: any) {
  // Pull down to refresh: spinning star instead of the system spinner.
  const pull = useStarRefresh(async () => {}); // nothing to reload yet; the star still spins
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
          <Ionicons name="arrow-back" size={24} color={colors.ink} />
        </TouchableOpacity>
        <StarredTitle style={styles.headerTitle}>Bookkeeping</StarredTitle>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView refreshControl={<RefreshControl {...pull.control} />} style={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionDescription}>
          Keep track of your revenue and your bookkeeping.
        </Text>

        {/* Integration Status Card */}
        <View style={styles.integrationCard}>
          <View style={styles.integrationHeader}>
            <View style={styles.integrationIconBox}>
              <Ionicons name="swap-horizontal" size={28} color={colors.blue} />
            </View>
            <View style={styles.integrationInfo}>
              <Text style={styles.integrationTitle}>Fortnox & Bank</Text>
              <Text style={styles.integrationSubtitle}>Auto-sync activated</Text>
            </View>
            <View style={styles.statusBadge}>
              <View style={styles.statusDot} />
              <Text style={styles.statusText}>Connected</Text>
            </View>
          </View>
          <Text style={styles.integrationBody}>
            Your completed services and payments are automatically synced to your bookkeeping.
          </Text>
          <TouchableOpacity style={styles.settingsBtn}>
            <Text style={styles.settingsBtnText}>Connection settings</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionTitle}>Past Services & Payments</Text>

        {/* Transaktionslista */}
        <View style={styles.transactionsContainer}>
          {transactions.map((tx) => (
            <View key={tx.id} style={styles.txRow}>
              <View style={styles.txLeft}>
                <View style={styles.txIcon}>
                  <Ionicons name="receipt-outline" size={18} color={colors.inkMuted} />
                </View>
                <View>
                  <Text style={styles.txService}>{tx.service}</Text>
                  <Text style={styles.txDate}>{tx.date}</Text>
                </View>
              </View>
              <View style={styles.txRight}>
                <Text style={styles.txAmount}>{tx.amount}</Text>
                <Text style={[styles.txStatus, { color: tx.status === 'Paid' ? colors.blue : colors.pink }]}>
                  {tx.status}
                </Text>
              </View>
            </View>
          ))}
        </View>

        <View style={{ height: 50 }} />
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
  content: { paddingHorizontal: 20 },
  sectionDescription: { fontSize: 14, color: colors.inkMuted, marginBottom: 25 },
  
  integrationCard: { backgroundColor: colors.background, borderRadius: 16, padding: 20, marginBottom: 30, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  integrationHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 15 },
  integrationIconBox: { width: 50, height: 50, borderRadius: 12, backgroundColor: colors.blueTint, justifyContent: 'center', alignItems: 'center', marginRight: 15 },
  integrationInfo: { flex: 1 },
  integrationTitle: { fontSize: 18, color: colors.ink, fontFamily: fonts.title },
  integrationSubtitle: { fontSize: 13, color: colors.inkMuted, marginTop: 2 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.blueTint, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: colors.blue },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.blue, marginRight: 6 },
  statusText: { fontSize: 12, fontWeight: 'bold', color: colors.ink },
  integrationBody: { fontSize: 14, color: colors.inkMuted, lineHeight: 20, marginBottom: 15 },
  settingsBtn: { alignSelf: 'flex-start', borderBottomWidth: 1, borderBottomColor: colors.blue, paddingBottom: 2 },
  settingsBtnText: { color: colors.blue, fontSize: 14, fontWeight: 'bold' },

  sectionTitle: { fontSize: 18, color: colors.ink, marginBottom: 15, fontFamily: fonts.title },
  
  transactionsContainer: { backgroundColor: colors.background, borderRadius: 16, paddingVertical: 10, paddingHorizontal: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 },
  txRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.line },
  txLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  txIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  txService: { fontSize: 15, fontWeight: 'bold', color: colors.ink, marginBottom: 2, textTransform: 'lowercase' },
  txDate: { fontSize: 12, color: colors.inkMuted },
  txRight: { alignItems: 'flex-end' },
  txAmount: { fontSize: 15, fontWeight: 'bold', color: colors.blue, marginBottom: 2, textTransform: 'lowercase' },
  txStatus: { fontSize: 12, fontWeight: 'bold', textTransform: 'lowercase' }
});