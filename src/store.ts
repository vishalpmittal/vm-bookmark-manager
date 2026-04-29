import type { Bookmark, Folder } from './types';
import {
  loadBookmarks, saveBookmarks,
  loadFolders, saveFolders,
} from './storage';

export const ARCHIVE_FOLDER_NAME = 'Archive';
const STALE_DAYS = 90;

export let bookmarks: Bookmark[] = [];
export let folders: Folder[] = [];

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// ---- Sorting (centralized) ----

export type FolderSortMode = 'most-used' | 'least-used' | 'a-z';

export function sortedFolders(mode: FolderSortMode = 'most-used'): Folder[] {
  return [...folders].sort((a, b) => {
    switch (mode) {
      case 'a-z':
        return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
      case 'least-used':
        if (a.access_count !== b.access_count) return a.access_count - b.access_count;
        return a.last_accessed.localeCompare(b.last_accessed);
      default:
        if (b.access_count !== a.access_count) return b.access_count - a.access_count;
        return b.last_accessed.localeCompare(a.last_accessed);
    }
  });
}

export function sortedBookmarks(folder_id?: string | null, query?: string): Bookmark[] {
  let list = bookmarks;
  if (folder_id) {
    list = list.filter(b => b.folder_id === folder_id);
  }
  if (query && query.trim()) {
    const q = query.toLowerCase();
    list = list.filter(b =>
      b.title.toLowerCase().includes(q) ||
      b.url.toLowerCase().includes(q) ||
      b.description.toLowerCase().includes(q) ||
      b.notes.toLowerCase().includes(q) ||
      b.tags.some(t => t.toLowerCase().includes(q))
    );
  }
  return [...list].sort((a, b) => b.last_accessed.localeCompare(a.last_accessed));
}

// ---- Archive ----

export function getArchiveFolder(): Folder | undefined {
  return folders.find(f => f.name === ARCHIVE_FOLDER_NAME);
}

async function ensureArchiveFolder(): Promise<Folder> {
  let archive = getArchiveFolder();
  if (!archive) {
    const now = new Date().toISOString();
    archive = {
      id: generateId(), name: ARCHIVE_FOLDER_NAME, parent_id: '',
      created_at: now, last_accessed: now, access_count: 0,
    };
    folders.push(archive);
    await saveFolders(folders);
  }
  return archive;
}

export async function archiveStaleBookmarks(): Promise<number> {
  const archive = await ensureArchiveFolder();
  const cutoff = Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000;
  let count = 0;

  for (const bm of bookmarks) {
    if (bm.folder_id === archive.id) continue;
    if (new Date(bm.last_accessed).getTime() >= cutoff) continue;

    // Tag with source folder name
    const srcFolder = folders.find(f => f.id === bm.folder_id);
    if (srcFolder && srcFolder.name && !bm.tags.includes(srcFolder.name)) {
      bm.tags.push(srcFolder.name);
    }

    bm.folder_id = archive.id;
    count++;
  }

  if (count > 0) {
    await saveBookmarks(bookmarks);
  }
  return count;
}

// ---- Load ----

export async function loadAll(): Promise<void> {
  [bookmarks, folders] = await Promise.all([loadBookmarks(), loadFolders()]);
}

// ---- Bookmark CRUD ----

export async function addBookmark(
  data: Omit<Bookmark, 'id' | 'created_at' | 'last_accessed' | 'access_count'>
): Promise<Bookmark> {
  const now = new Date().toISOString();
  const bm: Bookmark = { ...data, id: generateId(), created_at: now, last_accessed: now, access_count: 0 };
  bookmarks.push(bm);
  await saveBookmarks(bookmarks);
  return bm;
}

export async function updateBookmark(id: string, data: Partial<Bookmark>): Promise<void> {
  const idx = bookmarks.findIndex(b => b.id === id);
  if (idx === -1) return;
  bookmarks[idx] = { ...bookmarks[idx], ...data };
  await saveBookmarks(bookmarks);
}

export async function deleteBookmark(id: string): Promise<void> {
  bookmarks = bookmarks.filter(b => b.id !== id);
  await saveBookmarks(bookmarks);
}

/** Open a bookmark: increments access stats for the bookmark and its parent folder. */
export async function openBookmark(id: string): Promise<string> {
  const bm = bookmarks.find(b => b.id === id);
  if (!bm) return '';
  const now = new Date().toISOString();
  bm.last_accessed = now;
  bm.access_count++;
  const folder = folders.find(f => f.id === bm.folder_id);
  if (folder) {
    folder.last_accessed = now;
    folder.access_count++;
    await saveFolders(folders);
  }
  await saveBookmarks(bookmarks);
  return bm.url;
}

/** Open all bookmarks by ID: batch-updates access stats and saves CSVs once. Returns URLs. */
export async function openAllBookmarks(ids: string[]): Promise<string[]> {
  const now = new Date().toISOString();
  const urls: string[] = [];
  const touchedFolderIds = new Set<string>();

  for (const id of ids) {
    const bm = bookmarks.find(b => b.id === id);
    if (!bm) continue;
    bm.last_accessed = now;
    bm.access_count++;
    urls.push(bm.url);
    if (bm.folder_id) touchedFolderIds.add(bm.folder_id);
  }

  for (const fid of touchedFolderIds) {
    const folder = folders.find(f => f.id === fid);
    if (folder) {
      folder.last_accessed = now;
      folder.access_count++;
    }
  }

  await Promise.all([saveBookmarks(bookmarks), saveFolders(folders)]);
  return urls;
}

// ---- Folder CRUD ----

export async function addFolder(name: string): Promise<Folder> {
  const now = new Date().toISOString();
  const folder: Folder = {
    id: generateId(), name, parent_id: '',
    created_at: now, last_accessed: now, access_count: 0,
  };
  folders.push(folder);
  await saveFolders(folders);
  return folder;
}

export async function updateFolder(id: string, data: Partial<Folder>): Promise<void> {
  const idx = folders.findIndex(f => f.id === id);
  if (idx === -1) return;
  folders[idx] = { ...folders[idx], ...data };
  await saveFolders(folders);
}

export async function deleteFolder(id: string): Promise<void> {
  folders = folders.filter(f => f.id !== id);
  // Move bookmarks to "unfiled" (empty folder_id)
  bookmarks = bookmarks.map(b => b.folder_id === id ? { ...b, folder_id: '' } : b);
  await Promise.all([saveFolders(folders), saveBookmarks(bookmarks)]);
}

// ---- Import ----

export async function importFromNetscape(
  imported: Array<{ url: string; title: string; addDate: number; folderName: string }>
): Promise<{ bookmarkCount: number; folderCount: number }> {
  let newFolderCount = 0;
  const folderMap = new Map<string, string>();
  for (const f of folders) folderMap.set(f.name, f.id);

  for (const name of new Set(imported.map(b => b.folderName).filter(Boolean))) {
    if (!folderMap.has(name)) {
      const now = new Date().toISOString();
      const folder: Folder = {
        id: generateId(), name, parent_id: '',
        created_at: now, last_accessed: now, access_count: 0,
      };
      folders.push(folder);
      folderMap.set(name, folder.id);
      newFolderCount++;
    }
  }

  for (const item of imported) {
    const created = new Date(item.addDate * 1000).toISOString();
    bookmarks.push({
      id: generateId(),
      url: item.url,
      title: item.title,
      description: '',
      notes: '',
      folder_id: item.folderName ? (folderMap.get(item.folderName) || '') : '',
      tags: [],
      created_at: created,
      last_accessed: created,
      access_count: 0,
    });
  }

  await Promise.all([saveBookmarks(bookmarks), saveFolders(folders)]);
  return { bookmarkCount: imported.length, folderCount: newFolderCount };
}

// ---- Helpers ----

export function getFolder(id: string): Folder | undefined {
  return folders.find(f => f.id === id);
}

export function bookmarkCountInFolder(folder_id: string): number {
  return bookmarks.filter(b => b.folder_id === folder_id).length;
}

export function findBookmarkByUrl(url: string, excludeId?: string): Bookmark | undefined {
  const normalized = url.trim().replace(/\/+$/, '').toLowerCase();
  if (!normalized) return undefined;
  return bookmarks.find(b =>
    b.url.trim().replace(/\/+$/, '').toLowerCase() === normalized && b.id !== excludeId
  );
}
