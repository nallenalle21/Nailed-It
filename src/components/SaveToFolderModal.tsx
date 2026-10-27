import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useWishlist } from '../context/WishlistContext';

export default function SaveToFolderModal({
  itemId,
  onClose,
}: {
  itemId: string | null;
  onClose: () => void;
}) {
  const { folders, createFolder, toggleItem } = useWishlist();
  const [newName, setNewName] = useState('');

  const close = () => {
    setNewName('');
    onClose();
  };

  const addFolder = () => {
    if (!newName.trim() || !itemId) return;
    const id = createFolder(newName);
    toggleItem(id, itemId);
    close();
  };

  return (
    <Modal visible={itemId !== null} transparent animationType="slide" onRequestClose={close}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={close}>
          <TouchableOpacity activeOpacity={1} style={styles.sheet}>
            <Text style={styles.title}>Save to folder</Text>

            {folders.map((f) => {
              const inFolder = itemId ? f.items.includes(itemId) : false;
              return (
                <TouchableOpacity
                  key={f.id}
                  style={styles.row}
                  onPress={() => itemId && toggleItem(f.id, itemId)}
                >
                  <Ionicons name="folder-outline" size={20} color="#555" />
                  <Text style={[styles.rowText, inFolder && styles.rowActive]}>{f.name}</Text>
                  {inFolder && <Ionicons name="checkmark" size={20} color="tomato" />}
                </TouchableOpacity>
              );
            })}

            <View style={styles.newRow}>
              <TextInput
                style={styles.input}
                placeholder="New folder (e.g. Bridal inspo)"
                value={newName}
                onChangeText={setNewName}
                onSubmitEditing={addFolder}
                returnKeyType="done"
              />
              <TouchableOpacity
                style={[styles.addBtn, !newName.trim() && { opacity: 0.4 }]}
                onPress={addFolder}
                disabled={!newName.trim()}
              >
                <Ionicons name="add" size={22} color="#fff" />
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.done} onPress={close}>
              <Text style={styles.doneText}>Done</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 32,
  },
  title: { fontSize: 18, fontWeight: '700', marginBottom: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ddd',
  },
  rowText: { flex: 1, fontSize: 16 },
  rowActive: { color: 'tomato', fontWeight: '600' },
  newRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16 },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 10,
    fontSize: 16,
  },
  addBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'tomato',
    alignItems: 'center',
    justifyContent: 'center',
  },
  done: {
    marginTop: 16,
    backgroundColor: '#f2f2f2',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  doneText: { fontSize: 16, fontWeight: '600' },
});