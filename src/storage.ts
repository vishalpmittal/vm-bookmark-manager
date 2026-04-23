import type { Bookmark, Folder } from './types';
import { parseCSV, serializeCSV } from './csv';

const DB_NAME = 'vm_bookmarks_db';
const DB_VERSION = 1;
const STORE_NAME = 'handles';

let dirHandle: FileSystemDirectoryHandle | null = null;

// ---- IndexedDB helpers (for persisting the directory handle) ----

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function loadDirHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get('dir');
      req.onsuccess = () => resolve((req.result as FileSystemDirectoryHandle) ?? null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function saveDirHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(handle, 'dir');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ---- Public API ----

export async function initStorage(forceNew = false): Promise<void> {
  if (!('showDirectoryPicker' in window)) {
    throw new Error(
      'File System Access API is not supported. Please use Chrome or Edge 90+.'
    );
  }

  if (!forceNew) {
    const stored = await loadDirHandle();
    if (stored) {
      try {
        const perm = await stored.requestPermission({ mode: 'readwrite' });
        if (perm === 'granted') {
          dirHandle = stored;
          return;
        }
      } catch {
        // Permission denied or handle stale — fall through to picker
      }
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dirHandle = await (window as any).showDirectoryPicker({ mode: 'readwrite' });
  await saveDirHandle(dirHandle!);
}

async function readFile(name: string): Promise<string> {
  if (!dirHandle) throw new Error('Storage not initialized');
  try {
    const fh = await dirHandle.getFileHandle(name);
    const file = await fh.getFile();
    return await file.text();
  } catch {
    return ''; // file does not exist yet
  }
}

async function writeFile(name: string, content: string): Promise<void> {
  if (!dirHandle) throw new Error('Storage not initialized');
  const fh = await dirHandle.getFileHandle(name, { create: true });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const writable = await (fh as any).createWritable();
  await writable.write(content);
  await writable.close();
}

// ---- Bookmark CSV ----
// Columns: id,url,title,description,notes,folder_id,tags,created_at,last_accessed,access_count

const BM_HEADER = [
  'id', 'url', 'title', 'description', 'notes',
  'folder_id', 'tags', 'created_at', 'last_accessed', 'access_count',
];

function rowToBookmark(row: string[]): Bookmark {
  return {
    id:           row[0],
    url:          row[1],
    title:        row[2],
    description:  row[3],
    notes:        row[4],
    folder_id:    row[5],
    tags:         row[6] ? row[6].split('|').filter(Boolean) : [],
    created_at:   row[7],
    last_accessed: row[8],
    access_count: parseInt(row[9], 10) || 0,
  };
}

function bookmarkToRow(b: Bookmark): string[] {
  return [
    b.id, b.url, b.title, b.description, b.notes,
    b.folder_id, b.tags.join('|'), b.created_at, b.last_accessed,
    String(b.access_count),
  ];
}

export async function loadBookmarks(): Promise<Bookmark[]> {
  const text = await readFile('bookmarks.csv');
  if (!text.trim()) return [];
  const rows = parseCSV(text);
  return rows.slice(1).filter(r => r.length >= 10 && r[0]).map(rowToBookmark);
}

export async function saveBookmarks(bookmarks: Bookmark[]): Promise<void> {
  await writeFile('bookmarks.csv', serializeCSV([BM_HEADER, ...bookmarks.map(bookmarkToRow)]));
}

// ---- Folder CSV ----
// Columns: id,name,parent_id,created_at,last_accessed,access_count

const FOLDER_HEADER = ['id', 'name', 'parent_id', 'created_at', 'last_accessed', 'access_count'];

function rowToFolder(row: string[]): Folder {
  return {
    id:           row[0],
    name:         row[1],
    parent_id:    row[2],
    created_at:   row[3],
    last_accessed: row[4],
    access_count: parseInt(row[5], 10) || 0,
  };
}

function folderToRow(f: Folder): string[] {
  return [f.id, f.name, f.parent_id, f.created_at, f.last_accessed, String(f.access_count)];
}

export async function loadFolders(): Promise<Folder[]> {
  const text = await readFile('folders.csv');
  if (!text.trim()) return [];
  const rows = parseCSV(text);
  return rows.slice(1).filter(r => r.length >= 6 && r[0]).map(rowToFolder);
}

export async function saveFolders(folders: Folder[]): Promise<void> {
  await writeFile('folders.csv', serializeCSV([FOLDER_HEADER, ...folders.map(folderToRow)]));
}
