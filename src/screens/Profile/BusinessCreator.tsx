import React from 'react';
import { RefreshStar, useStarRefresh } from '../../components/SparkleStars';
import StarredTitle from '../../components/StarredTitle';
import { colors, fonts } from '../../theme';
import { Text } from '../../components/AppText';   // in src/components use './AppText'

import { View, StyleSheet, ScrollView, TouchableOpacity, Alert, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function BusinessCreator({ navigation }: any) {
  // Pull down to refresh: spinning star instead of the system spinner.
  const pull = useStarRefresh(async () => {}) // menu only; the star still spins;
  const navigateTo = (screen: string) => {
    if (screen === 'ServicesAndPrices' || screen === 'WorkLocations' || screen === 'Certificates' || screen === 'Bookkeeping') {
      navigation.navigate(screen);
    } else {
      Alert.alert("Under utveckling", `Denna vy (${screen}) bygger vi härnäst!`);
    }
  };

  return (
    <>
    <ScrollView refreshControl={<RefreshControl {...pull.control} />} style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.ink} />
        </TouchableOpacity>
        <StarredTitle style={styles.headerTitle}>Business Dashboard</StarredTitle>
        <View style={{ width: 24 }} />
      </View>

      <Text style={styles.sectionDescription}>
        Manage your services, prices, certificates, and bookkeeping here.
      </Text>
      
      <View style={styles.menuContainer}>
        <TouchableOpacity style={styles.menuItem} onPress={() => navigateTo('ServicesAndPrices')}>
          <View style={styles.menuIconBox}>
            <Ionicons name="pricetags-outline" size={22} color={colors.blue} />
          </View>
          <View style={styles.menuTextContent}>
            <Text style={styles.menuTitle}>Services</Text>
            <Text style={styles.menuSubtitle}>Add/edit services and set discounts.</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.inkMuted} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.menuItem} onPress={() => navigateTo('WorkLocations')}>
          <View style={styles.menuIconBox}>
            <Ionicons name="location-outline" size={22} color={colors.blue} />
          </View>
          <View style={styles.menuTextContent}>
            <Text style={styles.menuTitle}>Work Locations</Text>
            <Text style={styles.menuSubtitle}>Manage Studio, Home, or Event setups.</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.inkMuted} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.menuItem} onPress={() => navigateTo('Certificates')}>
          <View style={styles.menuIconBox}>
            <Ionicons name="document-text-outline" size={22} color={colors.blue} />
          </View>
          <View style={styles.menuTextContent}>
            <Text style={styles.menuTitle}>Certificates</Text>
            <Text style={styles.menuSubtitle}>Upload proofs of your licenses and skills.</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.inkMuted} />
        </TouchableOpacity>

        <TouchableOpacity style={[styles.menuItem, { borderBottomWidth: 0 }]} onPress={() => navigateTo('Bookkeeping')}>
          <View style={styles.menuIconBox}>
            <Ionicons name="bar-chart-outline" size={22} color={colors.blue} />
          </View>
          <View style={styles.menuTextContent}>
            <Text style={styles.menuTitle}>Bookkeeping</Text>
            <Text style={styles.menuSubtitle}>Fortnox status, payment history and overview.</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.inkMuted} />
        </TouchableOpacity>
      </View>
    </ScrollView>
      <RefreshStar refreshing={pull.refreshing} y={130} />
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, paddingHorizontal: 20 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 60, marginBottom: 20 },
  backBtn: { padding: 5 },
  headerTitle: { fontSize: 22, color: colors.ink, fontFamily: fonts.title },
  sectionDescription: { fontSize: 14, color: colors.inkMuted, marginBottom: 20 },
  menuContainer: { backgroundColor: colors.background, borderRadius: 16, paddingVertical: 5, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  menuItem: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: colors.line },
  menuIconBox: { width: 40, height: 40, borderRadius: 10, backgroundColor: colors.blueTint, justifyContent: 'center', alignItems: 'center', marginRight: 15 },
  menuTextContent: { flex: 1 },
  menuTitle: { fontSize: 16, color: colors.ink, marginBottom: 3, fontFamily: fonts.title },
  menuSubtitle: { fontSize: 12, color: colors.inkMuted, lineHeight: 16 }
});