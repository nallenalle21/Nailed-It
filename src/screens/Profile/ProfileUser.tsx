import { useEffect, useState } from 'react';
import { View, Text, Image, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { supabase } from '../../services/supabase';

export default function ProfileUser({ navigation }: any) {
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();
      setProfile(data);
    }
    setLoading(false);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#000" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Image 
          source={{ uri: 'https://via.placeholder.com/120' }} 
          style={styles.profilePic} 
        />
        <Text style={styles.name}>{profile?.username || 'Anonym'}</Text>
        <Text style={styles.subtitle}>{profile?.email}</Text>
      </View>

      <View style={styles.statsContainer}>
        <View style={styles.statBox}>
          <Text style={styles.statNumber}>0</Text>
          <Text style={styles.statLabel}>Bookings</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statNumber}>0.0 ⭐️</Text>
          <Text style={styles.statLabel}>Rating</Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Creator Services</Text>
      <View style={styles.servicesContainer}>
        <View style={styles.serviceBadge}><Text style={styles.serviceText}>💅 Nails</Text></View>
        <View style={styles.serviceBadge}><Text style={styles.serviceText}>💇‍♀️ Hair</Text></View>
        <View style={styles.serviceBadge}><Text style={styles.serviceText}>💄 Makeup</Text></View>
      </View>

      <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 20 },
  header: { alignItems: 'center', marginTop: 40 },
  profilePic: { width: 120, height: 120, borderRadius: 60, marginBottom: 15 },
  name: { fontSize: 26, fontWeight: 'bold' },
  subtitle: { fontSize: 14, color: 'gray', marginTop: 5 },
  statsContainer: { flexDirection: 'row', justifyContent: 'space-around', marginVertical: 30, paddingVertical: 20, borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#eee' },
  statBox: { alignItems: 'center' },
  statNumber: { fontSize: 22, fontWeight: 'bold' },
  statLabel: { fontSize: 14, color: 'gray', marginTop: 5 },
  sectionTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 15 },
  servicesContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 30 },
  serviceBadge: { backgroundColor: '#f0f0f0', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20 },
  serviceText: { fontSize: 16 },
  signOutButton: { backgroundColor: '#ff4444', padding: 15, borderRadius: 10, alignItems: 'center', marginBottom: 40 },
  signOutText: { color: '#fff', fontSize: 16, fontWeight: 'bold' }
});