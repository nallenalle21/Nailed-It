import type { ReactNode } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Switch, TouchableOpacity, View, type TextInputProps } from 'react-native';
import { TextInput } from './AppTextInput';
import { Ionicons } from '@expo/vector-icons';
import StarredTitle from './StarredTitle';
import { Text } from './AppText';
import { colors, fonts } from '../theme';

/**
 * Building blocks for the "Edit profile" screens, so they all look alike:
 * a header with back button, scrolling content, and an optional Save button at the bottom.
 */
export function EditScreen({ title, onBack, loading, children, saveLabel = 'Save', onSave, saving, intro }: {
  title: string;
  onBack: () => void;
  loading?: boolean;
  children: ReactNode;
  intro?: string;
  saveLabel?: string;
  onSave?: () => void;
  saving?: boolean;
}) {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn} accessibilityLabel="Back">
          <Ionicons name="arrow-back" size={24} color={colors.ink} />
        </TouchableOpacity>
        <StarredTitle style={styles.headerTitle}>{title}</StarredTitle>
        <View style={{ width: 34 }} />
      </View>
      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} size="large" color={colors.blue} />
      ) : (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {intro ? <Text style={styles.intro}>{intro}</Text> : null}
            {children}
          </ScrollView>
          {onSave && (
            <View style={styles.footer}>
              <TouchableOpacity style={[styles.save, saving && { opacity: 0.6 }]} onPress={onSave} disabled={saving}>
                {saving ? <ActivityIndicator color={colors.wine} /> : <Text style={styles.saveText}>{saveLabel}</Text>}
              </TouchableOpacity>
            </View>
          )}
        </KeyboardAvoidingView>
      )}
    </View>
  );
}

export function Card({ title, note, children }: { title?: string; note?: string; children: ReactNode }) {
  return (
    <View style={styles.card}>
      {title ? <Text style={styles.cardTitle}>{title}</Text> : null}
      {note ? <Text style={styles.cardNote}>{note}</Text> : null}
      {children}
    </View>
  );
}

/** A row you tick (checkbox) or pick (radio). */
export function OptionRow({ label, hint, selected, onPress, radio }: { label: string; hint?: string; selected: boolean; onPress: () => void; radio?: boolean }) {
  const icon = radio ? (selected ? 'radio-button-on' : 'radio-button-off') : (selected ? 'checkbox' : 'square-outline');
  return (
    <TouchableOpacity style={styles.option} onPress={onPress} accessibilityRole={radio ? 'radio' : 'checkbox'} accessibilityState={{ checked: selected }}>
      <Ionicons name={icon} size={22} color={selected ? colors.wine : colors.ink} />
      <View style={{ flex: 1 }}>
        <Text style={styles.optionText}>{label}</Text>
        {hint ? <Text style={styles.optionHint}>{hint}</Text> : null}
      </View>
    </TouchableOpacity>
  );
}

export function ToggleRow({ label, hint, value, onChange, disabled }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <View style={styles.toggle}>
      <View style={{ flex: 1 }}>
        <Text style={styles.optionText}>{label}</Text>
        {hint ? <Text style={styles.optionHint}>{hint}</Text> : null}
      </View>
      <Switch value={value} onValueChange={onChange} disabled={disabled} trackColor={{ false: colors.line, true: colors.blue }} />
    </View>
  );
}

export function Field({ label, hint, ...input }: { label: string; hint?: string } & TextInputProps) {
  return (
    <View style={{ marginTop: 12 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput placeholderTextColor={colors.inkMuted} {...input} style={[styles.input, input.multiline && styles.multiline, input.style]} />
      {hint ? <Text style={styles.optionHint}>{hint}</Text> : null}
    </View>
  );
}

/** Small pill choices (multi- or single-select). */
export function Chips<T extends string | number>({ options, selected, onToggle, label }: {
  options: T[];
  selected: T[];
  onToggle: (value: T) => void;
  label?: (value: T) => string;
}) {
  return (
    <View style={styles.chips}>
      {options.map((o) => {
        const on = selected.includes(o);
        return (
          <TouchableOpacity key={String(o)} style={[styles.chip, on && styles.chipOn]} onPress={() => onToggle(o)} accessibilityState={{ selected: on }}>
            <Text style={[styles.chipText, on && styles.chipTextOn]}>{label ? label(o) : String(o)}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export const editErrorMessage = (e: unknown) =>
  e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String((e as any).message) : String(e);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 60, marginBottom: 6, paddingHorizontal: 20 },
  backBtn: { padding: 5 },
  headerTitle: { fontSize: 22, color: colors.ink, fontFamily: fonts.title },
  content: { paddingHorizontal: 20, paddingBottom: 32 },
  intro: { fontSize: 14, color: colors.inkMuted, marginTop: 6, marginBottom: 4, lineHeight: 20 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginTop: 14, borderWidth: 1, borderColor: colors.line },
  cardTitle: { fontSize: 15, fontFamily: fonts.title, color: colors.ink },
  cardNote: { fontSize: 12, color: colors.inkMuted, marginTop: 3, marginBottom: 4 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11 },
  optionText: { fontSize: 15, color: colors.ink },
  optionHint: { fontSize: 12, color: colors.inkMuted, marginTop: 3 },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  fieldLabel: { fontSize: 13, fontWeight: '700', color: colors.ink, marginBottom: 6 },
  input: { borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 12, fontSize: 15, color: colors.ink, backgroundColor: colors.background },
  multiline: { minHeight: 90, textAlignVertical: 'top' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.background },
  chipOn: { backgroundColor: colors.pink, borderColor: colors.pink },
  chipText: { fontSize: 13, color: colors.ink, fontWeight: '600' },
  chipTextOn: { color: colors.wine },
  footer: { padding: 20, paddingTop: 8 },
  save: { backgroundColor: colors.pink, borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  saveText: { color: colors.wine, fontSize: 16, fontWeight: '700' },
});
