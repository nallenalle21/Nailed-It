import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo, Animated, Easing, Image, StyleSheet, TouchableOpacity, View,
  useWindowDimensions, type ImageSourcePropType,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '../AppText';
import { colors, fonts } from '../../theme';

// First-run intro (shown once, on a fresh install): the logo and catchphrase, then one line
// at a time is typed out while photo "stickers" pop in around it. Ends with two buttons.
// Positions are designed on a 390 × 844 screen and scaled to the real one.

const LOGO = require('../../../assets/images/logo-n.png');
const STAR = require('../../../assets/images/star.png');
const PHOTO = {
  p01: require('../../../assets/images/welcome/nails-01.jpg'),
  p03: require('../../../assets/images/welcome/nails-03.jpg'),
  p04: require('../../../assets/images/welcome/nails-04.jpg'),
  p05: require('../../../assets/images/welcome/nails-05.jpg'),
  p06: require('../../../assets/images/welcome/nails-06.jpg'),
  p07: require('../../../assets/images/welcome/nails-07.jpg'),
  p09: require('../../../assets/images/welcome/nails-09.jpg'),
  p10: require('../../../assets/images/welcome/nails-10.jpg'),
};

const LINES = [
  'tell us your vibe',
  '…or what’s so not you',
  'we’ve got just the nail tech for you.',
  'your moodboard, but you can literally book the creator.',
];

const LOGO_MS = 2800; // how long the logo shows before the story starts
const TYPE_MS = 45;   // per letter
const HOLD_MS = 1500; // pause after each finished line
const DESIGN_W = 390;
const DESIGN_H = 844;

type Kind = 'photo' | 'star' | 'pill' | 'tech' | 'booked';
type StickerDef = {
  kind: Kind; x: number; y: number; r: number; beat: number;
  w?: number; h?: number; src?: ImageSourcePropType; text?: string; bg?: string; fg?: string;
};

// beat = which line the sticker appears on (they stay once shown).
const STICKERS: StickerDef[] = [
  { kind: 'photo', src: PHOTO.p04, x: 16, y: 70, w: 128, h: 128, r: -8, beat: 0 },
  { kind: 'photo', src: PHOTO.p01, x: 236, y: 96, w: 118, h: 134, r: 7, beat: 0 },
  { kind: 'star', x: 320, y: 262, w: 40, r: 0, beat: 0 },
  { kind: 'photo', src: PHOTO.p05, x: 22, y: 500, w: 136, h: 150, r: 6, beat: 0 },
  { kind: 'photo', src: PHOTO.p03, x: 140, y: 168, w: 104, h: 120, r: -3, beat: 1 },
  { kind: 'photo', src: PHOTO.p07, x: 214, y: 520, w: 150, h: 164, r: -6, beat: 1 },
  { kind: 'pill', text: 'need this.', x: 30, y: 672, r: -5, beat: 1, bg: colors.pink, fg: colors.ink },
  { kind: 'tech', x: 20, y: 262, r: -3, beat: 2 },
  { kind: 'photo', src: PHOTO.p10, x: 262, y: 214, w: 96, h: 108, r: 5, beat: 2 },
  { kind: 'photo', src: PHOTO.p06, x: 118, y: 628, w: 128, h: 146, r: 4, beat: 2 },
  { kind: 'star', x: 58, y: 470, w: 28, r: 0, beat: 2 },
  { kind: 'photo', src: PHOTO.p09, x: 264, y: 668, w: 112, h: 128, r: -4, beat: 3 },
  { kind: 'pill', text: 'obsessed.', x: 238, y: 494, r: 6, beat: 3, bg: colors.background, fg: colors.ink },
  { kind: 'booked', x: 150, y: 596, r: -3, beat: 3 },
  { kind: 'pill', text: 'need these for saturday', x: 150, y: 42, r: -4, beat: 3, bg: colors.pink, fg: colors.ink },
];

const LIGHT_PINK = '#fad2e1';

type Props = {
  onFindVibe: () => void;
  onHaveAccount: () => void;
  onSkip: () => void;
};

export default function OnboardingIntro({ onFindVibe, onHaveAccount, onSkip }: Props) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const sx = width / DESIGN_W;
  const sy = height / DESIGN_H;
  const s = Math.min(sx, sy);

  const [phase, setPhase] = useState<'logo' | 'story'>('logo');
  const [beat, setBeat] = useState(0);
  const [chars, setChars] = useState(0);
  const [done, setDone] = useState(false);
  const [caretOn, setCaretOn] = useState(true);
  const [reduceMotion, setReduceMotion] = useState(false);
  const logo = useRef(new Animated.Value(0)).current; // 0 hidden → 1 shown → 2 gone
  const cta = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => sub.remove();
  }, []);

  // Logo in, hold, logo out → story.
  useEffect(() => {
    const frame = requestAnimationFrame(() =>
      Animated.timing(logo, { toValue: 1, duration: 500, easing: Easing.out(Easing.quad), useNativeDriver: true }).start());
    const timer = setTimeout(() => {
      Animated.timing(logo, { toValue: 2, duration: 450, easing: Easing.in(Easing.quad), useNativeDriver: true }).start();
      setPhase('story');
    }, LOGO_MS);
    return () => { cancelAnimationFrame(frame); clearTimeout(timer); };
  }, [logo]);

  // Typing: one letter at a time, pause, next line.
  useEffect(() => {
    if (phase !== 'story' || done) return;
    const line = LINES[beat];
    let timer: ReturnType<typeof setTimeout>;
    if (chars < line.length) {
      timer = setTimeout(() => setChars(reduceMotion ? line.length : chars + 1), reduceMotion ? 0 : TYPE_MS);
    } else {
      timer = setTimeout(() => {
        if (beat < LINES.length - 1) { setBeat(beat + 1); setChars(0); }
        else setDone(true);
      }, HOLD_MS);
    }
    return () => clearTimeout(timer);
  }, [phase, beat, chars, done, reduceMotion]);

  // Blinking cursor.
  useEffect(() => {
    if (phase !== 'story' || done) return;
    const id = setInterval(() => setCaretOn(on => !on), 450);
    return () => clearInterval(id);
  }, [phase, done]);

  // Buttons slide up at the end.
  useEffect(() => {
    if (!done) return;
    Animated.timing(cta, { toValue: 1, duration: 400, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  }, [done, cta]);

  const logoOpacity = logo.interpolate({ inputRange: [0, 1, 2], outputRange: [0, 1, 0] });
  const logoScale = logo.interpolate({ inputRange: [0, 1, 2], outputRange: [0.92, 1, 0.85] });
  const logoW = 230 * s;

  return (
    <View style={styles.container}>
      {/* Logo + catchphrase */}
      <Animated.View pointerEvents="none" style={[styles.logoWrap, { opacity: logoOpacity, transform: [{ scale: logoScale }] }]}>
        <View>
          <Image source={LOGO} style={{ width: logoW, height: logoW * (368 / 700) }} resizeMode="contain" accessibilityLabel="nailed it logo" />
          <Image source={STAR} style={[styles.logoStar, { width: 34 * s, height: 34 * s }]} />
        </View>
        <Text style={[styles.logoTitle, { fontSize: 34 * s }]}>nailed it</Text>
        <Text style={styles.catchphrase}>save the look. book the artist.</Text>
      </Animated.View>

      {/* Stickers */}
      <View pointerEvents="none" style={StyleSheet.absoluteFill} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {STICKERS.map((def, i) => (
          <Sticker
            key={i}
            def={def}
            visible={done || (phase === 'story' && def.beat <= beat)}
            delay={(i % 3) * 80}
            sx={sx}
            sy={sy}
            s={s}
            reduceMotion={reduceMotion}
          />
        ))}
      </View>

      {/* Typed line */}
      <View pointerEvents="none" style={[styles.lineWrap, { top: 340 * sy, height: 130 * sy }]}>
        {phase === 'story' ? (
          <Text style={styles.line} accessibilityLiveRegion="polite">
            {LINES[beat].slice(0, chars)}
            {!done ? <Text style={[styles.caret, { color: caretOn ? colors.yellow : 'transparent' }]}>|</Text> : null}
          </Text>
        ) : null}
      </View>

      {/* Skip */}
      {!done ? (
        <TouchableOpacity style={[styles.skip, { top: insets.top + 8 }]} onPress={onSkip} accessibilityRole="button">
          <Text style={styles.skipText}>skip</Text>
        </TouchableOpacity>
      ) : null}

      {/* Buttons at the end */}
      <Animated.View
        pointerEvents={done ? 'auto' : 'none'}
        style={[styles.cta, {
          bottom: insets.bottom + 20,
          opacity: cta,
          transform: [{ translateY: cta.interpolate({ inputRange: [0, 1], outputRange: [30, 0] }) }],
        }]}
      >
        <TouchableOpacity style={styles.primaryBtn} onPress={onFindVibe} accessibilityRole="button">
          <Text style={styles.primaryBtnText}>find my vibe</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.linkBtn} onPress={onHaveAccount} accessibilityRole="button">
          <Text style={styles.linkText}>i already have an account</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

function Sticker({ def, visible, delay, sx, sy, s, reduceMotion }: {
  def: StickerDef; visible: boolean; delay: number; sx: number; sy: number; s: number; reduceMotion: boolean;
}) {
  const v = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) { v.setValue(0); return; }
    if (reduceMotion) { v.setValue(1); return; }
    const anim = Animated.spring(v, { toValue: 1, friction: 5, tension: 110, delay, useNativeDriver: true });
    // Next frame, so it doesn't stall until the screen is touched.
    const frame = requestAnimationFrame(() => anim.start());
    return () => { cancelAnimationFrame(frame); anim.stop(); };
  }, [visible, reduceMotion, delay, v]);

  const scale = v.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] });
  const position = {
    position: 'absolute' as const,
    left: def.x * sx,
    top: def.y * sy,
    opacity: v,
    transform: [{ rotate: `${def.r}deg` }, { scale }],
  };

  if (def.kind === 'photo' && def.src) {
    return (
      <Animated.View style={[position, styles.photoCard, { width: (def.w ?? 120) * s, height: (def.h ?? 120) * s, padding: 5 * s }]}>
        <Image source={def.src} style={styles.photo} resizeMode="cover" />
      </Animated.View>
    );
  }
  if (def.kind === 'star') {
    return <Animated.Image source={STAR} style={[position, { width: (def.w ?? 30) * s, height: (def.w ?? 30) * s }]} />;
  }
  if (def.kind === 'pill') {
    return (
      <Animated.View style={[position, styles.pill, { backgroundColor: def.bg }]}>
        <Text style={[styles.pillText, { color: def.fg }]}>{def.text}</Text>
      </Animated.View>
    );
  }
  if (def.kind === 'tech') {
    // Example creator chip. Swap in a real creator before launch.
    return (
      <Animated.View style={[position, styles.pill, styles.techChip]}>
        <Image source={PHOTO.p04} style={styles.techAvatar} />
        <View style={{ gap: 2 }}>
          <Text style={styles.techName}>@chrome.by.liv</Text>
          <Text style={styles.techSub}>chrome · almond · södermalm</Text>
        </View>
      </Animated.View>
    );
  }
  return (
    <Animated.View style={[position, styles.pill, styles.booked]}>
      <Ionicons name="checkmark" size={16} color={colors.wine} />
      <Text style={[styles.pillText, { color: colors.ink }]}>booked · sat 14:00</Text>
    </Animated.View>
  );
}

const shadow = {
  shadowColor: '#0E2025', shadowOpacity: 0.35, shadowRadius: 11, shadowOffset: { width: 0, height: 8 }, elevation: 6,
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.blueMuted },

  logoWrap: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', paddingBottom: 40 },
  logoStar: { position: 'absolute', top: -26, right: -18 },
  logoTitle: { fontFamily: fonts.title, color: colors.background, marginTop: 30 },
  catchphrase: { color: colors.background, fontSize: 17, fontWeight: 'bold', marginTop: 12 },

  photoCard: { backgroundColor: '#ffffff', borderRadius: 14, ...shadow },
  photo: { flex: 1, width: '100%', borderRadius: 10 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, ...shadow, shadowOpacity: 0.3 },
  pillText: { fontSize: 13, fontWeight: 'bold' },
  techChip: { backgroundColor: '#ffffff', paddingLeft: 8, gap: 10 },
  techAvatar: { width: 40, height: 40, borderRadius: 20 },
  techName: { fontSize: 13, fontWeight: 'bold', color: colors.ink },
  techSub: { fontSize: 11, color: colors.inkMuted },
  booked: { backgroundColor: LIGHT_PINK, paddingVertical: 9 },

  lineWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30 },
  line: { fontFamily: fonts.title, fontSize: 19, lineHeight: 25, color: colors.background, textAlign: 'center' },
  caret: { fontFamily: fonts.bold, fontSize: 20 },

  skip: { position: 'absolute', right: 16, height: 36, paddingHorizontal: 16, borderRadius: 999, justifyContent: 'center', backgroundColor: 'rgba(250,249,246,0.2)' },
  skipText: { color: colors.background, fontSize: 14, fontWeight: 'bold' },

  cta: { position: 'absolute', left: 24, right: 24, padding: 14, gap: 6, borderRadius: 28, backgroundColor: 'rgba(14,32,37,0.55)' },
  primaryBtn: { height: 56, borderRadius: 999, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
  primaryBtnText: { color: colors.grey, fontSize: 17, fontWeight: 'bold' },
  linkBtn: { height: 44, alignItems: 'center', justifyContent: 'center' },
  linkText: { color: colors.background, fontSize: 15, fontWeight: 'bold', textDecorationLine: 'underline' },
});
