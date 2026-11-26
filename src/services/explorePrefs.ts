import AsyncStorage from '@react-native-async-storage/async-storage';

/** Services you can filter Explore by (filter sheet + Explore preferences). */
export const SERVICES = [
  'Simple nail art',
  'Advanced nail art',
  'Gel nails',
  'Acrylic nails',
  'Manicure',
  'Pedicure',
];

/**
 * Explore preferences (Settings → Explore preferences), remembered on this phone:
 * services Explore is always filtered by, and which tab it opens on.
 */
export type ExplorePrefs = {
  services: string[];
  startIn: 'inspire' | 'book';
};

export const DEFAULT_EXPLORE_PREFS: ExplorePrefs = { services: [], startIn: 'inspire' };

const KEY = 'explore-preferences-v1';

export async function getExplorePrefs(): Promise<ExplorePrefs> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return DEFAULT_EXPLORE_PREFS;
    const parsed = JSON.parse(raw);
    return {
      services: Array.isArray(parsed.services) ? parsed.services.filter((s: unknown) => SERVICES.includes(s as string)) : [],
      startIn: parsed.startIn === 'book' ? 'book' : 'inspire',
    };
  } catch {
    return DEFAULT_EXPLORE_PREFS;
  }
}

export async function saveExplorePrefs(prefs: ExplorePrefs) {
  await AsyncStorage.setItem(KEY, JSON.stringify(prefs));
}
