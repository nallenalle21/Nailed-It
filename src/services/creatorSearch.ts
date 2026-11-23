import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { avatarPublicUrl } from './vendorAvatar';
import { vendorCity } from '../data/vendorCities';

/** One freelancer in the Explore search results (see supabase/search_creators.sql). */
export type CreatorSearchResult = {
  id: string;
  username: string;
  avatarUrl: string | null;
  city: string | null;
  fromPrice: number | null;
};

type Row = { id: string; username: string; avatar_path: string | null; city: string | null; from_price: number | string | null };

/** Freelancers whose username contains the text, best matches first. A leading "@" is ignored. */
export async function searchCreators(query: string, limit = 20): Promise<CreatorSearchResult[]> {
  const { data, error } = await supabase.rpc('search_creators', { p_query: query, p_limit: limit });
  if (error) throw error;
  return ((data ?? []) as Row[]).map((r) => ({
    id: r.id,
    username: r.username,
    avatarUrl: r.avatar_path ? avatarPublicUrl(r.avatar_path) : null,
    city: r.city ?? vendorCity(r.username),
    fromPrice: r.from_price === null ? null : Number(r.from_price),
  }));
}

// ---- Recent profiles opened from search (only on this phone, like Instagram) ----

const RECENT_KEY = 'search.recentCreators';
const RECENT_MAX = 8;

export async function getRecentCreators(): Promise<CreatorSearchResult[]> {
  try {
    const raw = await AsyncStorage.getItem(RECENT_KEY);
    const list = raw ? (JSON.parse(raw) as CreatorSearchResult[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

async function saveRecent(list: CreatorSearchResult[]) {
  try {
    await AsyncStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    // Recents are a convenience; nothing to do if storage is unavailable.
  }
}

/** Most recent first, no duplicates. */
export async function rememberCreator(creator: CreatorSearchResult): Promise<void> {
  const list = await getRecentCreators();
  await saveRecent([creator, ...list.filter((c) => c.id !== creator.id)].slice(0, RECENT_MAX));
}

export async function forgetCreator(id: string): Promise<CreatorSearchResult[]> {
  const list = (await getRecentCreators()).filter((c) => c.id !== id);
  await saveRecent(list);
  return list;
}

export async function clearRecentCreators(): Promise<void> {
  await saveRecent([]);
}
