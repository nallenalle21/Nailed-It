import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Image, StyleSheet, View, type ImageSourcePropType } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Text } from './AppText';
import { supabase } from '../services/supabase';
import { publicPostUrl } from '../services/vendorPortfolio';
import { INSPO } from '../data/inspo';
import { handle } from '../utils/handle';
import { colors } from '../theme';

// Corner-style welcome collage: real portfolio photos in tilted columns that drift
// slowly up and down. Until they load — or if they can't (e.g. Supabase rules don't let
// logged-out visitors read vendor_posts) — it shows the bundled photos in
// assets/images/welcome/.

type Tile = { key: string; h: number; color: string; uri?: string; source?: ImageSourcePropType; label?: string };

const WELCOME_PHOTOS: ImageSourcePropType[] = [
  require('../../assets/images/welcome/nails-01.jpg'),
  require('../../assets/images/welcome/nails-02.jpg'),
  require('../../assets/images/welcome/nails-03.jpg'),
  require('../../assets/images/welcome/nails-04.jpg'),
  require('../../assets/images/welcome/nails-05.jpg'),
  require('../../assets/images/welcome/nails-06.jpg'),
  require('../../assets/images/welcome/nails-07.jpg'),
  require('../../assets/images/welcome/nails-08.jpg'),
  require('../../assets/images/welcome/nails-09.jpg'),
  require('../../assets/images/welcome/nails-10.jpg'),
];

const COLUMNS = 4;
const MIN_PER_COLUMN = 5;          // one set must be taller than the visible area, so the loop never shows a gap
const HEIGHTS = [200, 160, 210, 170, 190, 150];
const SPEEDS = [1, 1.25, 0.9, 1.15]; // per column, so they don't move in lockstep
const LOOP_MS = 30000;             // one full loop of the first column
const GAP = 10;
const MAX_POSTS = 24;
const TINTS = INSPO.map(i => i.c);

const fallbackTiles = (): Tile[] =>
  WELCOME_PHOTOS.map((source, i) => ({
    key: `welcome-${i}`, h: HEIGHTS[i % HEIGHTS.length], color: TINTS[i % TINTS.length], source,
  }));

/** Repeats the list until every column gets at least MIN_PER_COLUMN tiles, then deals them out. */
function toColumns(tiles: Tile[]): Tile[][] {
  const filled: Tile[] = [];
  for (let i = 0; filled.length < COLUMNS * MIN_PER_COLUMN || i < tiles.length; i++) {
    const t = tiles[i % tiles.length];
    filled.push({ ...t, key: `${t.key}-${i}`, h: HEIGHTS[i % HEIGHTS.length] });
  }
  const cols: Tile[][] = Array.from({ length: COLUMNS }, () => []);
  filled.forEach((t, i) => cols[i % COLUMNS].push(t));
  return cols;
}

export default function WelcomeCollage({ height, tilt = -7 }: { height: number; tilt?: number }) {
  const [tiles, setTiles] = useState<Tile[]>(fallbackTiles);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => sub.remove();
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      const [creators, posts] = await Promise.all([
        supabase.from('profiles').select('id, username').eq('role', 'creator'),
        supabase.from('vendor_posts')
          .select('id, vendor_id, storage_path')
          .order('created_at', { ascending: false })
          .limit(MAX_POSTS),
      ]);
      if (!active || posts.error || !posts.data?.length) return;
      const names = new Map(((creators.data ?? []) as { id: string; username: string | null }[])
        .map(p => [p.id, p.username]));
      setTiles((posts.data as { id: string; vendor_id: string; storage_path: string }[]).map((p, i) => ({
        key: p.id,
        h: HEIGHTS[i % HEIGHTS.length],
        color: TINTS[i % TINTS.length],
        uri: publicPostUrl(p.storage_path),
        label: names.get(p.vendor_id) ? handle(names.get(p.vendor_id)) : undefined,
      })));
    })().catch(() => {}); // keep the fallback tiles
    return () => { active = false; };
  }, []);

  const columns = toColumns(tiles);

  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.wrap, { height }]}
    >
      <View style={[styles.tilted, { height: height + 140, transform: [{ rotate: `${tilt}deg` }] }]}>
        {columns.map((col, i) => (
          <Column key={i} tiles={col} up={i % 2 === 0} duration={LOOP_MS * SPEEDS[i]} paused={reduceMotion} />
        ))}
      </View>
      <Fade />
    </View>
  );
}

function Column({ tiles, up, duration, paused }: { tiles: Tile[]; up: boolean; duration: number; paused: boolean }) {
  // Height of one copy of the tiles, worked out from the tile sizes so the animation can
  // start right away instead of waiting for a layout pass.
  const setHeight = tiles.reduce((sum, t) => sum + t.h + GAP, 0);
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (paused) return;
    progress.setValue(0);
    const loop = Animated.loop(Animated.timing(progress, {
      toValue: 1, duration, easing: Easing.linear, useNativeDriver: true, isInteraction: false,
    }));
    // Start on the next frame: started during the first render pass, native-driver
    // animations can sit still until something (like a touch) makes the screen redraw.
    const frame = requestAnimationFrame(() => loop.start());
    return () => {
      cancelAnimationFrame(frame);
      loop.stop();
    };
  }, [setHeight, paused, duration, progress]);

  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: up ? [0, -setHeight] : [-setHeight, 0],
  });

  // Two identical copies stacked: when the first has scrolled out, the second is exactly
  // where the first started, so the loop restarts without a jump.
  return (
    <View style={styles.column}>
      <Animated.View style={{ transform: [{ translateY }] }}>
        <View>
          {tiles.map(t => <TileView key={t.key} tile={t} />)}
        </View>
        <View>
          {tiles.map(t => <TileView key={`${t.key}-copy`} tile={t} />)}
        </View>
      </Animated.View>
    </View>
  );
}

function TileView({ tile }: { tile: Tile }) {
  return (
    <View style={[styles.tile, { height: tile.h, backgroundColor: tile.color }]}>
      {tile.uri || tile.source ? (
        // Explicit width/height: with only absoluteFill, bundled photos were drawn at their
        // full pixel size (looking zoomed in) instead of being scaled to the tile.
        <Image source={tile.uri ? { uri: tile.uri } : (tile.source as ImageSourcePropType)} style={styles.photo} resizeMode="cover" />
      ) : null}
      {tile.label ? (
        <View style={styles.label}>
          <Text style={styles.labelText} numberOfLines={1}>{tile.label}</Text>
        </View>
      ) : null}
    </View>
  );
}

// Bottom of the collage fades smoothly into the background.
const FADE_HEIGHT = 240;
function Fade() {
  return (
    <LinearGradient
      colors={['rgba(62,141,164,0)', 'rgba(62,141,164,0.6)', colors.blueMuted]}
      locations={[0, 0.5, 1]}
      style={styles.fade}
    />
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', top: 0, left: 0, right: 0, overflow: 'hidden' },
  tilted: { position: 'absolute', top: -90, left: -50, right: -50, flexDirection: 'row', gap: GAP },
  column: { flex: 1, overflow: 'hidden' },
  tile: { borderRadius: 16, overflow: 'hidden', marginBottom: GAP },
  photo: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' },
  label: {
    position: 'absolute', left: 8, bottom: 8, maxWidth: '85%',
    paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, backgroundColor: colors.background,
  },
  labelText: { fontSize: 10, fontWeight: 'bold', color: colors.ink },
  fade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: FADE_HEIGHT },
});
