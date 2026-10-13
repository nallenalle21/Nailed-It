import { File } from 'expo-file-system';
import type { ImagePickerAsset } from 'expo-image-picker';
import { supabase } from './supabase';

// PUBLIC artwork only. Do NOT use this bucket for private documents/certificates.
const BUCKET = 'vendor-portfolio';
const MAX_FILE_BYTES = 6 * 1024 * 1024;

export type VendorPost = {
  id: string;
  vendor_id: string;
  storage_path: string;
  caption: string;
  is_pinned: boolean;
  created_at: string;
};

export function publicPostUrl(storagePath: string): string {
  return supabase.storage.from(BUCKET).getPublicUrl(storagePath).data.publicUrl;
}

export async function listVendorPosts(vendorId: string): Promise<VendorPost[]> {
  const { data, error } = await supabase.from('vendor_posts')
    .select('id, vendor_id, storage_path, caption, is_pinned, created_at')
    .eq('vendor_id', vendorId)
    .order('is_pinned', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as VendorPost[];
}

// React Native's global Blob/FormData upload behaviour is not reliable for supabase-js.
// Expo File.arrayBuffer() yields the ArrayBuffer expected by Supabase Storage.
export async function uploadVendorPost(vendorId: string, asset: ImagePickerAsset): Promise<VendorPost> {
  const supported: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/heic': 'heic',
    'image/heif': 'heif',
  };
  // Some iOS assets omit mimeType; fall back to their filename extension.
  const name = (asset.fileName || asset.uri.split('?')[0] || '').toLowerCase();
  const ext = name.match(/\.(jpeg|jpg|png|webp|heic|heif)$/)?.[1];
  const fallbackMime: Record<string, string> = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
    webp: 'image/webp', heic: 'image/heic', heif: 'image/heif',
  };
  const mime = (asset.mimeType || (ext && fallbackMime[ext]) || '').toLowerCase();
  if (!supported[mime]) {
    throw new Error(`Unsupported image type: ${mime || 'unknown'}. Choose a JPEG, PNG, WebP or HEIC image.`);
  }

  const file = new File(asset.uri);
  if (!file.exists) throw new Error('This photo is not available locally on your phone.');
  if (file.size !== null && file.size > MAX_FILE_BYTES) {
    throw new Error('Image exceeds the 6 MB upload limit. Please select a smaller photo.');
  }
  const bytes = await file.arrayBuffer();
  if (bytes.byteLength > MAX_FILE_BYTES) {
    throw new Error('Image exceeds the 6 MB upload limit. Please select a smaller photo.');
  }

  const storagePath = `${vendorId}/${Date.now()}-${Math.random().toString(36).slice(2, 12)}.${supported[mime]}`;
  const { error: uploadError } = await supabase.storage.from(BUCKET)
    .upload(storagePath, bytes, { contentType: mime, upsert: false, cacheControl: '3600' });
  if (uploadError) throw uploadError;

  const { data, error: insertError } = await supabase.from('vendor_posts')
    .insert({ vendor_id: vendorId, storage_path: storagePath, caption: '', is_pinned: false })
    .select('id, vendor_id, storage_path, caption, is_pinned, created_at')
    .single();
  if (insertError) {
    // An image should not remain public if its database entry failed.
    const { error: cleanupError } = await supabase.storage.from(BUCKET).remove([storagePath]);
    if (cleanupError) console.warn('Unlinked portfolio image needs cleanup:', storagePath, cleanupError);
    throw insertError;
  }
  return data as VendorPost;
}

export async function setVendorPostPinned(post: VendorPost, isPinned: boolean): Promise<void> {
  const { error } = await supabase.from('vendor_posts')
    .update({ is_pinned: isPinned })
    .eq('id', post.id)
    .eq('vendor_id', post.vendor_id);
  if (error) throw error;
}

/** Returns a warning if database deletion succeeded but Storage cleanup failed. */
export async function deleteVendorPost(post: VendorPost): Promise<string | null> {
  const { error: dbError } = await supabase.from('vendor_posts')
    .delete().eq('id', post.id).eq('vendor_id', post.vendor_id);
  if (dbError) throw dbError;
  const { error: storageError } = await supabase.storage.from(BUCKET)
    .remove([post.storage_path]);
  if (storageError) {
    console.warn('Unlinked storage object:', post.storage_path, storageError);
    return 'The photo was removed from the portfolio, but Storage cleanup failed. Ask an administrator to remove the unlinked file.';
  }
  return null;
}
