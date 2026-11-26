import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import PageHeader from './PageHeader';
import { colors } from '../theme';

type Props = {
  title: string;
  children: ReactNode;
  /** Lets the last child (e.g. FAQ in Settings) sit at the bottom of the screen. */
  fill?: boolean;
};

/** A page opened from Settings/Profile: back arrow, centred title (same as the main pages), scrolling content. */
export default function SubPage({ title, children, fill }: Props) {
  const navigation = useNavigation();
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <PageHeader
        title={title}
        star
        left={
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back} accessibilityLabel="Back">
            <Ionicons name="arrow-back" size={24} color={colors.ink} />
          </TouchableOpacity>
        }
      />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={[styles.content, fill && { flexGrow: 1 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  back: { padding: 4 },
  content: { paddingHorizontal: 20, paddingBottom: 32 },
});
