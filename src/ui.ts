import type { Bookmark, Folder } from './types';
import type { FolderSortMode } from './store';
import {
  sortedFolders, sortedBookmarks,
  addBookmark, updateBookmark, deleteBookmark, openBookmark, openAllBookmarks,
  addFolder, updateFolder, deleteFolder,
  getFolder, bookmarkCountInFolder, getArchiveFolder,
  bookmarks, loadAll, ARCHIVE_FOLDER_NAME,
  importFromNetscape, findBookmarkByUrl,
} from './store';
import { parseNetscapeBookmarks, exportNetscapeBookmarks } from './netscape';

let selectedFolderId: string | null = null;
let searchQuery = '';
let folderSortMode: FolderSortMode = 'most-used';
let confirmCallback: (() => Promise<void>) | null = null;

// ---- DOM helpers ----

function el<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.protocol === 'http:' || u.protocol === 'https:') return url;
  } catch { /* fall through */ }
  return '#';
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}

function faviconUrl(url: string): string {
  try {
    const { hostname } = new URL(url);
    return `https://www.google.com/s2/favicons?domain=${hostname}&sz=16`;
  } catch { return ''; }
}

function getDomain(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

function titleFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const segments = u.pathname.split('/').filter(Boolean);
    const last = segments[segments.length - 1];
    if (last) {
      return decodeURIComponent(last)
        .replace(/\.[^.]+$/, '')
        .replace(/[-_]/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase());
    }
    return u.hostname.replace(/^www\./, '');
  } catch { return ''; }
}

async function fetchPageTitle(url: string): Promise<string> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);
    const resp = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    const html = await resp.text();
    const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (match && match[1].trim()) return match[1].trim().replace(/\s+/g, ' ').slice(0, 200);
  } catch { /* CORS or network error */ }
  return titleFromUrl(url);
}

// ---- Tooltip ----

let tooltipShowTimer: number | null = null;
let tooltipHideTimer: number | null = null;

function cancelTooltipTimers(): void {
  if (tooltipShowTimer) { clearTimeout(tooltipShowTimer); tooltipShowTimer = null; }
  if (tooltipHideTimer) { clearTimeout(tooltipHideTimer); tooltipHideTimer = null; }
}

function scheduleHideTooltip(): void {
  if (tooltipShowTimer) { clearTimeout(tooltipShowTimer); tooltipShowTimer = null; }
  tooltipHideTimer = window.setTimeout(() => {
    el('bookmark-tooltip').classList.add('hidden');
  }, 150);
}

function scheduleShowTooltip(bm: Bookmark, cardEl: HTMLElement): void {
  cancelTooltipTimers();
  tooltipShowTimer = window.setTimeout(() => {
    const tooltip = el('bookmark-tooltip');
    const folder = bm.folder_id ? getFolder(bm.folder_id) : null;

    let html = `<div class="tooltip-url">${escapeHtml(bm.url)}</div>`;
    if (bm.description) {
      html += `<div class="tooltip-field"><span class="tooltip-label">Description</span>${escapeHtml(bm.description)}</div>`;
    }
    if (folder) {
      html += `<div class="tooltip-field"><span class="tooltip-label">Folder</span>${escapeHtml(folder.name)}</div>`;
    }
    if (bm.tags.length > 0) {
      html += `<div class="tooltip-tags">${bm.tags.map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('')}</div>`;
    }
    if (bm.notes.trim()) {
      const notes = bm.notes.length > 200 ? bm.notes.slice(0, 200) + '…' : bm.notes;
      html += `<div class="tooltip-field tooltip-notes"><span class="tooltip-label">Notes</span>${escapeHtml(notes)}</div>`;
    }
    html += `<div class="tooltip-meta">Created ${relativeTime(bm.created_at)} · Opened ${bm.access_count} time${bm.access_count !== 1 ? 's' : ''}</div>`;

    tooltip.innerHTML = html;

    const rect = cardEl.getBoundingClientRect();
    tooltip.classList.remove('hidden');
    const tRect = tooltip.getBoundingClientRect();

    tooltip.style.left = `${rect.right - tRect.width}px`;
    tooltip.style.top = `${rect.bottom + 4}px`;

    if (tRect.bottom + rect.bottom + 4 - rect.top > window.innerHeight) {
      tooltip.style.top = `${rect.top - tRect.height - 4}px`;
    }
    if (rect.right - tRect.width < 0) {
      tooltip.style.left = '8px';
    }
  }, 300);
}

// ---- Render ----

function createFolderItem(folder: Folder, isArchive = false): HTMLLIElement {
  const count = bookmarkCountInFolder(folder.id);
  const li = document.createElement('li');
  li.className = 'folder-item' + (selectedFolderId === folder.id ? ' active' : '') + (isArchive ? ' folder-archive' : '');
  li.dataset.id = folder.id;

  if (isArchive) {
    li.innerHTML = `
      <span class="folder-name" title="${escapeHtml(folder.name)}">📦 ${escapeHtml(folder.name)}</span>
      <span class="folder-count">${count}</span>
    `;
  } else {
    li.innerHTML = `
      <span class="folder-name" title="${escapeHtml(folder.name)}">${escapeHtml(folder.name)}</span>
      <span class="folder-count">${count}</span>
      <span class="folder-actions">
        <button class="btn-rename" title="Rename">✎</button>
        <button class="btn-del-folder" title="Delete">✕</button>
      </span>
    `;
    li.querySelector('.btn-rename')?.addEventListener('click', (e) => {
      e.stopPropagation();
      openFolderModal(folder);
    });
    li.querySelector('.btn-del-folder')?.addEventListener('click', (e) => {
      e.stopPropagation();
      confirmDelete(
        `Delete folder "${folder.name}"? Its bookmarks will become unfiled.`,
        async () => {
          await deleteFolder(folder.id);
          if (selectedFolderId === folder.id) selectedFolderId = null;
          renderAll();
        }
      );
    });
  }

  li.addEventListener('click', () => selectFolder(folder.id));
  return li;
}

export function renderFolders(): void {
  const list = el<HTMLUListElement>('folder-list');
  list.innerHTML = '';

  // All Bookmarks
  const allItem = document.createElement('li');
  allItem.className = 'folder-item folder-all' + (selectedFolderId === null ? ' active' : '');
  allItem.innerHTML = `
    <span class="folder-name">All Bookmarks</span>
    <span class="folder-count">${bookmarks.length}</span>
  `;
  allItem.addEventListener('click', () => selectFolder(null));
  list.appendChild(allItem);

  const archive = getArchiveFolder();
  const sorted = sortedFolders(folderSortMode);
  // Render non-archive folders first, archive last
  const regularFolders = sorted.filter(f => f.id !== archive?.id);
  const archiveFolder = sorted.find(f => f.id === archive?.id);

  for (const folder of regularFolders) {
    list.appendChild(createFolderItem(folder));
  }

  if (archiveFolder) {
    const sep = document.createElement('li');
    sep.className = 'folder-separator';
    list.appendChild(sep);
    list.appendChild(createFolderItem(archiveFolder, true));
  }
}

export function renderBookmarks(): void {
  const container = el('bookmark-list');

  // Update header title
  if (selectedFolderId === null) {
    el('current-folder-name').textContent = 'All Bookmarks';
  } else {
    el('current-folder-name').textContent = getFolder(selectedFolderId)?.name ?? 'Unknown';
  }

  const list = sortedBookmarks(selectedFolderId, searchQuery);

  const openAllBtn = el('btn-open-all');
  if (selectedFolderId && list.length > 0) {
    openAllBtn.classList.remove('hidden');
  } else {
    openAllBtn.classList.add('hidden');
  }

  if (list.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="icon">🔖</div>
        <p>${searchQuery
          ? 'No bookmarks match your search.'
          : 'No bookmarks here yet.<br>Click <strong>+ Add Bookmark</strong> to get started.'
        }</p>
      </div>
    `;
    return;
  }

  container.innerHTML = '';
  for (const bm of list) {
    container.appendChild(createBookmarkCard(bm));
  }
}

function createBookmarkCard(bm: Bookmark): HTMLElement {
  const card = document.createElement('div');
  card.className = 'bookmark-card';
  card.dataset.id = bm.id;

  const favicon = faviconUrl(bm.url);
  const faviconHtml = favicon
    ? `<img class="bookmark-favicon" src="${escapeHtml(favicon)}" onerror="this.style.display='none'" alt="">`
    : '';
  const domain    = getDomain(bm.url);
  const hasNotes  = bm.notes.trim().length > 0;

  card.innerHTML = `
    <div class="card-row">
      ${faviconHtml}
      ${hasNotes ? `<button class="btn-notes-toggle" title="Toggle notes">📝</button>` : ''}
      <a class="bookmark-title" href="${escapeHtml(safeUrl(bm.url))}" rel="noopener noreferrer" title="${escapeHtml(bm.title)}">${escapeHtml(bm.title)}</a>
      ${domain ? `<span class="bookmark-domain" title="${escapeHtml(bm.url)}">${escapeHtml(domain)}</span>` : ''}
      <span class="bookmark-time" title="Last accessed: ${bm.last_accessed}">${relativeTime(bm.last_accessed)}</span>
      <div class="card-actions">
        <button class="btn-action btn-open" title="Open link">↗</button>
        <button class="btn-action btn-edit" title="Edit">✎</button>
        <button class="btn-action btn-del" title="Delete">✕</button>
      </div>
    </div>
    ${hasNotes ? `<div class="notes-body">${escapeHtml(bm.notes)}</div>` : ''}`;

  const open = async () => {
    const url = await openBookmark(bm.id);
    window.open(url, '_blank', 'noopener,noreferrer');
    renderAll();
  };
  card.querySelector('.btn-open')?.addEventListener('click', open);
  card.querySelector('.bookmark-title')?.addEventListener('click', (e) => { e.preventDefault(); open(); });
  card.querySelector('.btn-edit')?.addEventListener('click', () => openBookmarkModal(bm));
  card.querySelector('.btn-del')?.addEventListener('click', () =>
    confirmDelete(`Delete "${bm.title}"?`, async () => { await deleteBookmark(bm.id); renderAll(); })
  );
  card.querySelector('.btn-notes-toggle')?.addEventListener('click', () =>
    card.querySelector('.notes-body')?.classList.toggle('open')
  );

  card.addEventListener('mouseenter', () => scheduleShowTooltip(bm, card));
  card.addEventListener('mouseleave', scheduleHideTooltip);

  return card;
}

export function renderAll(): void {
  renderFolders();
  renderBookmarks();
}

function selectFolder(id: string | null): void {
  selectedFolderId = id;
  searchQuery = '';
  (el('search-input') as HTMLInputElement).value = '';
  renderAll();
}

// ---- Modals ----

function openModal(id: string): void { el(id).classList.remove('hidden'); }
function closeModal(id: string): void { el(id).classList.add('hidden'); }

export function openBookmarkModal(bm?: Bookmark): void {
  el('modal-bookmark-title').textContent = bm ? 'Edit Bookmark' : 'Add Bookmark';
  (el('bm-id') as HTMLInputElement).value = bm?.id ?? '';
  (el('bm-url') as HTMLInputElement).value = bm?.url ?? '';
  (el('bm-title') as HTMLInputElement).value = bm?.title ?? '';
  (el('bm-description') as HTMLInputElement).value = bm?.description ?? '';
  (el('bm-notes') as HTMLTextAreaElement).value = bm?.notes ?? '';
  (el('bm-tags') as HTMLInputElement).value = bm?.tags?.join(', ') ?? '';

  const select = el<HTMLSelectElement>('bm-folder');
  select.innerHTML = '<option value="">— No folder —</option>';
  for (const folder of sortedFolders()) {
    const opt = document.createElement('option');
    opt.value = folder.id;
    opt.textContent = folder.name;
    if ((bm?.folder_id ?? selectedFolderId ?? '') === folder.id) opt.selected = true;
    select.appendChild(opt);
  }

  el('bm-duplicate-warning').classList.add('hidden');
  openModal('modal-bookmark');
  (el('bm-url') as HTMLInputElement).focus();
}

export function openFolderModal(folder?: Folder): void {
  el('modal-folder-title').textContent = folder ? 'Rename Folder' : 'Add Folder';
  (el('folder-id') as HTMLInputElement).value = folder?.id ?? '';
  (el('folder-name') as HTMLInputElement).value = folder?.name ?? '';
  openModal('modal-folder');
  (el('folder-name') as HTMLInputElement).focus();
}

function confirmDelete(message: string, callback: () => Promise<void>): void {
  el('confirm-message').textContent = message;
  confirmCallback = callback;
  openModal('modal-confirm');
}

// ---- Duplicate check ----

function checkDuplicateUrl(url: string, excludeId?: string): void {
  const warning = el('bm-duplicate-warning');
  const existing = findBookmarkByUrl(url, excludeId || undefined);
  if (existing) {
    const folder = existing.folder_id ? getFolder(existing.folder_id) : null;
    const folderText = folder ? ` in <span class="dup-folder">${escapeHtml(folder.name)}</span>` : '';
    warning.innerHTML = `Already bookmarked as <strong>${escapeHtml(existing.title)}</strong>${folderText}`;
    warning.classList.remove('hidden');
  } else {
    warning.classList.add('hidden');
  }
}

// ---- Form handlers ----

async function handleBookmarkSubmit(e: Event): Promise<void> {
  e.preventDefault();
  const id     = (el('bm-id') as HTMLInputElement).value;
  const urlVal = (el('bm-url') as HTMLInputElement).value.trim();

  if (!id) {
    const existing = findBookmarkByUrl(urlVal);
    if (existing) {
      const folder = existing.folder_id ? getFolder(existing.folder_id) : null;
      const where = folder ? ` in "${folder.name}"` : '';
      if (!confirm(`This URL is already bookmarked as "${existing.title}"${where}.\n\nAdd it anyway?`)) return;
    }
  }

  let   title  = (el('bm-title') as HTMLInputElement).value.trim();
  if (!title) title = await fetchPageTitle(urlVal) || getDomain(urlVal) || urlVal;
  const data = {
    url:         urlVal,
    title,
    description: (el('bm-description') as HTMLInputElement).value.trim(),
    notes:       (el('bm-notes') as HTMLTextAreaElement).value,
    folder_id:   (el('bm-folder') as HTMLSelectElement).value,
    tags:        (el('bm-tags') as HTMLInputElement).value
                   .split(',').map(t => t.trim()).filter(Boolean),
  };
  if (id) { await updateBookmark(id, data); } else { await addBookmark(data); }
  closeModal('modal-bookmark');
  renderAll();
}

async function handleFolderSubmit(e: Event): Promise<void> {
  e.preventDefault();
  const id   = (el('folder-id') as HTMLInputElement).value;
  const name = (el('folder-name') as HTMLInputElement).value.trim();
  if (!name) return;
  if (id) {
    await updateFolder(id, { name });
  } else {
    await addFolder(name);
  }
  closeModal('modal-folder');
  renderAll();
}

// ---- Init ----

export function initUI(): void {
  el('btn-add-bookmark').addEventListener('click', () => openBookmarkModal());
  el('btn-add-folder').addEventListener('click', () => openFolderModal());

  el('bookmark-tooltip').addEventListener('mouseenter', () => {
    if (tooltipHideTimer) { clearTimeout(tooltipHideTimer); tooltipHideTimer = null; }
  });
  el('bookmark-tooltip').addEventListener('mouseleave', scheduleHideTooltip);

  el('folder-sort').addEventListener('change', (e) => {
    folderSortMode = (e.target as HTMLSelectElement).value as FolderSortMode;
    renderFolders();
  });
  // btn-change-folder is wired in main.ts to preserve the user-gesture flow

  el('btn-open-all').addEventListener('click', async () => {
    if (!selectedFolderId) return;
    const list = sortedBookmarks(selectedFolderId, searchQuery);
    if (list.length === 0) return;
    if (list.length > 10 && !confirm(`Open ${list.length} bookmarks in new tabs?`)) return;
    for (const bm of list) {
      window.open(bm.url, '_blank', 'noopener,noreferrer');
    }
    await openAllBookmarks(list.map(b => b.id));
    renderAll();
  });

  el('btn-import').addEventListener('click', () => el<HTMLInputElement>('import-file').click());

  el('import-file').addEventListener('change', async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const html = await file.text();
    const parsed = parseNetscapeBookmarks(html);
    if (parsed.length === 0) {
      alert('No bookmarks found in the selected file.');
      (el('import-file') as HTMLInputElement).value = '';
      return;
    }
    const { bookmarkCount, folderCount } = await importFromNetscape(parsed);
    renderAll();
    alert(`Imported ${bookmarkCount} bookmark${bookmarkCount !== 1 ? 's' : ''} and created ${folderCount} new folder${folderCount !== 1 ? 's' : ''}.`);
    (el('import-file') as HTMLInputElement).value = '';
  });

  el('btn-export').addEventListener('click', () => {
    if (bookmarks.length === 0) {
      alert('No bookmarks to export.');
      return;
    }
    const html = exportNetscapeBookmarks(bookmarks, sortedFolders());
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'bookmarks.html';
    a.click();
    URL.revokeObjectURL(url);
  });

  el('search-input').addEventListener('input', (e) => {
    searchQuery = (e.target as HTMLInputElement).value;
    renderBookmarks();
  });

  el('form-bookmark').addEventListener('submit', handleBookmarkSubmit);
  el('form-folder').addEventListener('submit', handleFolderSubmit);

  // Auto-fetch page title on URL blur (only when title field is empty)
  // + check for duplicate URL
  el('bm-url').addEventListener('blur', async () => {
    const url     = (el('bm-url') as HTMLInputElement).value.trim();
    const editId  = (el('bm-id') as HTMLInputElement).value;

    checkDuplicateUrl(url, editId);

    const titleEl = el('bm-title') as HTMLInputElement;
    if (!url || titleEl.value.trim()) return;
    const orig = titleEl.placeholder;
    titleEl.placeholder = 'Fetching title…';
    titleEl.disabled = true;
    const title = await fetchPageTitle(url);
    titleEl.disabled = false;
    titleEl.placeholder = orig;
    if (title && !titleEl.value.trim()) titleEl.value = title;
  });

  // Close buttons (data-modal attribute)
  document.querySelectorAll<HTMLElement>('.modal-close').forEach(btn => {
    const modalId = btn.dataset.modal;
    if (modalId) btn.addEventListener('click', () => closeModal(modalId));
  });

  // Close on backdrop click
  document.querySelectorAll<HTMLElement>('.modal').forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.add('hidden');
    });
  });

  // Confirm dialog
  el('confirm-cancel').addEventListener('click', () => closeModal('modal-confirm'));
  el('confirm-ok').addEventListener('click', async () => {
    closeModal('modal-confirm');
    if (confirmCallback) {
      await confirmCallback();
      confirmCallback = null;
    }
  });

  // ESC closes any open modal
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.querySelectorAll<HTMLElement>('.modal:not(.hidden)').forEach(m =>
        m.classList.add('hidden')
      );
    }
  });
}
