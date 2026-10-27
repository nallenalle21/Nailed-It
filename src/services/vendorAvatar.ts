import { File } from 'expo-file-system';
import type { ImagePickerAsset } from 'expo-image-picker';
import { supabase } from './supabase';

// Avatar photos are public artwork, stored in the SAME bucket as vendor portfolios.
// Never store sensitive documents or certificates in this bucket.
const BUCKET = 'vendor-portfolio';
const MAX_FILE_BYTES = 6 * 1024 * 1024;

type AvatarRow = { storage_path: string };

export function avatarPublicUrl(storagePath: string): string {
  return supabase.storage.from(BUCKET).getPublicUrl(storagePath).data.publicUrl;
}

/** Returns the saved, publicly viewable avatar URL for a selected vendor. */
export async function getVendorAvatarUrl(vendorId: string): Promise<string | null> {
  const { data, error } = await supabase.from('vendor_avatars')
    .select('storage_path')
    .eq('vendor_id', vendorId)
    .maybeSingle();
  if (error) throw error;
  return (data as AvatarRow | null)?.storage_path
    ? avatarPublicUrl((data as AvatarRow).storage_path)
    : null;
}

/** Uploads a new avatar and links it to the logged-in creator. Replaces an old avatar. */
export async function uploadVendorAvatar(vendorId: string, asset: ImagePickerAsset): Promise<string> {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!authData.user || authData.user.id !== vendorId) {
    throw new Error('You may only change your own profile picture.');
  }

  const extensions: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/heic': 'heic',
    'image/heif': 'heif',
  };
  const filename = (asset.fileName || asset.uri.split('?')[0] || '').toLowerCase();
  const ext = filename.match(/\.(jpe?g|png|webp|heic|heif)$/)?.[1];
  const mimeByExt: Record<string, string> = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
    webp: 'image/webp', heic: 'image/heic', heif: 'image/heif',
  };
  const mime = (asset.mimeType || (ext ? mimeByExt[ext] : '')).toLowerCase();
  if (!extensions[mime]) {
    throw new Error('Please choose a JPEG, PNG, WebP or HEIC photo.');
  }

  const file = new File(asset.uri);
  if (!file.exists) throw new Error('The selected photo is not available on your device.');
  if (file.size !== null && file.size > MAX_FILE_BYTES) {
    throw new Error('The profile picture must be smaller than 6 MB.');
  }
  const bytes = await file.arrayBuffer();
  if (bytes.byteLength > MAX_FILE_BYTES) {
    throw new Error('The profile picture must be smaller than 6 MB.');
  }

  // A distinct file path prevents clients displaying an outdated cached avatar.
  const storagePath = `${vendorId}/avatar/${Date.now()}-${Math.random().toString(36).slice(2, 12)}.${extensions[mime]}`;
  const { data: previous, error: lookupError } = await supabase.from('vendor_avatars')
    .select('storage_path').eq('vendor_id', vendorId).maybeSingle();
  if (lookupError) throw lookupError;

  const { error: uploadError } = await supabase.storage.from(BUCKET)
    .upload(storagePath, bytes, { contentType: mime, upsert: false, cacheControl: '3600' });
  if (uploadError) throw uploadError;

  const { error: saveError } = await supabase.from('vendor_avatars').upsert({
    vendor_id: vendorId,
    storage_path: storagePath,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'vendor_id' });
  if (saveError) {
    const { error: cleanupError } = await supabase.storage.from(BUCKET).remove([storagePath]);
    if (cleanupError) console.warn('Could not clean up failed avatar upload:', cleanupError);
    throw saveError;
  }

  // Best-effort cleanup; saving the new avatar must not fail if old file cleanup fails.
  if (previous?.storage_path && previous.storage_path !== storagePath) {
    const { error: cleanupError } = await supabase.storage.from(BUCKET).remove([previous.storage_path]);
    if (cleanupError) console.warn('Old avatar needs Storage cleanup:', previous.storage_path, cleanupError);
  }
  return avatarPublicUrl(storagePath);
}
