import { useRef, type ReactNode } from 'react';
import { Animated, StyleSheet, View, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { Text } from './AppText';
import { colors } from '../theme';

// Width of the symbol area on each side.
const ACTION_WIDTH = 96;

type Props = {
  children: ReactNode;
  /** Called when the row was swiped far enough (either direction). */
  onSwiped: () => void;
  /** Shown behind the row while swiping: "Archive" (default) or "Unarchive". */
  label?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  enabled?: boolean;
  /** Override the outer look (e.g. no gap/rounding for list rows). */
  wrapStyle?: StyleProp<ViewStyle>;
};

/**
 * Swipe a row sideways to archive it, like in email apps: either direction works. The symbol
 * shows on the side you uncover; once you've swiped far enough the background turns wine,
 * and letting go archives the row. Not far enough? It slides back. Scrolling works as usual.
 */
export default function SwipeToArchive({ children, onSwiped, label = 'Archive', icon = 'archive-outline', enabled = true, wrapStyle }: Props) {
  const { width } = useWindowDimensions();
  const threshold = width * 0.35;
  const x = useRef(new Animated.Value(0)).current;
  const onSwipedRef = useRef(onSwiped);
  onSwipedRef.current = onSwiped;

  const springBack = () => Animated.spring(x, { toValue: 0, bounciness: 0, speed: 20, useNativeDriver: true }).start();

  // Native swipe tracking: starts from any spot on the card (text, buttons, anywhere), at any
  // speed, also after pressing and holding. Moving mostly up/down hands over to scrolling instead.
  const pan = Gesture.Pan()
    .runOnJS(true)
    .enabled(enabled)
    .activeOffsetX([-10, 10])
    .failOffsetY([-14, 14])
    .onUpdate((e) => x.setValue(e.translationX))
    .onEnd((e) => {
      const far = Math.abs(e.translationX) > threshold || (Math.abs(e.velocityX) > 900 && Math.abs(e.translationX) > 40);
      if (!far) return springBack();
      Animated.timing(x, { toValue: e.translationX > 0 ? width : -width, duration: 160, useNativeDriver: true }).start(() => {
        onSwipedRef.current();
        x.setValue(0);
      });
    })
    .onFinalize((_e, success) => { if (!success) springBack(); });

  // Left symbol shows when swiping right, right symbol when swiping left.
  const showLeft = x.interpolate({ inputRange: [0, 40], outputRange: [0, 1], extrapolate: 'clamp' });
  const showRight = x.interpolate({ inputRange: [-40, 0], outputRange: [1, 0], extrapolate: 'clamp' });
  // Far enough: wine background (the symbol turns light so it stays visible).
  const ready = x.interpolate({
    inputRange: [-threshold, -threshold + 1, threshold - 1, threshold],
    outputRange: [1, 0, 0, 1],
    extrapolate: 'clamp',
  });
  const notReady = Animated.subtract(1, ready);

  const symbol = (tint: string) => (
    <>
      <Ionicons name={icon} size={24} color={tint} />
      <Text style={[styles.actionText, { color: tint }]}>{label}</Text>
    </>
  );

  return (
    <View style={[styles.wrap, wrapStyle]}>
      <View style={styles.behind} pointerEvents="none">
        <Animated.View style={[styles.fill, styles.readyFill, { opacity: ready }]} />
        {/* Left side (swiping right) */}
        <Animated.View style={[styles.action, styles.left, { opacity: Animated.multiply(showLeft, notReady) }]}>{symbol(colors.wine)}</Animated.View>
        <Animated.View style={[styles.action, styles.left, { opacity: Animated.multiply(showLeft, ready) }]}>{symbol(colors.background)}</Animated.View>
        {/* Right side (swiping left) */}
        <Animated.View style={[styles.action, styles.right, { opacity: Animated.multiply(showRight, notReady) }]}>{symbol(colors.wine)}</Animated.View>
        <Animated.View style={[styles.action, styles.right, { opacity: Animated.multiply(showRight, ready) }]}>{symbol(colors.background)}</Animated.View>
      </View>
      <GestureDetector gesture={pan}>
        <Animated.View style={[styles.row, { transform: [{ translateX: x }] }]}>
          {children}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'relative', overflow: 'hidden', borderRadius: 12, marginBottom: 8 },
  behind: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: colors.pink },
  fill: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 },
  readyFill: { backgroundColor: colors.wine },
  action: { position: 'absolute', top: 0, bottom: 0, width: ACTION_WIDTH, alignItems: 'center', justifyContent: 'center', gap: 3 },
  left: { left: 0 },
  right: { right: 0 },
  actionText: { fontSize: 12, fontWeight: '700' },
  row: { backgroundColor: colors.background },
});
