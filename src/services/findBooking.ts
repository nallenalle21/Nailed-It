import { supabase } from './supabase';
import { avatarPublicUrl } from './vendorAvatar';
import { vendorCity } from '../data/vendorCities';
import type { Category, WorkplaceType } from './onboarding';

/** A start time the freelancer can really be booked at (checked against the booking rules). */
export type FreeTime = { date: string; start: string };

/** A freelancer card in Explore's "Book" view (see supabase/find_bookable_creators.sql). */
export type BookableCreator = {
  id: string;
  username: string;
  /** The name they chose in onboarding (falls back to the username). */
  displayName: string;
  avatarUrl: string | null;
  /** The approximate area customers see, e.g. "Södermalm" (never the address). */
  city: string | null;
  /** The area's map point, or null (then the map uses a placeholder spot). */
  areaPoint: { latitude: number; longitude: number } | null;
  categories: Category[];
  workplaceTypes: WorkplaceType[];
  travelKm: number | null;
  fromPrice: number | null;
  serviceNames: string[];
  /** The service the free times are for (their shortest matching one); pre-selected when booking. */
  serviceId: string;
  serviceName: string;
  nextTimes: FreeTime[];
};

type Row = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_path: string | null;
  city: string | null;
  area_lat: number | null;
  area_lng: number | null;
  categories: Category[] | null;
  workplace_types: WorkplaceType[] | null;
  travel_km: number | null;
  from_price: number | string | null;
  service_names: string[] | null;
  service_id: string;
  service_name: string;
  next_times: FreeTime[] | null;
};

/**
 * Freelancers with their next free times: the next 14 days, or only `date`. With `service`,
 * only freelancers offering it, and times long enough for it. `creatorId` = just that one.
 */
export async function findBookableCreators(options: {
  date?: string | null;
  service?: string | null;
  creatorId?: string | null;
  times?: number;
} = {}): Promise<BookableCreator[]> {
  const { data, error } = await supabase.rpc('find_bookable_creators', {
    p_date: options.date ?? null,
    p_service: options.service ?? null,
    p_creator: options.creatorId ?? null,
    p_times: options.times ?? 3,
  });
  if (error) throw error;
  return ((data ?? []) as Row[]).map((r) => ({
    id: r.id,
    username: r.username,
    displayName: r.display_name?.trim() || r.username,
    avatarUrl: r.avatar_path ? avatarPublicUrl(r.avatar_path) : null,
    city: r.city ?? vendorCity(r.username),
    areaPoint: r.area_lat != null && r.area_lng != null ? { latitude: r.area_lat, longitude: r.area_lng } : null,
    categories: r.categories ?? [],
    workplaceTypes: r.workplace_types ?? [],
    travelKm: r.travel_km,
    fromPrice: r.from_price === null ? null : Number(r.from_price),
    serviceNames: r.service_names ?? [],
    serviceId: r.service_id,
    serviceName: r.service_name,
    nextTimes: r.next_times ?? [],
  }));
}

export type BookSort = 'next' | 'price';

/** Soonest free time first (no times last), or cheapest first (no price last). */
export function sortBookable(list: BookableCreator[], sort: BookSort): BookableCreator[] {
  const first = (c: BookableCreator) => (c.nextTimes[0] ? `${c.nextTimes[0].date} ${c.nextTimes[0].start}` : '~');
  return [...list].sort((a, b) =>
    sort === 'price'
      ? (a.fromPrice ?? Infinity) - (b.fromPrice ?? Infinity) || first(a).localeCompare(first(b))
      : first(a).localeCompare(first(b)) || (a.fromPrice ?? Infinity) - (b.fromPrice ?? Infinity));
}

/** "Today 16:15", "Tomorrow 10:00", "Fri 28 Nov 14:30" */
export function freeTimeLabel(t: FreeTime, now = new Date()) {
  const [y, m, d] = t.date.split('-').map(Number);
  const day = new Date(y, m - 1, d);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.round((day.getTime() - today.getTime()) / 86400000);
  const prefix = diff === 0 ? 'Today'
    : diff === 1 ? 'Tomorrow'
    : day.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  return `${prefix} ${t.start}`;
}
