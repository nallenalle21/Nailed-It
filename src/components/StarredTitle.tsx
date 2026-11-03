import { Image, StyleSheet, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { Text } from './AppText';
import { colors, fonts } from '../theme';

const STAR = require('../../assets/images/star.png');

type Props = {
  children: string;
  /** Extra text style (size etc.). Font is always HORIZON in #0B150E. */
  style?: StyleProp<TextStyle>;
  /** Wrapper style, e.g. margins. */
  containerStyle?: StyleProp<ViewStyle>;
  /** Hide the little yellow star (default: shown, up and to the right of the title). */
  star?: boolean;
};

/** Page title in HORIZON with our small yellow star; shrinks to fit on one line. */
export default function StarredTitle({ children, style, containerStyle, star = true }: Props) {
  return (
    <View style={[styles.wrap, containerStyle]}>
      <Text style={[styles.title, style]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
        {children}
      </Text>
      {star && <Image source={STAR} style={styles.star} />}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexShrink: 1, paddingRight: 14 },
  title: { fontFamily: fonts.title, color: colors.ink, fontSize: 20 },
  star: { position: 'absolute', right: -2, top: -10, width: 18, height: 18 },
});
