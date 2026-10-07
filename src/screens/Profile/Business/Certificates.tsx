import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Image, Modal, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';

// 1. Här är den nya TypeScript-regeln som fixar felet:
type Certificate = {
  id: string;
  title: string;
  date: string;
  uri: string | null;
};

export default function Certificates({ navigation }: any) {
  // 2. Här talar vi om att listan använder <Certificate[]>
  const [certificates, setCertificates] = useState<Certificate[]>([
    { id: '1', title: 'Certified Nail Technician', date: '2023-05-12', uri: null },
    { id: '2', title: 'Hygiene & Safety Course', date: '2024-01-20', uri: null },
  ]);

  const [isModalVisible, setIsModalVisible] = useState(false);
  const [pendingImageUri, setPendingImageUri] = useState<string | null>(null);
  const [newCertName, setNewCertName] = useState('');

  const handleUpload = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    
    if (permissionResult.granted === false) {
      Alert.alert("Tillåtelse krävs", "Appen behöver åtkomst till dina bilder för att ladda upp certifikat.");
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

  const handleSaveCertificate = () => {
    if (!newCertName.trim()) {
      Alert.alert("Namn saknas", "Vänligen ge ditt certifikat ett namn.");
      return;
    }

    const newCert: Certificate = {
      id: Date.now().toString(),
      title: newCertName, 
      date: new Date().toISOString().split('T')[0],
      uri: pendingImageUri
    };
    
    setCertificates([newCert, ...certificates]);
    setIsModalVisible(false); 
    setPendingImageUri(null); 
  };

  const handleDelete = (id: string, title: string) => {
    Alert.alert("Radera", `Är du säker på att du vill ta bort ${title}?`, [
      { text: "Avbryt", style: "cancel" },
      { 
        text: "Radera", 
        style: "destructive",
        onPress: () => setCertificates(certificates.filter(cert => cert.id !== id)) 
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
          Ladda upp bevis på dina utbildningar, licenser och certifikat för att bygga förtroende hos dina kunder.
        </Text>

        <TouchableOpacity style={styles.uploadBox} onPress={handleUpload}>
          <View style={styles.uploadIconCircle}>
            <Ionicons name="cloud-upload-outline" size={32} color="#1D3979" />
          </View>
          <Text style={styles.uploadTitle}>Ladda upp nytt certifikat</Text>
          <Text style={styles.uploadSubtitle}>Tryck här för att välja fil eller ta en bild</Text>
        </TouchableOpacity>

        <Text style={styles.sectionTitle}>Dina sparade certifikat</Text>

        {certificates.map((cert) => (
          <View key={cert.id} style={styles.certCard}>
            {cert.uri ? (
              <Image source={{ uri: cert.uri }} style={styles.certIconImage} />
            ) : (
              <View style={styles.certIcon}>
                <Ionicons name="ribbon-outline" size={24} color="#1D3979" />
              </View>
            )}
            
            <View style={styles.certInfo}>
              <Text style={styles.certTitle}>{cert.title}</Text>
              <Text style={styles.certDate}>Uppladdad: {cert.date}</Text>
            </View>
            <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete(cert.id, cert.title)}>
              <Ionicons name="trash-outline" size={20} color="#BF0F46" />
            </TouchableOpacity>
          </View>
        ))}

        <View style={{ height: 50 }} />
      </ScrollView>

      {/* Modal för att namnge certifikatet */}
      <Modal visible={isModalVisible} transparent={true} animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Namnge Certifikat</Text>
            <Text style={styles.modalSubtitle}>Vad vill du att dina kunder ska se för namn på detta intyg?</Text>
            
            <TextInput 
              style={styles.modalInput} 
              placeholder="T.ex. Kosmetisk Tatuering Diplom" 
              value={newCertName} 
              onChangeText={setNewCertName}
              placeholderTextColor="#716C83"
              autoFocus
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setIsModalVisible(false)}>
                <Text style={styles.cancelBtnText}>Avbryt</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleSaveCertificate}>
                <Text style={styles.saveBtnText}>Spara</Text>
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
  
  certCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', padding: 16, borderRadius: 12, marginBottom: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 },
  certIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#F9F9F9', justifyContent: 'center', alignItems: 'center', marginRight: 15 },
  certIconImage: { width: 44, height: 44, borderRadius: 22, marginRight: 15 }, 
  certInfo: { flex: 1 },
  certTitle: { fontSize: 16, fontWeight: 'bold', color: '#191919', marginBottom: 4 },
  certDate: { fontSize: 12, color: '#716C83' },
  deleteBtn: { padding: 8 },

  /* Stilar för namngivnings-rutan (Modal) */
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