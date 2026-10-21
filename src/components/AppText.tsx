import { Text as RNText, TextProps, StyleSheet, Platform } from 'react-native';
import { colors, fonts } from '../theme';

const BOLD = ['bold', '600', '700', '800', '900', 600, 700, 800, 900];

export function Text({ style, ...props }: TextProps) {
  const flat = StyleSheet.flatten(style) ?? {};
  const isBold = BOLD.includes(flat.fontWeight as any);

  return (
    <RNText
      {...props}
      style={[
        {
          fontFamily: isBold ? fonts.bold : fonts.regular,
          textTransform: 'lowercase',
          color: colors.text,
        },
        style,
        // iOS picks bold from the font name, so reset the weight to avoid double-bolding
        isBold && Platform.OS === 'ios' ? { fontWeight: 'normal' } : null,
      ]}
    />
  );
}