import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Image,
  Pressable,
  type ScrollViewInstance,
  StyleSheet,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { setStatusBarStyle } from 'expo-status-bar';
import { Text } from '../../components/AppText';
import SparkleStars from '../../components/SparkleStars';
import { colors, fonts } from '../../theme';

const STAR = require('../../../assets/images/star.png');

// How long each slide stays before auto-advancing to the next one.
const SLIDE_MS = 4000;

export type Slide = {
  key: string;
  icon: keyof typeof Ionicons.glyphMap | null; // null → the yellow star
  title: string;
  body: string;
  bg: string;     // slide background
  fg: string;     // text on that background
  accent: string; // badge circle, rings, blobs
  tags: string[]; // little floating chips around the badge
};


const isLight = (c: string) => c === colors.background || c === colors.pink;

function useReduceMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduce).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => sub.remove();
  }, []);
  return reduce;
}

/** Endless 0 → 1 → 0 wave on the native thread (for floating / pulsing). */
function useWave(duration: number, enabled: boolean) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!enabled) { v.setValue(0); return; }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(v, { toValue: 1, duration, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(v, { toValue: 0, duration, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [v, duration, enabled]);
  return v;
}

type Props = {
  /** The slides, in order. Use brand colours: #3194b1, #0b150E, #FA89AB, #8C292E, #faf9f6. */
  slides: Slide[];
  onGetStarted: () => void;
};

/**
 * Animated, auto-playing, swipeable intro shown right after logging in (see FreelancerIntro and
 * CustomerIntro). "get started" leaves it and lands on the Explore tab.
 */
export default function IntroCarousel({ slides, onGetStarted }: Props) {
  const LAST = slides.length - 1;
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();

  const scrollRef = useRef<ScrollViewInstance>(null);
  const scrollX = useRef(new Animated.Value(0)).current;   // JS driver: drives colours
  const progress = useRef(new Animated.Value(0)).current;  // current slide's progress bar
  const mount = useRef(new Animated.Value(0)).current;     // page entrance
  const [index, setIndex] = useState(0);
  const [cycle, setCycle] = useState(0); // bumps to restart the timer after a drag

  // Colours follow the swipe position, so they blend smoothly between slides.
  const range = slides.map((_, i) => i * width);
  const bg = scrollX.interpolate({ inputRange: range, outputRange: slides.map(s => s.bg), extrapolate: 'clamp' });
  const fg = scrollX.interpolate({ inputRange: range, outputRange: slides.map(s => s.fg), extrapolate: 'clamp' });
  const accent = scrollX.interpolate({ inputRange: range, outputRange: slides.map(s => s.accent), extrapolate: 'clamp' });

  useEffect(() => {
    Animated.timing(mount, { toValue: 1, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [mount]);

  // Light/dark clock & battery icons to match the slide; back to dark when leaving.
  useEffect(() => {
    setStatusBarStyle(isLight(slides[index].bg) ? 'dark' : 'light');
  }, [index]);
  useEffect(() => () => setStatusBarStyle('dark'), []);

  const goTo = (i: number) => {
    setIndex(i);
    scrollRef.current?.scrollTo({ x: i * width, animated: true });
  };

  // Auto-advance: fill the progress bar, then move on. Stops on the last slide.
  useEffect(() => {
    progress.setValue(0);
    const anim = Animated.timing(progress, { toValue: 1, duration: SLIDE_MS, easing: Easing.linear, useNativeDriver: false });
    anim.start(({ finished }) => {
      if (finished && index < LAST) goTo(index + 1);
    });
    return () => anim.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, cycle, width]);

  const onScroll = Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], { useNativeDriver: false });
  const onSwipeEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.max(0, Math.min(LAST, Math.round(e.nativeEvent.contentOffset.x / width)));
    if (i === index) setCycle(c => c + 1);
    else setIndex(i);
  };

  // "get started" breathes once the last slide is reached.
  const pulse = useWave(700, index === LAST && !reduceMotion);
  const buttonScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.05] });
  const buttonIn = mount.interpolate({ inputRange: [0, 1], outputRange: [40, 0] });
  const headerIn = mount.interpolate({ inputRange: [0, 1], outputRange: [-20, 0] });

  return (
    <Animated.View style={[styles.container, { backgroundColor: bg }]}>
      <Blobs accent={accent} enabled={!reduceMotion} width={width} />
      <SparkleStars />

      {/* Header: wordmark + story-style progress bars */}
      <Animated.View style={[styles.header, { paddingTop: insets.top + 12, opacity: mount, transform: [{ translateY: headerIn }] }]}>
        <View style={styles.wordmarkRow}>
          <Animated.Text style={[styles.wordmark, { color: fg }]}>nailed it</Animated.Text>
          <Image source={STAR} style={styles.wordmarkStar} />
        </View>
        <View style={styles.bars}>
          {slides.map((s, i) => (
            <Pressable key={s.key} style={styles.barHit} onPress={() => goTo(i)} accessibilityLabel={`go to ${s.title}`}>
              <Animated.View style={[styles.barTrack, { backgroundColor: fg }]} />
              <Animated.View
                style={[styles.barFill, {
                  backgroundColor: fg,
                  width: i < index ? '100%' : i > index ? '0%'
                    : progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
                }]}
              />
            </Pressable>
          ))}
        </View>
      </Animated.View>

      <Animated.ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        bounces={false}
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={onScroll}
        onScrollBeginDrag={() => progress.stopAnimation()}
        onMomentumScrollEnd={onSwipeEnd}
        style={{ opacity: mount }}
      >
        {slides.map((slide, i) => (
          <SlideView
            key={slide.key}
            slide={slide}
            index={i}
            width={width}
            scrollX={scrollX}
            active={i === index}
            reduceMotion={reduceMotion}
          />
        ))}
      </Animated.ScrollView>

      {/* Footer */}
      <Animated.View style={[styles.footer, { paddingBottom: insets.bottom + 20, opacity: mount, transform: [{ translateY: buttonIn }] }]}>
        <Animated.View style={{ transform: [{ scale: buttonScale }] }}>
          <Pressable onPress={onGetStarted} accessibilityRole="button" style={({ pressed }) => pressed && { opacity: 0.85 }}>
            <Animated.View style={[styles.button, { backgroundColor: fg }]}>
              <Animated.Text style={[styles.buttonText, { color: bg }]}>get started</Animated.Text>
              <Animated.Text style={[styles.buttonArrow, { color: bg }]}>→</Animated.Text>
            </Animated.View>
          </Pressable>
        </Animated.View>
      </Animated.View>
    </Animated.View>
  );
}

/** Two big soft circles drifting behind everything, tinted with the slide's accent. */
function Blobs({ accent, enabled, width }: { accent: Animated.AnimatedInterpolation<string>; enabled: boolean; width: number }) {
  const a = useWave(5200, enabled);
  const b = useWave(6800, enabled);
  const size = width * 0.95;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Animated.View style={{
        position: 'absolute', top: -size * 0.35, right: -size * 0.45,
        transform: [
          { translateX: a.interpolate({ inputRange: [0, 1], outputRange: [0, -40] }) },
          { translateY: a.interpolate({ inputRange: [0, 1], outputRange: [0, 30] }) },
        ],
      }}>
        <Animated.View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: accent, opacity: 0.22 }} />
      </Animated.View>
      <Animated.View style={{
        position: 'absolute', bottom: -size * 0.4, left: -size * 0.5,
        transform: [
          { translateX: b.interpolate({ inputRange: [0, 1], outputRange: [0, 50] }) },
          { translateY: b.interpolate({ inputRange: [0, 1], outputRange: [0, -30] }) },
        ],
      }}>
        <Animated.View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: accent, opacity: 0.16 }} />
      </Animated.View>
    </View>
  );
}

type SlideProps = {
  slide: Slide;
  index: number;
  width: number;
  scrollX: Animated.Value;
  active: boolean;
  reduceMotion: boolean;
};

function SlideView({ slide, index, width, scrollX, active, reduceMotion }: SlideProps) {
  // Badge + chips pop in each time the slide becomes active.
  const enter = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;
  const tagsIn = useRef(slide.tags.map(() => new Animated.Value(reduceMotion ? 1 : 0))).current;
  const animate = active && !reduceMotion;
  const ring = useWave(1400, animate);
  const float = useWave(1800, animate);
  const orbit = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduceMotion) {
      enter.setValue(1);
      tagsIn.forEach(t => t.setValue(1));
      return;
    }
    if (!active) {
      enter.setValue(0);
      tagsIn.forEach(t => t.setValue(0));
      return;
    }
    Animated.parallel([
      Animated.spring(enter, { toValue: 1, friction: 5, tension: 60, useNativeDriver: true }),
      Animated.stagger(160, tagsIn.map(t =>
        Animated.spring(t, { toValue: 1, friction: 6, tension: 80, delay: 250, useNativeDriver: true }),
      )),
    ]).start();
  }, [active, reduceMotion, enter, tagsIn]);

  useEffect(() => {
    if (!animate) return;
    orbit.setValue(0);
    const loop = Animated.loop(Animated.timing(orbit, { toValue: 1, duration: 6000, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [animate, orbit]);

  // Text slides with a little parallax and fades as you swipe.
  const around = [(index - 1) * width, index * width, (index + 1) * width];
  const textX = scrollX.interpolate({ inputRange: around, outputRange: [width * 0.35, 0, -width * 0.35], extrapolate: 'clamp' });
  const textOpacity = scrollX.interpolate({ inputRange: around, outputRange: [0, 1, 0], extrapolate: 'clamp' });

  const BADGE = Math.min(150, width * 0.38);
  const badgeScale = enter.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] });
  const badgeRotate = enter.interpolate({ inputRange: [0, 1], outputRange: ['-25deg', '0deg'] });
  const ringScale = ring.interpolate({ inputRange: [0, 1], outputRange: [1, 1.35] });
  const ringOpacity = ring.interpolate({ inputRange: [0, 1], outputRange: [0.6, 0] });
  const spin = orbit.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const counterSpin = orbit.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-360deg'] });
  const floatY = float.interpolate({ inputRange: [0, 1], outputRange: [-6, 6] });

  // Chip positions around the badge.
  const TAG_SPOTS = [
    { top: '12%', left: '6%' },
    { top: '40%', right: '4%' },
    { bottom: '10%', left: '12%' },
  ] as const;

  return (
    <View style={[styles.slide, { width }]}>
      <View style={styles.stage}>
        {/* pulsing ring */}
        <Animated.View style={[styles.ring, {
          width: BADGE, height: BADGE, borderRadius: BADGE / 2, borderColor: slide.accent,
          opacity: ringOpacity, transform: [{ scale: ringScale }],
        }]} />

        {/* orbiting star */}
        <Animated.View style={[styles.orbit, { width: BADGE * 1.55, height: BADGE * 1.55, opacity: enter, transform: [{ rotate: spin }] }]}>
          <Animated.Image source={STAR} style={[styles.orbitStar, { transform: [{ rotate: counterSpin }] }]} />
        </Animated.View>

        {/* badge */}
        <Animated.View style={{ transform: [{ translateY: floatY }, { scale: badgeScale }, { rotate: badgeRotate }], opacity: enter }}>
          <View style={[styles.badge, { width: BADGE, height: BADGE, borderRadius: BADGE / 2, backgroundColor: slide.accent }]}>
            {slide.icon
              ? <Ionicons name={slide.icon} size={BADGE * 0.42} color={slide.bg} />
              : <Image source={STAR} style={{ width: BADGE * 0.55, height: BADGE * 0.55 }} />}
          </View>
        </Animated.View>

        {/* floating chips */}
        {slide.tags.map((tag, i) => {
          const t = tagsIn[i];
          const drift = float.interpolate({ inputRange: [0, 1], outputRange: i % 2 ? [5, -5] : [-4, 4] });
          return (
            <Animated.View
              key={tag}
              style={[styles.tag, TAG_SPOTS[i % TAG_SPOTS.length], {
                backgroundColor: slide.fg,
                opacity: t,
                transform: [
                  { translateY: drift },
                  { scale: t.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) },
                  { translateX: t.interpolate({ inputRange: [0, 1], outputRange: [i === 1 ? 30 : -30, 0] }) },
                ],
              }]}
            >
              <View style={[styles.tagDot, { backgroundColor: slide.accent }]} />
              <Text style={[styles.tagText, { color: slide.bg }]}>{tag}</Text>
            </Animated.View>
          );
        })}
      </View>

      <Animated.View style={[styles.copy, { opacity: textOpacity, transform: [{ translateX: textX }] }]}>
        <Text style={[styles.title, { color: slide.fg }]} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.7}>
          {slide.title}
        </Text>
        <Text style={[styles.body, { color: slide.fg }]}>{slide.body}</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, overflow: 'hidden' },

  header: { paddingHorizontal: 24 },
  wordmarkRow: { flexDirection: 'row', alignSelf: 'flex-start', paddingRight: 14 },
  wordmark: { fontFamily: fonts.title, fontSize: 16, textTransform: 'lowercase' },
  wordmarkStar: { position: 'absolute', right: -2, top: -8, width: 14, height: 14 },
  bars: { flexDirection: 'row', gap: 6, marginTop: 16 },
  barHit: { flex: 1, height: 14, justifyContent: 'center' },
  barTrack: { position: 'absolute', left: 0, right: 0, height: 3, borderRadius: 2, opacity: 0.25 },
  barFill: { height: 3, borderRadius: 2 },

  slide: { flex: 1 },
  stage: { flex: 1, alignItems: 'center', justifyContent: 'center', marginHorizontal: 16 },
  ring: { position: 'absolute', borderWidth: 2 },
  orbit: { position: 'absolute', alignItems: 'center' },
  orbitStar: { width: 22, height: 22, marginTop: -11 },
  badge: { alignItems: 'center', justifyContent: 'center' },
  tag: {
    position: 'absolute', flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999,
  },
  tagDot: { width: 7, height: 7, borderRadius: 4 },
  tagText: { fontSize: 13, fontWeight: 'bold' },

  copy: { paddingHorizontal: 28, paddingBottom: 12 },
  title: { fontFamily: fonts.title, fontSize: 28, lineHeight: 34, marginBottom: 12 },
  body: { fontSize: 16, lineHeight: 23, opacity: 0.9 },

  footer: { paddingHorizontal: 24, paddingTop: 12 },
  button: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    paddingVertical: 18, borderRadius: 999,
  },
  buttonText: { fontFamily: fonts.title, fontSize: 16, textTransform: 'lowercase' },
  buttonArrow: { fontFamily: fonts.regular, fontSize: 20 },
});
