import { useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { Animated, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import type { MaterialTopTabBarProps } from '@react-navigation/material-top-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts } from '../theme';

const BAR_HEIGHT = 62;
const BUBBLE_INSET = 5; // gap between the highlight bubble and the bar's edge

/**
 * Instagram-style floating bottom menu: a rounded bar lifted off the bottom edge with a
 * highlight bubble behind the current tab. Tap an icon, or put a finger on the bar and slide:
 * the bubble follows the finger and the tab under it opens on release.
 * While swiping between pages, the bubble moves along with the swipe.
 * Tabs with tabBarItemStyle { display: 'none' } are left out.
 */
export default function FloatingTabBar({ state, descriptors, navigation, position }: MaterialTopTabBarProps) {
  const insets = useSafeAreaInsets();
  const routes = state.routes.filter(
    (r) => (StyleSheet.flatten(descriptors[r.key].options.tabBarItemStyle) as any)?.display !== 'none',
  );
  const focusedKey = state.routes[state.index].key;
  // A hidden tab (Vendors) is reached from Explore, so keep the first tab highlighted.
  const activeIndex = Math.max(0, routes.findIndex((r) => r.key === focusedKey));

  const [tabWidth, setTabWidth] = useState(0);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null); // tab under the finger while sliding
  const sliding = hoverIndex !== null; // finger on the bar: the bubble follows the finger, not the pages
  const [bubbleX] = useState(() => new Animated.Value(0));
  const [bubbleScale] = useState(() => new Animated.Value(1));
  const barRef = useRef<ComponentRef<typeof View>>(null);
  const [barX, setBarX] = useState(0); // the bar's left edge on screen, for turning finger position into a tab

  const count = routes.length;
  const goTo = (index: number) => {
    const route = routes[index];
    if (!route) return;
    const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
    if (route.key !== focusedKey && !event.defaultPrevented) navigation.navigate(route.name, route.params);
  };
  const springTo = (index: number) =>
    Animated.spring(bubbleX, { toValue: index * tabWidth, useNativeDriver: true, speed: 18, bounciness: 6 }).start();
  const setLifted = (lifted: boolean) =>
    Animated.spring(bubbleScale, { toValue: lifted ? 1.1 : 1, useNativeDriver: true, speed: 20 }).start();
  // Bubble position under the finger, kept inside the bar
  const fingerX = (moveX: number) => Math.min(Math.max(moveX - barX - tabWidth / 2, 0), (count - 1) * tabWidth);

  useEffect(() => {
    if (tabWidth) springTo(activeIndex);
  }, [activeIndex, tabWidth]); // eslint-disable-line react-hooks/exhaustive-deps

  // Rebuilt when the tabs change (never mid-slide: the focused tab only changes on release).
  const pan = useMemo(
    () =>
      PanResponder.create({
        // Taps go to the icons themselves; a sideways slide is taken over by the bar.
        onMoveShouldSetPanResponder: (_, g) => tabWidth > 0 && Math.abs(g.dx) > 6 && Math.abs(g.dx) > Math.abs(g.dy),
        onPanResponderGrant: () => setLifted(true),
        onPanResponderMove: (_, g) => {
          const x = fingerX(g.moveX);
          bubbleX.setValue(x);
          const index = Math.round(x / tabWidth);
          setHoverIndex((prev) => (prev === index ? prev : index));
        },
        onPanResponderRelease: (_, g) => {
          const index = Math.round(fingerX(g.moveX) / tabWidth);
          setLifted(false);
          setHoverIndex(null);
          springTo(index);
          goTo(index);
        },
        onPanResponderTerminate: () => {
          setLifted(false);
          setHoverIndex(null);
          springTo(activeIndex);
        },
      }),
    [tabWidth, barX, count, activeIndex, focusedKey], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const shownIndex = hoverIndex ?? activeIndex;

  return (
    <View style={[styles.wrapper, { paddingBottom: Math.max(insets.bottom - 6, 12) }]}>
      <View
        ref={barRef}
        style={styles.bar}
        onLayout={(e) => {
          setTabWidth((e.nativeEvent.layout.width - BUBBLE_INSET * 2) / routes.length);
          barRef.current?.measureInWindow((x) => setBarX(x + BUBBLE_INSET));
        }}
        {...pan.panHandlers}
      >
        {tabWidth > 0 && (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.bubble,
              {
                width: tabWidth,
                transform: [
                  // Follows the pages while they're swiped; follows the finger while sliding on the bar.
                  { translateX: sliding || !position || routes.length !== state.routes.length ? bubbleX : Animated.multiply(position, tabWidth) },
                  { scale: bubbleScale },
                ],
              },
            ]}
          />
        )}
        {routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const focused = index === shownIndex;
          const color = focused ? colors.ink : colors.inkMuted;
          const label = typeof options.tabBarLabel === 'string' ? options.tabBarLabel : options.title ?? route.name;
          return (
            <Pressable
              key={route.key}
              style={styles.tab}
              onPress={() => goTo(index)}
              onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
              accessibilityRole="tab"
              accessibilityState={{ selected: index === activeIndex }}
              accessibilityLabel={label}
            >
              <View>
                {options.tabBarIcon?.({ focused, color, size: 23 })}
                {/* e.g. the number of unread chats on Chats */}
                {options.tabBarBadge ? <View style={styles.badge} pointerEvents="none">{options.tabBarBadge()}</View> : null}
              </View>
              <Text style={[styles.label, { color }]} numberOfLines={1}>{label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { backgroundColor: colors.background, paddingHorizontal: 14, paddingTop: 6 },
  bar: {
    flexDirection: 'row',
    height: BAR_HEIGHT,
    borderRadius: BAR_HEIGHT / 2,
    paddingHorizontal: BUBBLE_INSET,
    backgroundColor: colors.background,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  bubble: {
    position: 'absolute',
    left: BUBBLE_INSET,
    top: BUBBLE_INSET,
    bottom: BUBBLE_INSET,
    borderRadius: (BAR_HEIGHT - BUBBLE_INSET * 2) / 2,
    backgroundColor: colors.pinkTint,
  },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3 },
  badge: { position: 'absolute', top: -6, right: -12 },
  label: { fontFamily: fonts.title, fontSize: 7 }, // "INSPIRATION" must fit one tab
});
