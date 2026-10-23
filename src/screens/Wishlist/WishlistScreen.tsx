import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator, Alert, Image, Modal, ScrollView, StyleSheet,
  TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '../../components/AppText';
import SaveToBoardModal from '../../components/SaveToBoardModal';
import {
  createWishlistBoard, deleteWishlistBoard, getWishlistSnapshot,
  removeWishlistItem, renameWishlistBoard,
  type WishlistBoard, type WishlistEntry,
} from '../../services/wishlist';

const ACCENT = '#a12640';
const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);

function CreatorAvatar({ entry, size = 88 }: { entry: WishlistEntry; size?: number }) {
  const [failed, setFailed] = useState(false);
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: '#EDDCE4', overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
      {entry.avatarUri && !failed ? (
        <Image source={{ uri: entry.avatarUri }} style={{ width: size, height: size }} onError={() => setFailed(true)} />
      ) : <Text style={{ color: ACCENT, fontSize: size * 0.4, fontWeight: '700' }}>{entry.creatorName.charAt(0).toUpperCase()}</Text>}
    </View>
  );
}

function BoardCover({ entries }: { entries: WishlistEntry[] }) {
  const four = entries.slice(0, 4);
  return (
    <View style={styles.cover}>
      {four.length ? four.map((entry) => (
        <View key={entry.id} style={styles.coverCell}>
          {entry.kind === 'post' && entry.imageUri ? (
            <Image source={{ uri: entry.imageUri }} style={styles.coverPhoto} />
          ) : (
            <CreatorAvatar entry={entry} size={52} />
          )}
        </View>
      )) : (
        <View style={styles.emptyCover}>
          <Ionicons name="images-outline" size={36} color="#C8B0BD" />
          <Text style={styles.emptyCoverText}>your saved finds</Text>
        </View>
      )}
    </View>
  );
}

export default function WishlistScreen({ navigation }: any) {
  const [boards, setBoards] = useState<WishlistBoard[]>([]);
  const [entries, setEntries] = useState<WishlistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [formMode, setFormMode] = useState<'create' | 'rename' | null>(null);
  const [formName, setFormName] = useState('');
  const [formBoard, setFormBoard] = useState<WishlistBoard | null>(null);
  const [busy, setBusy] = useState(false);
  const [previewPost, setPreviewPost] = useState<WishlistEntry | null>(null);
  const [organizeEntry, setOrganizeEntry] = useState<WishlistEntry | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const snapshot = await getWishlistSnapshot();
      setBoards(snapshot.boards);
      setEntries(snapshot.entries);
    } catch (error) {
      Alert.alert('Could not load wishlist', errorMessage(error));
    } finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => {
    void reload();
    return () => {};
  }, [reload]));

  const selectedBoard = boards.find(b => b.id === selectedBoardId) ?? null;
  const boardEntries = selectedBoard ? entries.filter(item => item.boardId === selectedBoard.id) : [];

  const goToVendor = (vendorId: string) => {
    navigation.navigate('Vendors', {
      screen: 'VendorProfile', params: { vendorId },
    });
  };
  const openCreate = () => { setFormMode('create'); setFormName(''); setFormBoard(null); };
  const openRename = (board: WishlistBoard) => {
    setFormMode('rename'); setFormName(board.name); setFormBoard(board);
  };

  const submitForm = async () => {
    if (busy || !formName.trim()) return;
    setBusy(true);
    try {
      if (formMode === 'create') await createWishlistBoard(formName);
      if (formMode === 'rename' && formBoard) await renameWishlistBoard(formBoard, formName);
      setFormMode(null);
      await reload();
    } catch (error) {
      Alert.alert('Could not save board', errorMessage(error));
    } finally { setBusy(false); }
  };

  const confirmDelete = (board: WishlistBoard) => {
    Alert.alert('Delete board?', `Delete "${board.name}" and remove its saved items from this board? The creator photos themselves will not be deleted.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try {
          await deleteWishlistBoard(board);
          if (selectedBoardId === board.id) setSelectedBoardId(null);
          await reload();
        } catch (error) { Alert.alert('Could not delete board', errorMessage(error)); }
      } },
    ]);
  };
  const removeItem = (entry: WishlistEntry) => {
    Alert.alert('Remove saved item?', 'This removes it from this board, not from the creator’s profile.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        try {
          await removeWishlistItem(entry.id, entry.boardId);
          setPreviewPost(null);
          await reload();
        } catch (error) { Alert.alert('Could not remove item', errorMessage(error)); }
      } },
    ]);
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <View style={styles.headerTitleGroup}>
          {selectedBoard && (
            <TouchableOpacity onPress={() => { setSelectedBoardId(null); setEditing(false); }} accessibilityLabel="Back to boards" style={styles.back}>
              <Ionicons name="arrow-back" size={23} color="#151A17" />
            </TouchableOpacity>
          )}
          <Text style={styles.title}>{selectedBoard ? selectedBoard.name : 'my wishlist'}</Text>
        </View>
        <TouchableOpacity style={styles.editButton} onPress={() => setEditing(value => !value)}>
          <Text style={styles.editText}>{editing ? 'done' : 'edit'}</Text>
        </TouchableOpacity>
      </View>
      {selectedBoard ? (
        <Text style={styles.subtitle}>{boardEntries.length} saved {boardEntries.length === 1 ? 'item' : 'items'} · profile icons and inspiration photos</Text>
      ) : (
        <View style={styles.topTools}>
          <Text style={[styles.subtitle, { flex: 1 }]}>organize your favorite photos and creators</Text>
          <TouchableOpacity style={styles.addButton} onPress={openCreate} accessibilityLabel="Create new board">
            <Ionicons name="add" size={18} color="#FFF" />
            <Text style={styles.addText}>new board</Text>
          </TouchableOpacity>
        </View>
      )}
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {loading && <ActivityIndicator size="large" color={ACCENT} style={{ marginTop: 45 }} />}
        {!loading && !selectedBoard && (
          <View style={styles.cards}>
            {boards.map(board => {
              const items = entries.filter(item => item.boardId === board.id);
              return (
                <View key={board.id} style={styles.boardCard}>
                  <TouchableOpacity onPress={() => { setSelectedBoardId(board.id); setEditing(false); }} accessibilityLabel={`Open ${board.name} board`}>
                    <BoardCover entries={items} />
                    <Text style={styles.boardName}>{board.name}</Text>
                    <Text style={styles.count}>{items.length} {items.length === 1 ? 'pin' : 'pins'}</Text>
                  </TouchableOpacity>
                  {editing && board.name.toLowerCase() !== 'faves' && (
                    <View style={styles.boardActions}>
                      <TouchableOpacity style={styles.smallButton} onPress={() => openRename(board)}><Text style={styles.smallButtonText}>rename</Text></TouchableOpacity>
                      <TouchableOpacity style={styles.smallButton} onPress={() => confirmDelete(board)}><Text style={[styles.smallButtonText, { color: ACCENT }]}>delete</Text></TouchableOpacity>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}
        {!loading && selectedBoard && (
          boardEntries.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="heart-outline" size={36} color="#B6A4AF" />
              <Text style={styles.emptyText}>Nothing saved here yet.</Text>
              <Text style={styles.emptyHint}>Long-press photos in Explore or save creators on their public profiles.</Text>
            </View>
          ) : (
            <View style={styles.cards}>
              {boardEntries.map(entry => (
                <View key={entry.id} style={styles.savedCard}>
                  <TouchableOpacity
                    style={styles.savedTile}
                    onPress={() => {
                      if (editing) { removeItem(entry); return; }
                      if (entry.kind === 'vendor') goToVendor(entry.vendorId);
                      else setPreviewPost(entry);
                    }}
                    accessibilityLabel={entry.kind === 'vendor' ? `Open ${entry.creatorName} profile` : 'Expand saved photo'}
                  >
                    {entry.kind === 'post' && entry.imageUri ? (
                      <Image source={{ uri: entry.imageUri }} style={styles.savedImage} />
                    ) : (
                      <View style={styles.profileTile}><CreatorAvatar entry={entry} size={91} /></View>
                    )}
                    {editing && <View style={styles.removeBadge}><Ionicons name="close-circle" size={23} color={ACCENT} /></View>}
                  </TouchableOpacity>
                  <Text style={styles.entryLabel} numberOfLines={1}>{entry.creatorName}</Text>
                  <Text style={styles.entrySub} numberOfLines={1}>{entry.kind === 'vendor' ? 'creator profile' : (entry.caption || 'inspiration photo')}</Text>
                  {!editing && (
                    <TouchableOpacity style={styles.organizeButton} onPress={() => setOrganizeEntry(entry)}>
                      <Ionicons name="albums-outline" size={14} color={ACCENT}/>
                      <Text style={styles.organizeText}>boards</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ))}
            </View>
          )
        )}
      </ScrollView>
      <Modal visible={formMode !== null} transparent animationType="fade" onRequestClose={() => setFormMode(null)}>
        <View style={styles.shade}>
          <View style={styles.dialog}>
            <View style={styles.dialogHeader}>
              <Text style={styles.dialogTitle}>{formMode === 'rename' ? 'rename board' : 'new board'}</Text>
              <TouchableOpacity onPress={() => setFormMode(null)}><Ionicons name="close" size={22} color="#151A17" /></TouchableOpacity>
            </View>
            <TextInput style={styles.input} autoFocus placeholder="e.g. wedding inspo" value={formName} onChangeText={setFormName} maxLength={60}/>
            <TouchableOpacity disabled={busy || !formName.trim()} style={styles.primaryButton} onPress={() => void submitForm()}>
              <Text style={styles.primaryText}>{busy ? 'saving…' : 'save board'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      <Modal visible={previewPost !== null} transparent animationType="fade" onRequestClose={() => setPreviewPost(null)}>
        <View style={styles.shade}>
          <View style={styles.previewDialog}>
            <View style={styles.dialogHeader}>
              <Text style={styles.dialogTitle}>{previewPost?.creatorName}</Text>
              <TouchableOpacity onPress={() => setPreviewPost(null)} accessibilityLabel="Close photo"><Ionicons name="close" size={23} color="#151A17" /></TouchableOpacity>
            </View>
            {previewPost?.imageUri && <Image source={{ uri: previewPost.imageUri }} style={styles.previewImage} resizeMode="contain" />}
            <Text style={styles.previewCaption}>{previewPost?.caption}</Text>
            <View style={styles.previewActions}>
              <TouchableOpacity onPress={() => { const id = previewPost!.vendorId; setPreviewPost(null); goToVendor(id); }} style={styles.action}>
                <Ionicons name="person-outline" size={19} color={ACCENT}/><Text style={styles.actionText}>creator profile</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { const entry = previewPost!; setPreviewPost(null); removeItem(entry); }} style={styles.action}>
                <Ionicons name="trash-outline" size={18} color={ACCENT}/><Text style={styles.actionText}>remove</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      <SaveToBoardModal
        visible={organizeEntry !== null}
        kind={organizeEntry?.kind ?? 'post'}
        targetId={organizeEntry?.targetId ?? null}
        onClose={() => setOrganizeEntry(null)}
        onChanged={() => void reload()}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FAF9F6' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 20, marginBottom: 12, paddingHorizontal: 18 },
  headerTitleGroup: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  back: { padding: 5 },
  title: { fontSize: 28, fontWeight: '800', color: '#151A17', textTransform: 'lowercase', flexShrink: 1 },
  editButton: { borderWidth: 1, borderColor: '#151A17', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  editText: { fontSize: 13, color: '#151A17', textTransform: 'lowercase' },
  subtitle: { fontSize: 12, color: '#726974', marginHorizontal: 18, marginBottom: 16 },
  topTools: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: 18, marginBottom: 18 },
  addButton: { backgroundColor: ACCENT, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 20, flexDirection: 'row', alignItems: 'center', gap: 4 },
  addText: { fontSize: 12, color: '#FFF', fontWeight: '700' },
  content: { paddingHorizontal: 18, paddingBottom: 46 },
  cards: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 14 },
  boardCard: { width: '47.8%' },
  cover: { height: 160, borderRadius: 18, backgroundColor: '#F0ECE5', borderColor: '#E5DFD7', borderWidth: 1, flexDirection: 'row', flexWrap: 'wrap', padding: 3, overflow: 'hidden' },
  coverCell: { width: '50%', height: '50%', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  coverPhoto: { width: '100%', height: '100%' },
  emptyCover: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 7 },
  emptyCoverText: { color: '#8A7682', fontSize: 12 },
  boardName: { color: '#151A17', fontSize: 16, marginTop: 9, fontWeight: '600' },
  count: { color: '#726974', marginTop: 2, fontSize: 12 },
  boardActions: { flexDirection: 'row', gap: 6, marginTop: 7 },
  smallButton: { padding: 7, borderWidth: 1, borderRadius: 10, borderColor: '#E9DCE4' },
  smallButtonText: { color: '#151A17', fontSize: 11, fontWeight: '600' },
  savedCard: { width: '47.8%' },
  savedTile: { width: '100%', height: 168, backgroundColor: '#F0EBF0', borderRadius: 16, overflow: 'hidden' },
  savedImage: { width: '100%', height: '100%' },
  profileTile: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F2E8ED' },
  removeBadge: { position: 'absolute', top: 6, right: 6, backgroundColor: '#FFF', borderRadius: 16 },
  entryLabel: { marginTop: 7, fontSize: 14, fontWeight: '700', color: '#242024' },
  entrySub: { marginTop: 2, fontSize: 12, color: '#807780' },
  organizeButton: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6, paddingVertical: 4 },
  organizeText: { color: ACCENT, fontSize: 12, fontWeight: '600' },
  emptyState: { alignItems: 'center', marginTop: 80, paddingHorizontal: 34, gap: 10 },
  emptyText: { fontSize: 17, fontWeight: '700', color: '#41323D' },
  emptyHint: { fontSize: 13, color: '#827681', textAlign: 'center', lineHeight: 19 },
  shade: { flex: 1, backgroundColor: 'rgba(24,20,22,0.55)', justifyContent: 'center', padding: 20 },
  dialog: { backgroundColor: '#FFF', padding: 19, borderRadius: 18 },
  dialogHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  dialogTitle: { fontSize: 18, fontWeight: '800', color: '#151A17' },
  input: { borderWidth: 1, borderColor: '#E5DFD7', borderRadius: 12, padding: 13, color: '#151A17', marginBottom: 12 },
  primaryButton: { backgroundColor: ACCENT, padding: 14, alignItems: 'center', borderRadius: 12 },
  primaryText: { color: '#FFF', fontWeight: '700' },
  previewDialog: { backgroundColor: '#FFF', padding: 16, borderRadius: 18 },
  previewImage: { width: '100%', height: 305, backgroundColor: '#F8F5F6', borderRadius: 10 },
  previewCaption: { color: '#494148', fontSize: 13, marginTop: 8 },
  previewActions: { marginTop: 14, flexDirection: 'row', justifyContent: 'space-between' },
  action: { flexDirection: 'row', alignItems: 'center', gap: 5, padding: 9 },
  actionText: { color: ACCENT, fontWeight: '700', fontSize: 12 },
});
