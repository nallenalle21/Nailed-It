// Uploads a folder of images to a creator account's portfolio (they then also appear on Explore).
//
// Usage:
//   EMAIL=you@example.com PASSWORD='...' node scripts/upload-portfolio.mjs <folder>
//
// Images are uploaded in filename order, so the first file shows first in the portfolio.
// Signs in as the account itself, so it follows the same rules as uploading in the app.
import { readFileSync, readdirSync } from 'node:fs';
import { join, extname } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const BUCKET = 'vendor-portfolio';
const MAX_PHOTOS = 9;
const MAX_FILE_BYTES = 6 * 1024 * 1024;
const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };

const folder = process.argv[2];
const { EMAIL, PASSWORD } = process.env;
if (!folder || !EMAIL || !PASSWORD) {
  console.error("Usage: EMAIL=you@example.com PASSWORD='...' node scripts/upload-portfolio.mjs <folder>");
  process.exit(1);
}

// Reuse the project's Supabase URL and public anon key from the app config.
const config = readFileSync(new URL('../src/services/supabase.ts', import.meta.url), 'utf8');
const url = config.match(/supabaseUrl = '([^']+)'/)?.[1];
const anonKey = config.match(/supabaseAnonKey = '([^']+)'/)?.[1];
if (!url || !anonKey) throw new Error('Could not read Supabase URL/key from src/services/supabase.ts');

const supabase = createClient(url, anonKey, { auth: { persistSession: false } });

const { data: auth, error: signInError } = await supabase.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
if (signInError) throw new Error(`Sign-in failed: ${signInError.message}`);
const userId = auth.user.id;

const { data: profile, error: profileError } = await supabase.from('profiles')
  .select('username, role').eq('id', userId).single();
if (profileError) throw profileError;
if (profile.role !== 'creator') {
  throw new Error(`Account "${profile.username}" has role "${profile.role}", not "creator" — its photos would not show on Explore.`);
}

const { count, error: countError } = await supabase.from('vendor_posts')
  .select('id', { count: 'exact', head: true }).eq('vendor_id', userId);
if (countError) throw countError;

const files = readdirSync(folder).filter(f => MIME[extname(f).toLowerCase()]).sort();
const room = MAX_PHOTOS - (count ?? 0);
if (files.length > room) {
  throw new Error(`Account already has ${count} photos; only ${room} more fit (limit ${MAX_PHOTOS}), but ${files.length} were given.`);
}

// Newest posts are listed first, so upload in reverse to keep the folder order on screen.
for (const file of [...files].reverse()) {
  const bytes = readFileSync(join(folder, file));
  if (bytes.byteLength > MAX_FILE_BYTES) throw new Error(`${file} is over the 6 MB limit.`);
  const ext = extname(file).toLowerCase();
  const mime = MIME[ext];
  const storagePath = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 12)}${ext === '.jpeg' ? '.jpg' : ext}`;

  const { error: uploadError } = await supabase.storage.from(BUCKET)
    .upload(storagePath, bytes, { contentType: mime, upsert: false, cacheControl: '3600' });
  if (uploadError) throw new Error(`${file}: ${uploadError.message}`);

  const { error: insertError } = await supabase.from('vendor_posts')
    .insert({ vendor_id: userId, storage_path: storagePath, caption: '', is_pinned: false });
  if (insertError) {
    await supabase.storage.from(BUCKET).remove([storagePath]);
    throw new Error(`${file}: ${insertError.message}`);
  }
  console.log(`Uploaded ${file}`);
}

console.log(`Done: ${files.length} photos added to "${profile.username}".`);
