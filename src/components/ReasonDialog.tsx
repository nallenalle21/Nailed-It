import { useState } from 'react';
import { Modal, StyleSheet, TouchableOpacity, View } from 'react-native';
import { TextInput } from './AppTextInput';
import { Text } from './AppText';
import { colors, fonts } from '../theme';

type Props = {
  title: string;
  /** e.g. who and when, under the title */
  subtitle?: string;
  confirmLabel: string;
  placeholder?: string;
  onConfirm: (reason: string) => void;
  onClose: () => void;
};

/**
 * "Are you sure?" with an optional message to the other person (decline, cancel …).
 * Mount it only while open, so the message field starts empty each time.
 */
export default function ReasonDialog({ title, subtitle, confirmLabel, placeholder, onConfirm, onClose }: Props) {
  const [reason, setReason] = useState('');
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          <TextInput
            style={styles.input}
            placeholder={placeholder ?? 'Message to the other person (optional)'}
            placeholderTextColor={colors.inkMuted}
            value={reason}
            onChangeText={setReason}
            multiline
            maxLength={300}
          />
          <View style={styles.buttons}>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.back}>Back</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.confirm} onPress={() => onConfirm(reason)}>
              <Text style={styles.confirmText}>{confirmLabel}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(11,21,14,0.4)', justifyContent: 'center', padding: 24 },
  card: { backgroundColor: colors.background, borderRadius: 14, padding: 20 },
  title: { fontSize: 17, color: colors.ink, fontFamily: fonts.title },
  subtitle: { fontSize: 15, marginTop: 4, color: colors.ink },
  input: { borderWidth: 1, borderColor: colors.line, borderRadius: 8, padding: 10, fontSize: 15, minHeight: 70, marginTop: 12, textAlignVertical: 'top', color: colors.ink },
  buttons: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 20, marginTop: 14 },
  back: { fontSize: 16, color: colors.inkMuted },
  confirm: { backgroundColor: colors.wine, paddingHorizontal: 18, paddingVertical: 8, borderRadius: 8 },
  confirmText: { color: colors.background, fontSize: 16, fontWeight: '600' },
});
