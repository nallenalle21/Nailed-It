import { Platform } from 'react-native';
import * as Location from 'expo-location';
import { supabase } from './supabase';

export type Category = 'nails' | 'lashes' | 'brows';
export type WorkplaceType = 'home_studio' | 'salon_chair' | 'mobile';

export const CATEGORY_LABELS: Record<Category, string> = { nails: 'Nails', lashes: 'Lashes', brows: 'Brows' };
export const WORKPLACE_LABELS: Record<WorkplaceType, string> = {
  home_studio: 'Home studio',
  salon_chair: 'Rented chair in a salon',
  mobile: 'Mobile (I travel to the customer)',
};
/** Short form for profiles and cards. */
export const WORKPLACE_SHORT: Record<WorkplaceType, string> = {
  home_studio: 'Home studio',
  salon_chair: 'Salon',
  mobile: 'Travels to you',
};

/** The freelancer's setup (see supabase/freelancer_onboarding.sql). Phone, email and address are private. */
export type Onboarding = {
  display_name: string | null;
  username: string | null;
  categories: Category[];
  workplace_types: WorkplaceType[];
  area: string | null;
  area_lat: number | null;
  area_lng: number | null;
  travel_km: number | null;
  terms_accepted: boolean;
  /** Furthest step reached, so they continue where they left off. */
  step: number;
  /** Done: the profile is live for customers. */
  completed: boolean;
  phone: string | null;
  contact_email: string | null;
  address: string | null;
  address_lat: number | null;
  address_lng: number | null;
};

export type OnboardingField = 'display_name' | 'categories' | 'workplace_types' | 'travel_km' | 'address' | 'area' | 'phone' | 'contact_email' | 'terms';

export async function getMyOnboarding(): Promise<Onboarding | null> {
  const { data, error } = await supabase.rpc('get_my_onboarding');
  if (error) throw error;
  return (data as Onboarding | null) ?? null;
}

/** Saves the given fields (each checked by the server) and the step reached. */
export async function saveOnboarding(step: number, data: Record<string, unknown>): Promise<Onboarding> {
  const { data: saved, error } = await supabase.rpc('save_onboarding', { p_step: step, p_data: data });
  if (error) throw error;
  return saved as Onboarding;
}

/** Goes live if everything required is filled in; otherwise says what is missing. */
export async function completeOnboarding(): Promise<{ live: boolean; missing: OnboardingField[] }> {
  const { data, error } = await supabase.rpc('complete_onboarding');
  if (error) throw error;
  return data as { live: boolean; missing: OnboardingField[] };
}

export type AreaLookup = {
  /** The exact spot (private). */
  address: { lat: number; lng: number };
  /** e.g. "Södermalm"; null if the phone couldn't tell. */
  area: string | null;
  /** A point for the area (its center when found, otherwise the address rounded to ~1 km). */
  areaPoint: { lat: number; lng: number };
};

/**
 * Turns an address into the area customers see and a map point for it, using the phone's
 * built-in map lookup. Android needs location permission for this; if it's refused, or the
 * address isn't found, this throws and the freelancer types the area themselves.
 */
export async function lookUpArea(address: string): Promise<AreaLookup> {
  if (Platform.OS === 'android') {
    const { granted } = await Location.requestForegroundPermissionsAsync();
    if (!granted) throw new Error('Location permission is needed to look up the area.');
  }
  const [spot] = await Location.geocodeAsync(address);
  if (!spot) throw new Error('We couldn’t find that address.');

  const [place] = await Location.reverseGeocodeAsync({ latitude: spot.latitude, longitude: spot.longitude });
  const area = place?.district || place?.subregion || place?.city || null;
  const city = place?.city || place?.region || '';

  // Center of the area, so the map never points at the exact address.
  let areaPoint = { lat: Math.round(spot.latitude * 100) / 100, lng: Math.round(spot.longitude * 100) / 100 };
  if (area) {
    try {
      const [center] = await Location.geocodeAsync(city && city !== area ? `${area}, ${city}` : area);
      if (center) areaPoint = { lat: center.latitude, lng: center.longitude };
    } catch {
      // keep the rounded point
    }
  }
  return { address: { lat: spot.latitude, lng: spot.longitude }, area, areaPoint };
}
