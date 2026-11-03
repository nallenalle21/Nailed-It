/**
 * Shows a username as a handle: "nail_lover" → "@nail_lover".
 * Placeholders such as "Unnamed creator", "Studio Name" or "Laddar..." (anything with a
 * space or "...") are shown as-is, and an existing "@" isn't doubled.
 */
export function handle(name: string | null | undefined): string {
  const clean = (name ?? '').trim();
  if (!clean || clean.startsWith('@') || /\s/.test(clean) || clean.includes('...')) return clean;
  return `@${clean}`;
}
