import { createContext, useContext, useState, ReactNode } from 'react';

export type Folder = { id: string; name: string; items: string[] };

type WishlistCtx = {
  folders: Folder[];
  createFolder: (name: string) => string;
  renameFolder: (id: string, name: string) => void;
  deleteFolder: (id: string) => void;
  toggleItem: (folderId: string, itemId: string) => void;
  isSaved: (itemId: string) => boolean;
};

const Ctx = createContext<WishlistCtx | null>(null);

export function WishlistProvider({ children }: { children: ReactNode }) {
  const [folders, setFolders] = useState<Folder[]>([
    { id: 'favorites', name: 'Favorites', items: [] },
  ]);

  const createFolder = (name: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setFolders((prev) => [...prev, { id, name: name.trim(), items: [] }]);
    return id;
  };

  const renameFolder = (id: string, name: string) =>
    setFolders((prev) => prev.map((f) => (f.id === id ? { ...f, name: name.trim() } : f)));

  const deleteFolder = (id: string) =>
    setFolders((prev) => prev.filter((f) => f.id !== id));

  const toggleItem = (folderId: string, itemId: string) =>
    setFolders((prev) =>
      prev.map((f) =>
        f.id !== folderId
          ? f
          : {
              ...f,
              items: f.items.includes(itemId)
                ? f.items.filter((i) => i !== itemId)
                : [...f.items, itemId],
            }
      )
    );

  const isSaved = (itemId: string) => folders.some((f) => f.items.includes(itemId));

  return (
    <Ctx.Provider
      value={{ folders, createFolder, renameFolder, deleteFolder, toggleItem, isSaved }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useWishlist() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useWishlist must be used inside <WishlistProvider>');
  return ctx;
}