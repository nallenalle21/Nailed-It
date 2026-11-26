import { TextInput as RNTextInput, TextInputProps, StyleSheet } from 'react-native';
import type { ComponentRef, Ref } from 'react';
import { fonts } from '../theme';

const BOLD = ['bold', '600', '700', '800', '900', 600, 700, 800, 900];

type Props = TextInputProps & { ref?: Ref<ComponentRef<typeof RNTextInput>> };

// Same as React Native's TextInput, but typed text and the placeholder use Glacial Indifference.
// Unlike AppText it does NOT lowercase, so names and emails stay as typed.
export function TextInput({ style, ref, ...props }: Props) {
  const flat = StyleSheet.flatten(style) ?? {};
  const isBold = BOLD.includes(flat.fontWeight as any);

  return (
    <RNTextInput
      ref={ref}
      {...props}
      style={[
        { fontFamily: isBold ? fonts.bold : fonts.regular },
        style,
        // Bold comes from the font file itself, so reset the weight to avoid faux double-bolding
        isBold ? { fontWeight: 'normal' } : null,
      ]}
    />
  );
}
