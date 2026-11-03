/**
 * PROTOTYPE: public city per nail tech, keyed by username.
 * The profiles table has no city column yet and other users can't read a vendor's account
 * metadata, so the public profile reads it from here. Replace with a real `profiles.city`
 * column once it exists (alter table profiles add column city text;).
 */
const CITIES: Record<string, string> = {
  nail_lover: 'Stockholm, Sweden',
};

export function vendorCity(username: string | null | undefined): string | null {
  return CITIES[(username ?? '').trim().toLowerCase()] ?? null;
}
