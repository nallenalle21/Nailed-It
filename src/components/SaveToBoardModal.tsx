import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, ScrollView, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from './AppText';
import {
  createWishlistBoard, getMembership, getWishlistBoards, setBoardSaved,
  type SaveKind, type WishlistBoard,
} from '../services/wishlist';

type Props = {
  visible: boolean;
  kind: SaveKind;
  targetId: string | null;
  onClose: () => void;
  onChanged?: () => void;
};

const ACCENT = '#a12640';
const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);

/** Shared by Explore, VendorProfile, and Saved. Offers saved/unsaved state per board. */
export default function SaveToBoardModal({ visible, kind, targetId, onClose, onChanged }: Props) {
  const [boards, setBoards] = useState<WishlistBoard[]>([]);
  const [memberIds, setMemberIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');

  const reload = useCallback(async () => {
    if (!targetId) return;
    setLoading(true);
    try {
      const [allBoards, memberships] = await Promise.all([
        getWishlistBoards(), getMembership(kind, targetId),
      ]);
      setBoards(allBoards);
      setMemberIds(memberships);
    } catch (error) {
      Alert.alert('Could not load your boards', errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [kind, targetId]);

  useEffect(() => {
    if (visible && targetId) void reload();
    if (!visible) { setCreating(false); setNewName(''); }
  }, [visible, targetId, reload]);

  const chooseBoard = async (board: WishlistBoard) => {
    if (!targetId || busy) return;
    setBusy(true);
    try {
      const shouldSave = !memberIds.has(board.id);
      await setBoardSaved(board.id, kind, targetId, shouldSave);
      onChanged?.();
      onClose();
    } catch (error) {
      Alert.alert('Could not update favorites', errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const addBoardAndSave = async () => {
    if (!targetId || busy || !newName.trim()) return;
    setBusy(true);
    try {
      const board = await createWishlistBoard(newName);
      await setBoardSaved(board.id, kind, targetId, true);
      onChanged?.();
      onClose();
    } catch (error) {
      Alert.alert('Could not create board', errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View>
              <Text style={styles.heading}>save to a board</Text>
              <Text style={styles.subheading}>
                {kind === 'post' ? 'save this photo' : 'save this creator profile'}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} accessibilityLabel="Close save to board">
              <Ionicons name="close" size={24} color="#231E24" />
            </TouchableOpacity>
          </View>
          {loading ? <ActivityIndicator color={ACCENT} style={{ marginVertical: 30 }} /> : (
            <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
              {boards.map(board => (
                <TouchableOpacity key={board.id} style={styles.boardRow} onPress={() => void chooseBoard(board)} disabled={busy}>
                  <View style={styles.boardIcon}><Ionicons name="albums-outline" size={21} color={ACCENT} /></View>
                  <Text style={styles.boardName}>{board.name}</Text>
                  <Ionicons
                    name={memberIds.has(board.id) ? 'checkmark-circle' : 'ellipse-outline'}
                    size={23} color={memberIds.has(board.id) ? ACCENT : '#BBB3BA'}
                  />
                </TouchableOpacity>
              ))}
              {!creating ? (
                <TouchableOpacity style={styles.newBoard} onPress={() => setCreating(true)}>
                  <Ionicons name="add-circle-outline" size={23} color={ACCENT} />
                  <Text style={styles.newBoardText}>new board</Text>
                </TouchableOpacity>
              ) : (
                <View style={styles.createRow}>
                  <TextInput
                    autoFocus value={newName} onChangeText={setNewName}
                    placeholder="e.g. wedding inspo" placeholderTextColor="#989099"
                    maxLength={60} style={styles.input}
                  />
                  <TouchableOpacity style={styles.createButton} disabled={busy || !newName.trim()} onPress={() => void addBoardAndSave()}>
                    <Text style={styles.createButtonText}>Create & save</Text>
                  </TouchableOpacity>
                </View>
              )}
            </ScrollView>
          )}
          <Text style={styles.help}>Tap an unchecked board to save. Tap a checked board to remove the item from it.</Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(28,21,26,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#FFFCFD', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 22, paddingBottom: 42, maxHeight: '75%' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 15 },
  heading: { fontSize: 24, fontWeight: '800', color: '#241923' },
  subheading: { fontSize: 13, color: '#817581', marginTop: 3 },
  list: { maxHeight: 360 },
  boardRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#EDE4E9', gap: 12 },
  boardIcon: { backgroundColor: '#F4E5EB', borderRadius: 12, width: 42, height: 42, justifyContent: 'center', alignItems: 'center' },
  boardName: { fontSize: 16, fontWeight: '600', flex: 1, color: '#241923' },
  newBoard: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 18 },
  newBoardText: { fontSize: 15, fontWeight: '700', color: ACCENT },
  createRow: { paddingVertical: 15, gap: 12 },
  input: { borderColor: '#DDD1D8', borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, color: '#241923', backgroundColor: '#FFF' },
  createButton: { backgroundColor: ACCENT, padding: 13, borderRadius: 12, alignItems: 'center' },
  createButtonText: { color: '#FFF', fontWeight: '700' },
  help: { color: '#877784', fontSize: 12, lineHeight: 18, marginTop: 12 },
});
