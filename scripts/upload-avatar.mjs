// Sets a creator account's profile picture (same storage + table the app uses).
//
// Usage:
//   LOGIN=<email or username> PASSWORD='...' node scripts/upload-avatar.mjs <image file>
//
// Signs in as the account itself, so it follows the same rules as changing it in the app.
import { readFileSync } from 'node:fs';
import { extname } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const BUCKET = 'vendor-portfolio';
const MAX_FILE_BYTES = 6 * 1024 * 1024;
const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };

const file = process.argv[2];
const { LOGIN, PASSWORD } = process.env;
if (!file || !LOGIN || !PASSWORD) {
  console.error("Usage: LOGIN=<email or username> PASSWORD='...' node scripts/upload-avatar.mjs <image file>");
  process.exit(1);
}
const ext = extname(file).toLowerCase();
const mime = MIME[ext];
if (!mime) throw new Error('Use a JPEG, PNG or WebP image.');
const bytes = readFileSync(file);
if (bytes.byteLength > MAX_FILE_BYTES) throw new Error('The image must be smaller than 6 MB.');

const config = readFileSync(new URL('../src/services/supabase.ts', import.meta.url), 'utf8');
const url = config.match(/supabaseUrl = '([^']+)'/)?.[1];
const anonKey = config.match(/supabaseAnonKey = '([^']+)'/)?.[1];
if (!url || !anonKey) throw new Error('Could not read Supabase URL/key from src/services/supabase.ts');
const supabase = createClient(url, anonKey, { auth: { persistSession: false } });

// Like the login screen: a value without "@" is a username → look up its email.
let email = LOGIN.trim();
if (!email.includes('@')) {
  const { data, error } = await supabase.from('profiles').select('email').eq('username', email).single();
  if (error || !data?.email) throw new Error(`No account found for username "${email}".`);
  email = data.email;
}

const { data: auth, error: signInError } = await supabase.auth.signInWithPassword({ email, password: PASSWORD });
if (signInError) throw new Error(`Sign-in failed: ${signInError.message}`);
const userId = auth.user.id;

const { data: previous, error: lookupError } = await supabase.from('vendor_avatars')
  .select('storage_path').eq('vendor_id', userId).maybeSingle();
if (lookupError) throw lookupError;

const storagePath = `${userId}/avatar/${Date.now()}-${Math.random().toString(36).slice(2, 12)}${ext === '.jpeg' ? '.jpg' : ext}`;
const { error: uploadError } = await supabase.storage.from(BUCKET)
  .upload(storagePath, bytes, { contentType: mime, upsert: false, cacheControl: '3600' });
if (uploadError) throw uploadError;

const { error: saveError } = await supabase.from('vendor_avatars').upsert({
  vendor_id: userId, storage_path: storagePath, updated_at: new Date().toISOString(),
}, { onConflict: 'vendor_id' });
if (saveError) {
  await supabase.storage.from(BUCKET).remove([storagePath]);
  throw saveError;
}

if (previous?.storage_path && previous.storage_path !== storagePath) {
  const { error } = await supabase.storage.from(BUCKET).remove([previous.storage_path]);
  if (error) console.warn('Old avatar file could not be removed:', error.message);
}
console.log(`Profile picture updated for ${email}.`);
