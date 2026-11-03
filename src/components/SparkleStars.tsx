import type React from 'react';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from 'react-native';
import { colors } from '../theme';

const STAR = require('../../assets/images/star.png');

// Shooting star: a star with a sparkly tail falling diagonally across the screen, at random times.
const FALL_MIN_WAIT = 4000;
const FALL_MAX_WAIT = 12000;
const FALL_DURATION = 1300;
const TAIL = 7; // sparkles trailing behind the falling star

type Fall = { id: number; from: { x: number; y: number }; to: { x: number; y: number } };

const between = (min: number, max: number) => min + Math.random() * (max - min);
const SPARKS = 6;

type Burst = { id: number; x: number; y: number; size: number };

export type SparkleStarsHandle = {
  /** Pop a star (with sparkles) at a screen position, e.g. where a finger touched. */
  popAt: (pageX: number, pageY: number) => void;
};

/**
 * Decorative layer: shooting stars fall across the screen at random times, and popAt()
 * pops a star with sparkles where a finger touched. Never blocks touches. Pass active={false}
 * to pause it (e.g. when the screen isn't focused). Respects the OS "Reduce Motion" setting.
 */
type SparkleStarsProps = {
  active?: boolean;
  /** Random shooting stars falling across the screen (default on). Tap stars work either way. */
  shootingStars?: boolean;
};

const SparkleStars = forwardRef<SparkleStarsHandle, SparkleStarsProps>(function SparkleStars({ active = true, shootingStars = true }, ref) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const layer = useRef<React.ComponentRef<typeof View>>(null);
  const origin = useRef({ x: 0, y: 0 }); // layer's position on screen, to convert touch coordinates
  const [bursts, setBursts] = useState<Burst[]>([]);
  const [reduceMotion, setReduceMotion] = useState(false);
  const nextId = useRef(0);
  const [falls, setFalls] = useState<Fall[]>([]);

  // Every once in a while: a shooting star, mostly top-right → bottom-left, sometimes mirrored.
  useEffect(() => {
    if (!active || !shootingStars || reduceMotion || !size.width) return;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(() => {
        const { width: w, height: h } = size;
        const leftward = Math.random() < 0.75;
        const startX = between(0.55 * w, 1.05 * w);
        const startY = between(-0.05 * h, 0.3 * h);
        const dx = between(0.6 * w, 1.0 * w);
        const dy = between(0.35 * h, 0.65 * h);
        const from = { x: leftward ? startX : w - startX, y: startY };
        const to = { x: leftward ? from.x - dx : from.x + dx, y: from.y + dy };
        setFalls(current => [...current, { id: nextId.current++, from, to }]);
        schedule();
      }, between(FALL_MIN_WAIT, FALL_MAX_WAIT));
    };
    schedule();
    return () => clearTimeout(timer);
  }, [active, shootingStars, reduceMotion, size]);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => sub.remove();
  }, []);


  useImperativeHandle(ref, () => ({
    popAt: (pageX, pageY) => {
      if (reduceMotion) return;
      const x = pageX - origin.current.x;
      const y = pageY - origin.current.y;
      setBursts(current => [...current, { id: nextId.current++, size: between(24, 38), x, y }]);
    },
  }), [reduceMotion]);

  return (
    <View
      ref={layer}
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      onLayout={e => {
        setSize(e.nativeEvent.layout);
        layer.current?.measureInWindow((x, y) => { origin.current = { x, y }; });
      }}
    >
      {falls.map(f => (
        <ShootingStar key={f.id} fall={f} onDone={() => setFalls(cur => cur.filter(x => x.id !== f.id))} />
      ))}
      {bursts.map(b => (
        <StarBurst key={b.id} burst={b} onDone={() => setBursts(cur => cur.filter(x => x.id !== b.id))} />
      ))}
    </View>
  );
});
export default SparkleStars;

function ShootingStar({ fall, onDone }: { fall: Fall; onDone: () => void }) {
  const progress = useRef(new Animated.Value(0)).current;
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    Animated.timing(progress, { toValue: 1, duration: FALL_DURATION, easing: Easing.in(Easing.quad), useNativeDriver: true })
      .start(() => onDoneRef.current());
  }, [progress]);

  // Position along the path, `lag` behind the head (for the tail sparkles).
  const along = (lag: number) => {
    const input = [0, lag, 1];
    return {
      translateX: progress.interpolate({ inputRange: input, outputRange: [fall.from.x, fall.from.x, fall.from.x + (fall.to.x - fall.from.x) * (1 - lag)] }),
      translateY: progress.interpolate({ inputRange: input, outputRange: [fall.from.y, fall.from.y, fall.from.y + (fall.to.y - fall.from.y) * (1 - lag)] }),
    };
  };
  const head = along(0);
  const headOpacity = progress.interpolate({ inputRange: [0, 0.1, 0.8, 1], outputRange: [0, 1, 1, 0] });
  const spin = progress.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '320deg'] });
  const HEAD = 26;

  return (
    <>
      {Array.from({ length: TAIL }, (_, i) => {
        const lag = (i + 1) * 0.035;
        const pos = along(lag);
        const fade = 1 - (i + 1) / (TAIL + 1);
        return (
          <Animated.View
            key={i}
            style={[styles.spark, {
              width: 5 * fade + 2, height: 5 * fade + 2,
              opacity: progress.interpolate({ inputRange: [0, lag + 0.05, 0.85, 1], outputRange: [0, fade, fade, 0] }),
              transform: [{ translateX: pos.translateX }, { translateY: pos.translateY }, { rotate: '45deg' }],
            }]}
          />
        );
      })}
      <Animated.Image
        source={STAR}
        style={{
          position: 'absolute', left: -HEAD / 2, top: -HEAD / 2, width: HEAD, height: HEAD,
          opacity: headOpacity,
          transform: [{ translateX: head.translateX }, { translateY: head.translateY }, { rotate: spin }],
        }}
      />
    </>
  );
}

// intro=false skips the pop-in and hold: the star starts full size and bursts right away.
function StarBurst({ burst, onDone, intro = true }: { burst: Burst; onDone: () => void; intro?: boolean }) {
  const star = useRef(new Animated.Value(0)).current;   // 0 → 1 pop in, 1 → 2 vanish
  const sparks = useRef(new Animated.Value(0)).current; // 0 → 1 sparkles fly out and fade
  // Random sparkle directions, fixed for this burst.
  const angles = useRef(Array.from({ length: SPARKS }, (_, i) => (i / SPARKS) * Math.PI * 2 + Math.random() * 0.6)).current;
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  // Runs once per burst.
  useEffect(() => {
    if (!intro) star.setValue(1);
    Animated.sequence([
      intro ? Animated.spring(star, { toValue: 1, friction: 4, tension: 90, useNativeDriver: true }) : Animated.delay(0),
      Animated.delay(intro ? 900 : 0),
      Animated.parallel([
        Animated.timing(star, { toValue: 2, duration: 260, easing: Easing.in(Easing.quad), useNativeDriver: true }),
        Animated.timing(sparks, { toValue: 1, duration: 700, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      ]),
    ]).start(() => onDoneRef.current());
  }, [star, sparks, intro]);

  const starScale = star.interpolate({ inputRange: [0, 1, 2], outputRange: [0, 1, 0] });
  const starRotate = star.interpolate({ inputRange: [0, 1, 2], outputRange: ['-30deg', '0deg', '45deg'] });
  const sparkOpacity = sparks.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 1, 0] });
  const reach = burst.size * 1.3;

  return (
    <View style={{ position: 'absolute', left: burst.x, top: burst.y }}>
      {angles.map((angle, i) => (
        <Animated.View
          key={i}
          style={[styles.spark, {
            opacity: sparkOpacity,
            transform: [
              { translateX: sparks.interpolate({ inputRange: [0, 1], outputRange: [0, Math.cos(angle) * reach] }) },
              { translateY: sparks.interpolate({ inputRange: [0, 1], outputRange: [0, Math.sin(angle) * reach] }) },
              { scale: sparks.interpolate({ inputRange: [0, 1], outputRange: [1, 0.3] }) },
              { rotate: '45deg' },
            ],
          }]}
        />
      ))}
      <Animated.Image
        source={STAR}
        style={{
          position: 'absolute',
          width: burst.size,
          height: burst.size,
          left: -burst.size / 2,
          top: -burst.size / 2,
          transform: [{ scale: starScale }, { rotate: starRotate }],
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  // Tiny yellow diamond sparkle
  spark: {
    position: 'absolute',
    width: 5,
    height: 5,
    left: -2.5,
    top: -2.5,
    backgroundColor: colors.yellow,
  },
});

/**
 * Replaces the pull-to-refresh spinner: while `refreshing` a yellow star spins at `y`
 * (centred). When refreshing ends it bursts into sparkles. Pair with a RefreshControl whose
 * own spinner is hidden (see HIDDEN_SPINNER).
 */
export function RefreshStar({ refreshing, y = 60 }: { refreshing: boolean; y?: number }) {
  const [width, setWidth] = useState(0);
  const [bursts, setBursts] = useState<Burst[]>([]);
  // Shown separately from `refreshing` so a very fast reload still gets a full spin first.
  const [spinning, setSpinning] = useState(false);
  const spin = useRef(new Animated.Value(0)).current;
  const appear = useRef(new Animated.Value(0)).current;
  const startedAt = useRef(0);
  const SIZE = 34;
  const MIN_SPIN = 900; // ms: about one full turn before it bursts

  // Start spinning as soon as a refresh begins.
  useEffect(() => {
    if (!refreshing) return;
    startedAt.current = Date.now();
    setSpinning(true);
  }, [refreshing]);

  // Refresh finished: keep spinning until MIN_SPIN has passed, then burst into sparkles.
  useEffect(() => {
    if (refreshing || !spinning) return;
    const wait = Math.max(0, MIN_SPIN - (Date.now() - startedAt.current));
    const timer = setTimeout(() => {
      setSpinning(false);
      if (width) setBursts(cur => [...cur, { id: Date.now(), x: width / 2, y, size: SIZE }]);
    }, wait);
    return () => clearTimeout(timer);
  }, [refreshing, spinning, width, y]);

  // The spin itself runs for as long as the star is shown.
  useEffect(() => {
    if (!spinning) return;
    appear.setValue(0);
    spin.setValue(0);
    Animated.spring(appear, { toValue: 1, friction: 5, tension: 120, useNativeDriver: true }).start();
    const loop = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 900, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [spinning, spin, appear]);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} onLayout={e => setWidth(e.nativeEvent.layout.width)}>
      {spinning && (
        <Animated.Image
          source={STAR}
          style={{
            position: 'absolute', width: SIZE, height: SIZE, left: width / 2 - SIZE / 2, top: y - SIZE / 2,
            transform: [{ scale: appear }, { rotate }],
          }}
        />
      )}
      {bursts.map(b => (
        <StarBurst key={b.id} burst={b} intro={false} onDone={() => setBursts(cur => cur.filter(x => x.id !== b.id))} />
      ))}
    </View>
  );
}

/** Props that make a RefreshControl's own spinner invisible (RefreshStar is shown instead). */
export const HIDDEN_SPINNER = {
  tintColor: 'transparent',
  colors: ['transparent'],
  progressBackgroundColor: 'transparent',
} as const;

/**
 * Pull-to-refresh with the spinning star, for any screen.
 * - With `reload`: pulling awaits it (e.g. useStarRefresh(() => fetchChats())).
 * - Without: pulling bumps `refreshKey`; add it to the screen's load effect deps and call
 *   `doneLoading()` when that load finishes.
 * Render: <ScrollView refreshControl={<RefreshControl {...pull.control} />}> and
 * <RefreshStar refreshing={pull.refreshing} y={…} /> on top of the screen.
 */
export function useStarRefresh(reload?: () => unknown) {
  const [refreshing, setRefreshing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const pending = useRef<null | (() => void)>(null);
  const reloadRef = useRef(reload);
  reloadRef.current = reload;

  const doneLoading = useCallback(() => {
    pending.current?.();
    pending.current = null;
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      if (reloadRef.current) {
        await reloadRef.current();
      } else {
        await new Promise<void>(resolve => {
          pending.current = resolve;
          setTimeout(resolve, 10000); // never spin forever
          setRefreshKey(k => k + 1);
        });
      }
    } finally {
      setRefreshing(false);
    }
  }, []);

  return {
    refreshing,
    refreshKey,
    doneLoading,
    /** Spread into <RefreshControl {...pull.control} />: hides the system spinner. */
    control: { refreshing, onRefresh, ...HIDDEN_SPINNER },
  };
}
