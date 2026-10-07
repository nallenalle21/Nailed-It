import { useEffect, useState } from 'react';
import { View, Text, Image, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../services/supabase';

export default function ProfileCreator({ navigation }: any) {
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      setProfile(data);
    }
    setLoading(false);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  const handleUploadImage = () => {
    Alert.alert("Upload Image", "Öppnar kamerarullen för att byta bild.");
  };

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#1D3979" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.imageWrapper}>
          <Image source={{ uri: 'https://via.placeholder.com/120' }} style={styles.profilePic} />
          <TouchableOpacity style={styles.cameraIcon} onPress={handleUploadImage}>
            <Ionicons name="camera" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
        <Text style={styles.name}>{profile?.username || 'Studio Name'}</Text>
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

      {/* NY KNAPP TILL BUSINESS DASHBOARD */}
      <TouchableOpacity 
        style={styles.businessButton} 
        onPress={() => navigation.navigate('BusinessCreator')}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Ionicons name="briefcase" size={22} color="#fff" style={{ marginRight: 10 }} />
          <Text style={styles.businessButtonText}>Manage Business</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color="#fff" />
      </TouchableOpacity>

      <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9f9f9', paddingHorizontal: 20 },
  header: { alignItems: 'center', marginTop: 40 },
  imageWrapper: { position: 'relative', marginBottom: 15 },
  profilePic: { width: 120, height: 120, borderRadius: 60, backgroundColor: '#e0e0e0' },
  cameraIcon: { position: 'absolute', bottom: 0, right: 5, backgroundColor: '#191919', padding: 8, borderRadius: 20, borderWidth: 3, borderColor: '#f9f9f9' },
  name: { fontSize: 24, fontWeight: '900', color: '#191919' },
  subtitle: { fontSize: 14, color: '#716C83', marginTop: 5 },
  statsContainer: { flexDirection: 'row', justifyContent: 'space-around', marginVertical: 30, paddingVertical: 20, backgroundColor: '#fff', borderRadius: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  statBox: { alignItems: 'center' },
  statNumber: { fontSize: 22, fontWeight: 'bold', color: '#1D3979' },
  statLabel: { fontSize: 13, color: '#716C83', marginTop: 5, fontWeight: 'bold' },
  
  businessButton: { flexDirection: 'row', backgroundColor: '#1D3979', padding: 20, borderRadius: 16, alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, shadowColor: '#1D3979', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  businessButtonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },

  signOutButton: { backgroundColor: 'transparent', padding: 16, borderRadius: 12, alignItems: 'center', marginBottom: 40, borderWidth: 2, borderColor: '#BF0F46' },
  signOutText: { color: '#BF0F46', fontSize: 16, fontWeight: 'bold' }
});