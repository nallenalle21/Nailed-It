import { supabase } from './supabase';
import { publicPostUrl } from './vendorPortfolio';
import { avatarPublicUrl } from './vendorAvatar';

export type SaveKind = 'post' | 'vendor';
export type WishlistBoard = { id: string; user_id: string; name: string; created_at: string };
export type WishlistRow = {
  id: string; board_id: string; post_id: string | null;
  vendor_id: string | null; created_at: string;
};
export type WishlistEntry = {
  id: string; boardId: string; kind: SaveKind; targetId: string;
  vendorId: string; creatorName: string; caption: string;
  imageUri: string | null; avatarUri: string | null; createdAt: string;
};
export type WishlistSnapshot = { boards: WishlistBoard[]; entries: WishlistEntry[] };

async function currentUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!data.user) throw new Error('Please sign in to save favorites.');
  return data.user.id;
}

// Flag on the auth user (user_metadata): set once the default "faves" collection has been
// created, so deleting faves later doesn't bring it back.
const DEFAULT_BOARD_FLAG = 'default_board_created';

export async function getWishlistBoards(ensureDefault = true): Promise<WishlistBoard[]> {
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!auth.user) throw new Error('Please sign in to save favorites.');
  const userId = auth.user.id;
  const defaultAlreadyCreated = auth.user.user_metadata?.[DEFAULT_BOARD_FLAG] === true;
  const { data, error } = await supabase.from('wishlist_boards')
    .select('id, user_id, name, created_at').eq('user_id', userId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  let boards = (data ?? []) as WishlistBoard[];
  // New accounts get "faves" once. Existing accounts that already have it just get the flag.
  if (ensureDefault && !defaultAlreadyCreated && !boards.some(b => b.name.toLowerCase() === 'faves')) {
    const { error: addError } = await supabase.from('wishlist_boards')
      .insert({ user_id: userId, name: 'faves' });
    // Another screen may have created the default board at the same time.
    if (addError && addError.code !== '23505') throw addError;
    const again = await supabase.from('wishlist_boards')
      .select('id, user_id, name, created_at').eq('user_id', userId)
      .order('created_at', { ascending: true });
    if (again.error) throw again.error;
    boards = (again.data ?? []) as WishlistBoard[];
  }
  if (ensureDefault && !defaultAlreadyCreated) {
    const { error: flagError } = await supabase.auth.updateUser({ data: { [DEFAULT_BOARD_FLAG]: true } });
    if (flagError) console.warn('Could not record default collection flag:', flagError.message);
  }
  return boards.sort((a, b) =>
    (a.name.toLowerCase() === 'faves' ? -1 : b.name.toLowerCase() === 'faves' ? 1 : 0) ||
    a.created_at.localeCompare(b.created_at)
  );
}

export async function createWishlistBoard(name: string): Promise<WishlistBoard> {
  const cleanName = name.trim();
  if (!cleanName || cleanName.length > 60) throw new Error('Enter a name of up to 60 characters.');
  const userId = await currentUserId();
  const { data, error } = await supabase.from('wishlist_boards')
    .insert({ user_id: userId, name: cleanName })
    .select('id, user_id, name, created_at').single();
  if (error) throw error;
  return data as WishlistBoard;
}

export async function renameWishlistBoard(board: WishlistBoard, name: string): Promise<void> {
  const cleanName = name.trim();
  if (!cleanName || cleanName.length > 60) throw new Error('Enter a name of up to 60 characters.');
  const userId = await currentUserId();
  const { error } = await supabase.from('wishlist_boards')
    .update({ name: cleanName }).eq('id', board.id).eq('user_id', userId);
  if (error) throw error;
}

export async function deleteWishlistBoard(board: WishlistBoard): Promise<void> {
  const userId = await currentUserId();
  const { error } = await supabase.from('wishlist_boards')
    .delete().eq('id', board.id).eq('user_id', userId);
  if (error) throw error;
}

export async function getMembership(kind: SaveKind, targetId: string): Promise<Set<string>> {
  const boards = await getWishlistBoards();
  if (boards.length === 0) return new Set();
  const column = kind === 'post' ? 'post_id' : 'vendor_id';
  const { data, error } = await supabase.from('wishlist_items').select('board_id')
    .in('board_id', boards.map(b => b.id)).eq(column, targetId);
  if (error) throw error;
  return new Set((data ?? []).map(row => row.board_id as string));
}

export async function setBoardSaved(
  boardId: string, kind: SaveKind, targetId: string, shouldSave: boolean,
): Promise<void> {
  const column = kind === 'post' ? 'post_id' : 'vendor_id';
  if (shouldSave) {
    const values = kind === 'post'
      ? { board_id: boardId, post_id: targetId }
      : { board_id: boardId, vendor_id: targetId };
    const { error } = await supabase.from('wishlist_items').insert(values);
    if (error && error.code !== '23505') throw error;
  } else {
    const { error } = await supabase.from('wishlist_items')
      .delete().eq('board_id', boardId).eq(column, targetId);
    if (error) throw error;
  }
}

export async function removeWishlistItem(id: string, boardId: string): Promise<void> {
  const { error } = await supabase.from('wishlist_items')
    .delete().eq('id', id).eq('board_id', boardId);
  if (error) throw error;
}

export async function getSavedTargetIds(kind: SaveKind): Promise<Set<string>> {
  const boards = await getWishlistBoards(false);
  if (!boards.length) return new Set();
  const column = kind === 'post' ? 'post_id' : 'vendor_id';
  const { data, error } = await supabase.from('wishlist_items').select(column)
    .in('board_id', boards.map(b => b.id)).not(column, 'is', null);
  if (error) throw error;
  return new Set((data ?? []).map(row => (row as any)[column] as string));
}

// Read a snapshot for board covers and board details; missing/deleted posts do not
// appear, and owner-only RLS keeps saved collections private to each account.
export async function getWishlistSnapshot(): Promise<WishlistSnapshot> {
  const boards = await getWishlistBoards();
  const { data, error } = await supabase.from('wishlist_items')
    .select('id, board_id, post_id, vendor_id, created_at')
    .in('board_id', boards.map(board => board.id))
    .order('created_at', { ascending: false });
  if (error) throw error;
  const rows = (data ?? []) as WishlistRow[];
  const postIds = [...new Set(rows.map(row => row.post_id).filter((id): id is string => !!id))];
  const savedVendorIds = rows.map(row => row.vendor_id).filter((id): id is string => !!id);

  const postResult = postIds.length
    ? await supabase.from('vendor_posts')
        .select('id, vendor_id, storage_path, caption').in('id', postIds)
    : { data: [], error: null };
  if (postResult.error) throw postResult.error;
  const posts = (postResult.data ?? []) as { id: string; vendor_id: string; storage_path: string; caption: string }[];
  const vendorIds = [...new Set([...savedVendorIds, ...posts.map(p => p.vendor_id)])];
  const [profilesResult, avatarResult] = await Promise.all([
    vendorIds.length
      ? supabase.from('profiles').select('id, username').in('id', vendorIds).eq('role', 'creator')
      : Promise.resolve({ data: [], error: null }),
    vendorIds.length
      ? supabase.from('vendor_avatars').select('vendor_id, storage_path').in('vendor_id', vendorIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (profilesResult.error) throw profilesResult.error;
  if (avatarResult.error) throw avatarResult.error;
  const profiles = new Map(((profilesResult.data ?? []) as { id: string; username: string | null }[])
    .map(p => [p.id, p.username?.trim() || 'Unnamed creator']));
  const avatars = new Map(((avatarResult.data ?? []) as { vendor_id: string; storage_path: string }[])
    .map(a => [a.vendor_id, avatarPublicUrl(a.storage_path)]));
  const postMap = new Map(posts.map(p => [p.id, p]));
  const entries: WishlistEntry[] = [];
  for (const row of rows) {
    const post = row.post_id ? postMap.get(row.post_id) : undefined;
    const vendorId = post?.vendor_id || row.vendor_id;
    if (!vendorId || !profiles.has(vendorId)) continue;
    entries.push({
      id: row.id,
      boardId: row.board_id,
      kind: row.post_id ? 'post' : 'vendor',
      targetId: row.post_id || row.vendor_id!,
      vendorId,
      creatorName: profiles.get(vendorId)!,
      caption: post?.caption || '',
      imageUri: post ? publicPostUrl(post.storage_path) : null,
      avatarUri: avatars.get(vendorId) || null,
      createdAt: row.created_at,
    });
  }
  return { boards, entries };
}
