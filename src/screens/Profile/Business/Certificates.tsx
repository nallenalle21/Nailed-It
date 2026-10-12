import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Image, Modal, TextInput, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
// Adjust the path below if your supabase.ts is located elsewhere:
import { supabase } from '/Users/lovajawostrom/Desktop/prog/Nailedit/Nailed-It/src/services/supabase';

type Certificate = {
  id: string;
  title: string;
  date: string;
  image_url: string | null;
};

export default function Certificates({ navigation }: any) {
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [loading, setLoading] = useState(true);

  const [isModalVisible, setIsModalVisible] = useState(false);
  const [pendingImageUri, setPendingImageUri] = useState<string | null>(null);
  const [newCertName, setNewCertName] = useState('');

  // 1. Fetch saved certificates from Supabase when the screen loads
  useEffect(() => {
    fetchCertificates();
  }, []);

  const fetchCertificates = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('certificates')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      Alert.alert("Error fetching data", error.message);
    } else if (data) {
      setCertificates(data);
    }
    setLoading(false);
  };

  const handleUpload = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    
    if (permissionResult.granted === false) {
      Alert.alert("Permission required", "The app needs access to your photos to upload certificates.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.8,
    });

    if (!result.canceled) {
      setPendingImageUri(result.assets[0].uri);
      setNewCertName(''); 
      setIsModalVisible(true);
    }
  };

  // 2. Save the new certificate to the Supabase table
  const handleSaveCertificate = async () => {
    if (!newCertName.trim()) {
      Alert.alert("Missing name", "Please enter a name for your certificate.");
      return;
    }

    const today = new Date().toISOString().split('T')[0];

    const { data, error } = await supabase
      .from('certificates')
      .insert([
        {
          title: newCertName,
          date: today,
          image_url: pendingImageUri,
        }
      ])
      .select();

    if (error) {
      Alert.alert("Could not save", error.message);
      return;
    }

    if (data) {
      // Add the newly created certificate from the database to the top of the list
      setCertificates([data[0], ...certificates]);
      setIsModalVisible(false);
      setPendingImageUri(null);
    }
  };

  // 3. Delete the certificate from Supabase
  const handleDelete = (id: string, title: string) => {
    Alert.alert("Delete", `Are you sure you want to delete ${title}?`, [
      { text: "Cancel", style: "cancel" },
      { 
        text: "Delete", 
        style: "destructive",
        onPress: async () => {
          const { error } = await supabase
            .from('certificates')
            .delete()
            .eq('id', id);

          if (error) {
            Alert.alert("Error deleting", error.message);
          } else {
            setCertificates(certificates.filter(cert => cert.id !== id));
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
        <Text style={styles.headerTitle}>Certificates</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionDescription}>
          Upload proof of your education, licenses, and certificates to build trust with your clients.
        </Text>

        <TouchableOpacity style={styles.uploadBox} onPress={handleUpload}>
          <View style={styles.uploadIconCircle}>
            <Ionicons name="cloud-upload-outline" size={32} color="#1D3979" />
          </View>
          <Text style={styles.uploadTitle}>Upload new certificate</Text>
          <Text style={styles.uploadSubtitle}>Tap here to choose a file or take a photo</Text>
        </TouchableOpacity>

        <Text style={styles.sectionTitle}>Your saved certificates</Text>

        {loading ? (
          <ActivityIndicator size="large" color="#1D3979" style={{ marginTop: 20 }} />
        ) : certificates.length === 0 ? (
          <Text style={styles.emptyText}>No certificates uploaded yet.</Text>
        ) : (
          certificates.map((cert) => (
            <View key={cert.id} style={styles.certCard}>
              {cert.image_url ? (
                <Image source={{ uri: cert.image_url }} style={styles.certIconImage} />
              ) : (
                <View style={styles.certIcon}>
                  <Ionicons name="ribbon-outline" size={24} color="#1D3979" />
                </View>
              )}
              
              <View style={styles.certInfo}>
                <Text style={styles.certTitle}>{cert.title}</Text>
                <Text style={styles.certDate}>Uploaded: {cert.date}</Text>
              </View>
              <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete(cert.id, cert.title)}>
                <Ionicons name="trash-outline" size={20} color="#BF0F46" />
              </TouchableOpacity>
            </View>
          ))
        )}

        <View style={{ height: 50 }} />
      </ScrollView>

      <Modal visible={isModalVisible} transparent={true} animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Name Certificate</Text>
            <Text style={styles.modalSubtitle}>What name would you like your clients to see for this certificate?</Text>
            
            <TextInput 
              style={styles.modalInput} 
              placeholder="e.g. Certified Nail Technician" 
              value={newCertName} 
              onChangeText={setNewCertName}
              placeholderTextColor="#716C83"
              autoFocus
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setIsModalVisible(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleSaveCertificate}>
                <Text style={styles.saveBtnText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  uploadBox: { backgroundColor: '#F0F4FF', borderWidth: 2, borderColor: '#1D3979', borderStyle: 'dashed', borderRadius: 16, padding: 30, alignItems: 'center', marginBottom: 40 },
  uploadIconCircle: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center', marginBottom: 15, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  uploadTitle: { fontSize: 16, fontWeight: 'bold', color: '#1D3979', marginBottom: 5 },
  uploadSubtitle: { fontSize: 13, color: '#716C83' },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#191919', marginBottom: 15 },
  emptyText: { fontSize: 14, color: '#716C83', fontStyle: 'italic', marginTop: 10 },
  certCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', padding: 16, borderRadius: 12, marginBottom: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 },
  certIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#F9F9F9', justifyContent: 'center', alignItems: 'center', marginRight: 15 },
  certIconImage: { width: 44, height: 44, borderRadius: 22, marginRight: 15 }, 
  certInfo: { flex: 1 },
  certTitle: { fontSize: 16, fontWeight: 'bold', color: '#191919', marginBottom: 4 },
  certDate: { fontSize: 12, color: '#716C83' },
  deleteBtn: { padding: 8 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { backgroundColor: '#fff', borderRadius: 16, padding: 24, width: '100%', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 5 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#191919', marginBottom: 8 },
  modalSubtitle: { fontSize: 14, color: '#716C83', marginBottom: 20 },
  modalInput: { backgroundColor: '#F9F9F9', borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 10, padding: 15, fontSize: 16, color: '#191919', marginBottom: 20 },
  modalButtons: { flexDirection: 'row', justifyContent: 'space-between' },
  cancelBtn: { flex: 1, padding: 15, alignItems: 'center', marginRight: 10, borderRadius: 10, backgroundColor: '#F0F4FF' },
  cancelBtnText: { color: '#1D3979', fontWeight: 'bold', fontSize: 16 },
  saveBtn: { flex: 1, padding: 15, alignItems: 'center', borderRadius: 10, backgroundColor: '#1D3979' },
  saveBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 }
});