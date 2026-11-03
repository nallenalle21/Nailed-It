import React, { useState, useEffect } from 'react';
import { RefreshStar, useStarRefresh } from '../../../components/SparkleStars';
import StarredTitle from '../../../components/StarredTitle';
import { colors, fonts } from '../../../theme';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Image, Modal, TextInput, ActivityIndicator, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
// Adjust the path below if your supabase.ts is located elsewhere:
import { supabase } from '../../../services/supabase';

type Certificate = {
  id: string;
  title: string;
  date: string;
  image_url: string | null;
};

export default function Certificates({ navigation }: any) {
  // Pull down to refresh: spinning star instead of the system spinner.
  const pull = useStarRefresh(() => fetchCertificates());
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
          <Ionicons name="arrow-back" size={24} color={colors.ink} />
        </TouchableOpacity>
        <StarredTitle style={styles.headerTitle}>Certificates</StarredTitle>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView refreshControl={<RefreshControl {...pull.control} />} style={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionDescription}>
          Upload proof of your education, licenses, and certificates to build trust with your clients.
        </Text>

        <TouchableOpacity style={styles.uploadBox} onPress={handleUpload}>
          <View style={styles.uploadIconCircle}>
            <Ionicons name="cloud-upload-outline" size={32} color={colors.blue} />
          </View>
          <Text style={styles.uploadTitle}>Upload new certificate</Text>
          <Text style={styles.uploadSubtitle}>Tap here to choose a file or take a photo</Text>
        </TouchableOpacity>

        <Text style={styles.sectionTitle}>Your saved certificates</Text>

        {loading ? (
          <ActivityIndicator size="large" color={colors.blue} style={{ marginTop: 20 }} />
        ) : certificates.length === 0 ? (
          <Text style={styles.emptyText}>No certificates uploaded yet.</Text>
        ) : (
          certificates.map((cert) => (
            <View key={cert.id} style={styles.certCard}>
              {cert.image_url ? (
                <Image source={{ uri: cert.image_url }} style={styles.certIconImage} />
              ) : (
                <View style={styles.certIcon}>
                  <Ionicons name="ribbon-outline" size={24} color={colors.blue} />
                </View>
              )}
              
              <View style={styles.certInfo}>
                <Text style={styles.certTitle}>{cert.title}</Text>
                <Text style={styles.certDate}>Uploaded: {cert.date}</Text>
              </View>
              <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete(cert.id, cert.title)}>
                <Ionicons name="trash-outline" size={20} color={colors.wine} />
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
              placeholderTextColor={colors.inkMuted}
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
  uploadBox: { backgroundColor: colors.blueTint, borderWidth: 2, borderColor: colors.blue, borderStyle: 'dashed', borderRadius: 16, padding: 30, alignItems: 'center', marginBottom: 40 },
  uploadIconCircle: { width: 60, height: 60, borderRadius: 30, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center', marginBottom: 15, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  uploadTitle: { fontSize: 16, color: colors.ink, marginBottom: 5, fontFamily: fonts.title },
  uploadSubtitle: { fontSize: 13, color: colors.inkMuted },
  sectionTitle: { fontSize: 18, color: colors.ink, marginBottom: 15, fontFamily: fonts.title },
  emptyText: { fontSize: 14, color: colors.inkMuted, fontStyle: 'italic', marginTop: 10 },
  certCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.background, padding: 16, borderRadius: 12, marginBottom: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 },
  certIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center', marginRight: 15 },
  certIconImage: { width: 44, height: 44, borderRadius: 22, marginRight: 15 }, 
  certInfo: { flex: 1 },
  certTitle: { fontSize: 16, fontWeight: 'bold', color: colors.ink, marginBottom: 4 },
  certDate: { fontSize: 12, color: colors.inkMuted },
  deleteBtn: { padding: 8 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(11,21,14,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { backgroundColor: colors.background, borderRadius: 16, padding: 24, width: '100%', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 5 },
  modalTitle: { fontSize: 18, color: colors.ink, marginBottom: 8, fontFamily: fonts.title },
  modalSubtitle: { fontSize: 14, color: colors.inkMuted, marginBottom: 20 },
  modalInput: { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.line, borderRadius: 10, padding: 15, fontSize: 16, color: colors.ink, marginBottom: 20 },
  modalButtons: { flexDirection: 'row', justifyContent: 'space-between' },
  cancelBtn: { flex: 1, padding: 15, alignItems: 'center', marginRight: 10, borderRadius: 10, backgroundColor: colors.blueTint },
  cancelBtnText: { color: colors.blue, fontWeight: 'bold', fontSize: 16 },
  saveBtn: { flex: 1, padding: 15, alignItems: 'center', borderRadius: 10, backgroundColor: colors.blue },
  saveBtnText: { color: colors.background, fontWeight: 'bold', fontSize: 16 }
});