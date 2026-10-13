/**
 * Temporary vendor picker for development.
 * Replace the tab entry with navigation from Explore / Saved posts later.
 */
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../services/supabase';

type Vendor = { id: string; username: string | null };

const theme = {
  background: '#FCFAFB',
  ink: '#271D2B',
  muted: '#786B7A',
  accent: '#853A57',
  accentSoft: '#F6EDF1',
  border: '#E9DFE6',
};

export default function VendorDirectory({ navigation }: any) {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let current = true;
    setLoading(true);
    setError(null);

    (async () => {
      const { data, error: requestError } = await supabase
        .from('profiles')
        .select('id, username')
        .eq('role', 'creator')
        .order('username', { ascending: true });

      if (!current) return;
      setVendors((data ?? []) as Vendor[]);
      setError(requestError?.message ?? null);
      setLoading(false);
    })();

    return () => { current = false; };
  }, [refreshKey]);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.eyebrowRow}>
          <Ionicons name="flask-outline" size={16} color={theme.accent} />
          <Text style={styles.eyebrow}>DEVELOPMENT PREVIEW</Text>
        </View>
        <Text style={styles.heading}>Explore creators</Text>
        <Text style={styles.description}>
          Choose a vendor to preview their public profile. This temporary selector can later be
          replaced by profile links from Explore and Saved.
        </Text>

        <Text style={styles.label}>Vendor</Text>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Choose a vendor"
          accessibilityState={{ expanded: open }}
          onPress={() => setOpen(value => !value)}
          style={styles.selector}
        >
          <Text style={styles.selectorText}>Select a creator</Text>
          <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={20} color={theme.ink} />
        </TouchableOpacity>

        {open && (
          <View style={styles.menu}>
            {loading ? (
              <ActivityIndicator color={theme.accent} style={styles.menuLoading} />
            ) : error ? (
              <Text style={styles.message}>Could not fetch creators: {error}</Text>
            ) : vendors.length === 0 ? (
              <Text style={styles.message}>No creator accounts are available.</Text>
            ) : (
              vendors.map(vendor => (
                <TouchableOpacity
                  key={vendor.id}
                  accessibilityRole="button"
                  style={styles.menuItem}
                  onPress={() => {
                    setOpen(false);
                    navigation.navigate('VendorProfile', { vendorId: vendor.id });
                  }}
                >
                  <View style={styles.avatar}>
                    <Ionicons name="person-outline" size={18} color={theme.accent} />
                  </View>
                  <Text style={styles.vendorName}>{vendor.username?.trim() || 'Unnamed creator'}</Text>
                  <Ionicons name="chevron-forward" size={18} color={theme.muted} />
                </TouchableOpacity>
              ))
            )}
          </View>
        )}

        {error && !open ? <Text style={styles.error}>Could not fetch creators: {error}</Text> : null}
        <TouchableOpacity
          accessibilityRole="button"
          style={styles.refresh}
          onPress={() => setRefreshKey(value => value + 1)}
        >
          <Ionicons name="refresh" size={15} color={theme.accent} />
          <Text style={styles.refreshText}>Refresh creator list</Text>
        </TouchableOpacity>
        <View style={styles.infoBox}>
          <Ionicons name="information-circle-outline" size={20} color={theme.accent} />
          <Text style={styles.infoText}>
            Creators are read from Supabase profiles with role = creator. No account information
            beyond public usernames is shown here.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  content: { paddingHorizontal: 22, paddingTop: 26, paddingBottom: 42 },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 15 },
  eyebrow: { color: theme.accent, fontWeight: '800', fontSize: 11, letterSpacing: 1.4 },
  heading: { fontSize: 33, fontWeight: '800', color: theme.ink, marginBottom: 12 },
  description: { fontSize: 15, lineHeight: 23, color: theme.muted, marginBottom: 32 },
  label: { fontSize: 13, fontWeight: '700', color: theme.ink, marginBottom: 9 },
  selector: {
    backgroundColor: '#FFF', borderWidth: 1, borderColor: theme.border,
    paddingVertical: 17, paddingHorizontal: 16, borderRadius: 14,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  selectorText: { fontSize: 16, color: theme.ink, fontWeight: '600' },
  menu: { backgroundColor: '#FFF', borderRadius: 14, borderWidth: 1, borderColor: theme.border, marginTop: 8, overflow: 'hidden' },
  menuLoading: { paddingVertical: 24 },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 15, paddingVertical: 11, borderBottomColor: theme.border, borderBottomWidth: StyleSheet.hairlineWidth },
  avatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: theme.accentSoft, alignItems: 'center', justifyContent: 'center' },
  vendorName: { flex: 1, fontSize: 15, fontWeight: '600', color: theme.ink },
  message: { padding: 16, color: theme.muted },
  error: { fontSize: 13, marginTop: 10, color: '#A12339' },
  refresh: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 18, marginBottom: 30 },
  refreshText: { color: theme.accent, fontWeight: '700', fontSize: 13 },
  infoBox: { flexDirection: 'row', padding: 16, gap: 10, backgroundColor: theme.accentSoft, borderRadius: 14 },
  infoText: { color: theme.muted, fontSize: 13, lineHeight: 19, flex: 1 },
});
