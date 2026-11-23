import { useState } from 'react';
import { Modal, Pressable, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '../AppText';
import { colors } from '../../theme';
import { VIEW_LABELS, type CalendarView } from './types';

const ICONS: Record<CalendarView, keyof typeof Ionicons.glyphMap> = {
  compact: 'grid-outline',
  stacked: 'reorder-four-outline',
  details: 'list-outline',
  day: 'time-outline',
};
const ORDER: CalendarView[] = ['compact', 'stacked', 'details', 'day'];

/** The "View" button top right, with Apple-style choices. */
export default function ViewMenu({ view, onChange }: { view: CalendarView; onChange: (view: CalendarView) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <TouchableOpacity style={styles.button} onPress={() => setOpen(true)} hitSlop={8} accessibilityLabel={`View: ${VIEW_LABELS[view]}`}>
        <Ionicons name={ICONS[view]} size={18} color={colors.ink} />
        <Text style={styles.buttonText}>{VIEW_LABELS[view]}</Text>
        <Ionicons name="chevron-down" size={14} color={colors.ink} />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <View style={styles.menu}>
            <Text style={styles.menuTitle}>View</Text>
            {ORDER.map((v) => (
              <TouchableOpacity
                key={v}
                style={styles.item}
                onPress={() => { onChange(v); setOpen(false); }}
                accessibilityState={{ selected: v === view }}
              >
                <Ionicons name={ICONS[v]} size={18} color={colors.ink} />
                <Text style={styles.itemText}>{VIEW_LABELS[v]}</Text>
                {v === view && <Ionicons name="checkmark" size={18} color={colors.wine} />}
              </TouchableOpacity>
            ))}
            <Text style={styles.tip}>Tip: pinch the month to switch between Compact, Stacked and Details.</Text>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  button: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, borderWidth: 1, borderColor: colors.line },
  buttonText: { fontSize: 13, fontWeight: '600', color: colors.ink },
  backdrop: { flex: 1, backgroundColor: 'rgba(11,21,14,0.15)', alignItems: 'flex-end', paddingTop: 100, paddingRight: 16 },
  menu: { width: 230, backgroundColor: colors.background, borderRadius: 14, paddingVertical: 8, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
  menuTitle: { fontSize: 12, color: colors.inkMuted, paddingHorizontal: 16, paddingVertical: 6, textTransform: 'uppercase' },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 11 },
  itemText: { flex: 1, fontSize: 15, color: colors.ink },
  tip: { fontSize: 11, color: colors.inkMuted, paddingHorizontal: 16, paddingTop: 6, paddingBottom: 4 },
});
