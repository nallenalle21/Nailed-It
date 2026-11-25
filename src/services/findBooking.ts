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

export type BookSort = 'next' | 'priceLow' | 'priceHigh';

/** The "Sort by" options in Explore's filter menu, in the order they're shown. */
export const BOOK_SORTS: { value: BookSort; label: string }[] = [
  { value: 'next', label: 'First available' },
  { value: 'priceLow', label: 'Price: low to high' },
  { value: 'priceHigh', label: 'Price: high to low' },
];

/**
 * First available: soonest free time first (no times last).
 * Price: by from-price, cheapest or most expensive first (no price last either way).
 * Ties keep the other order, so equal prices still show the soonest time first.
 */
export function sortBookable(list: BookableCreator[], sort: BookSort): BookableCreator[] {
  const first = (c: BookableCreator) => (c.nextTimes[0] ? `${c.nextTimes[0].date} ${c.nextTimes[0].start}` : '~');
  // Plain string comparison (not localeCompare, which sorts the "~" placeholder before dates).
  const byTime = (a: BookableCreator, b: BookableCreator) => (first(a) < first(b) ? -1 : first(a) > first(b) ? 1 : 0);
  const byPrice = (a: BookableCreator, b: BookableCreator, dir: 1 | -1) => {
    if (a.fromPrice === null || b.fromPrice === null) return (a.fromPrice === null ? 1 : 0) - (b.fromPrice === null ? 1 : 0);
    return (a.fromPrice - b.fromPrice) * dir;
  };
  return [...list].sort((a, b) =>
    sort === 'priceLow' ? byPrice(a, b, 1) || byTime(a, b)
      : sort === 'priceHigh' ? byPrice(a, b, -1) || byTime(a, b)
      : byTime(a, b) || byPrice(a, b, 1));
}

/**
 * Like findBookableCreators, but with several services (Explore's filter lets you pick more
 * than one). Each freelancer is shown once, with the service that has the soonest free time.
 */
export async function findBookableCreatorsForServices(options: {
  date?: string | null;
  services: string[];
}): Promise<BookableCreator[]> {
  if (options.services.length <= 1) {
    return findBookableCreators({ date: options.date, service: options.services[0] ?? null });
  }
  const lists = await Promise.all(
    options.services.map((service) => findBookableCreators({ date: options.date, service })),
  );
  const first = (c: BookableCreator) => (c.nextTimes[0] ? `${c.nextTimes[0].date} ${c.nextTimes[0].start}` : '~');
  const byId = new Map<string, BookableCreator>();
  for (const c of lists.flat()) {
    const seen = byId.get(c.id);
    if (!seen) {
      byId.set(c.id, c);
      continue;
    }
    const prices = [seen.fromPrice, c.fromPrice].filter((p): p is number => p !== null);
    const best = first(c) < first(seen) ? c : seen;
    byId.set(c.id, { ...best, fromPrice: prices.length ? Math.min(...prices) : null });
  }
  return [...byId.values()];
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

// ---------- Sorting the photo feed ("Feed" tab) ----------

/** 'newest' = no sort chosen: the feed's own order (newest photos first). */
export type FeedSort = 'newest' | BookSort;

/** The "Sort by" options in the Feed tab (the same as Book). Nothing chosen = newest first. */
export const FEED_SORTS: { value: FeedSort; label: string }[] = BOOK_SORTS;

/**
 * Sorts feed photos by their nail tech: first free time ("2026-11-27 14:30", null = none) or
 * from-price (null = none). Photos without one go last. "Newest" keeps the feed's own order,
 * and equal values keep it too (so each nail tech's newest photos still come first).
 */
export function sortFeedPosts<T extends { vendorId: string }>(
  posts: T[],
  sort: FeedSort,
  fromPrice: (vendorId: string) => number | null,
  firstFree: (vendorId: string) => string | null,
): T[] {
  if (sort === 'newest') return posts;
  const order = new Map(posts.map((p, i) => [p, i]));
  const nullsLast = (a: number | string | null, b: number | string | null, dir: 1 | -1) => {
    if (a === null || b === null) return (a === null ? 1 : 0) - (b === null ? 1 : 0);
    return (a < b ? -1 : a > b ? 1 : 0) * dir;
  };
  return [...posts].sort((a, b) => {
    const byKey = sort === 'next'
      ? nullsLast(firstFree(a.vendorId), firstFree(b.vendorId), 1)
      : nullsLast(fromPrice(a.vendorId), fromPrice(b.vendorId), sort === 'priceLow' ? 1 : -1);
    return byKey || order.get(a)! - order.get(b)!;
  });
}
