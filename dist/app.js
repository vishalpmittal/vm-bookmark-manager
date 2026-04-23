"use strict";
(() => {
  // src/csv.ts
  function parseCSV(text) {
    const rows = [];
    const len = text.length;
    let i = 0;
    while (i < len) {
      const row = [];
      while (i < len) {
        let field = "";
        if (text[i] === '"') {
          i++;
          while (i < len) {
            if (text[i] === '"') {
              if (i + 1 < len && text[i + 1] === '"') {
                field += '"';
                i += 2;
              } else {
                i++;
                break;
              }
            } else {
              field += text[i];
              i++;
            }
          }
        } else {
          while (i < len && text[i] !== "," && text[i] !== "\r" && text[i] !== "\n") {
            field += text[i];
            i++;
          }
        }
        row.push(field);
        if (i < len && text[i] === ",") {
          i++;
        } else {
          break;
        }
      }
      if (i < len && text[i] === "\r")
        i++;
      if (i < len && text[i] === "\n")
        i++;
      if (row.length > 0 && !(row.length === 1 && row[0] === "")) {
        rows.push(row);
      }
    }
    return rows;
  }
  function quoteField(field) {
    if (field.includes(",") || field.includes('"') || field.includes("\r") || field.includes("\n")) {
      return '"' + field.replace(/"/g, '""') + '"';
    }
    return field;
  }
  function serializeCSV(rows) {
    return rows.map((row) => row.map(quoteField).join(",")).join("\r\n") + "\r\n";
  }

  // src/storage.ts
  var DB_NAME = "vm_bookmarks_db";
  var DB_VERSION = 1;
  var STORE_NAME = "handles";
  var dirHandle = null;
  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async function loadDirHandle() {
    try {
      const db = await openDB();
      return new Promise((resolve) => {
        const tx = db.transaction(STORE_NAME, "readonly");
        const req = tx.objectStore(STORE_NAME).get("dir");
        req.onsuccess = () => resolve(req.result ?? null);
        req.onerror = () => resolve(null);
      });
    } catch {
      return null;
    }
  }
  async function saveDirHandle(handle) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put(handle, "dir");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
  async function initStorage(forceNew = false) {
    if (!("showDirectoryPicker" in window)) {
      throw new Error(
        "File System Access API is not supported. Please use Chrome or Edge 90+."
      );
    }
    if (!forceNew) {
      const stored = await loadDirHandle();
      if (stored) {
        try {
          const perm = await stored.requestPermission({ mode: "readwrite" });
          if (perm === "granted") {
            dirHandle = stored;
            return;
          }
        } catch {
        }
      }
    }
    dirHandle = await window.showDirectoryPicker({ mode: "readwrite" });
    await saveDirHandle(dirHandle);
  }
  async function readFile(name) {
    if (!dirHandle)
      throw new Error("Storage not initialized");
    try {
      const fh = await dirHandle.getFileHandle(name);
      const file = await fh.getFile();
      return await file.text();
    } catch {
      return "";
    }
  }
  async function writeFile(name, content) {
    if (!dirHandle)
      throw new Error("Storage not initialized");
    const fh = await dirHandle.getFileHandle(name, { create: true });
    const writable = await fh.createWritable();
    await writable.write(content);
    await writable.close();
  }
  var BM_HEADER = [
    "id",
    "url",
    "title",
    "description",
    "notes",
    "folder_id",
    "tags",
    "created_at",
    "last_accessed",
    "access_count"
  ];
  function rowToBookmark(row) {
    return {
      id: row[0],
      url: row[1],
      title: row[2],
      description: row[3],
      notes: row[4],
      folder_id: row[5],
      tags: row[6] ? row[6].split("|").filter(Boolean) : [],
      created_at: row[7],
      last_accessed: row[8],
      access_count: parseInt(row[9], 10) || 0
    };
  }
  function bookmarkToRow(b) {
    return [
      b.id,
      b.url,
      b.title,
      b.description,
      b.notes,
      b.folder_id,
      b.tags.join("|"),
      b.created_at,
      b.last_accessed,
      String(b.access_count)
    ];
  }
  async function loadBookmarks() {
    const text = await readFile("bookmarks.csv");
    if (!text.trim())
      return [];
    const rows = parseCSV(text);
    return rows.slice(1).filter((r) => r.length >= 10 && r[0]).map(rowToBookmark);
  }
  async function saveBookmarks(bookmarks2) {
    await writeFile("bookmarks.csv", serializeCSV([BM_HEADER, ...bookmarks2.map(bookmarkToRow)]));
  }
  var FOLDER_HEADER = ["id", "name", "parent_id", "created_at", "last_accessed", "access_count"];
  function rowToFolder(row) {
    return {
      id: row[0],
      name: row[1],
      parent_id: row[2],
      created_at: row[3],
      last_accessed: row[4],
      access_count: parseInt(row[5], 10) || 0
    };
  }
  function folderToRow(f) {
    return [f.id, f.name, f.parent_id, f.created_at, f.last_accessed, String(f.access_count)];
  }
  async function loadFolders() {
    const text = await readFile("folders.csv");
    if (!text.trim())
      return [];
    const rows = parseCSV(text);
    return rows.slice(1).filter((r) => r.length >= 6 && r[0]).map(rowToFolder);
  }
  async function saveFolders(folders2) {
    await writeFile("folders.csv", serializeCSV([FOLDER_HEADER, ...folders2.map(folderToRow)]));
  }

  // src/store.ts
  var ARCHIVE_FOLDER_NAME = "Archive";
  var STALE_DAYS = 90;
  var bookmarks = [];
  var folders = [];
  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }
  function sortedFolders(mode = "most-used") {
    return [...folders].sort((a, b) => {
      switch (mode) {
        case "a-z":
          return a.name.localeCompare(b.name, void 0, { sensitivity: "base" });
        case "least-used":
          if (a.access_count !== b.access_count)
            return a.access_count - b.access_count;
          return a.last_accessed.localeCompare(b.last_accessed);
        default:
          if (b.access_count !== a.access_count)
            return b.access_count - a.access_count;
          return b.last_accessed.localeCompare(a.last_accessed);
      }
    });
  }
  function sortedBookmarks(folder_id, query) {
    let list = bookmarks;
    if (folder_id) {
      list = list.filter((b) => b.folder_id === folder_id);
    }
    if (query && query.trim()) {
      const q = query.toLowerCase();
      list = list.filter(
        (b) => b.title.toLowerCase().includes(q) || b.url.toLowerCase().includes(q) || b.description.toLowerCase().includes(q) || b.notes.toLowerCase().includes(q) || b.tags.some((t) => t.toLowerCase().includes(q))
      );
    }
    return [...list].sort((a, b) => b.last_accessed.localeCompare(a.last_accessed));
  }
  function getArchiveFolder() {
    return folders.find((f) => f.name === ARCHIVE_FOLDER_NAME);
  }
  async function ensureArchiveFolder() {
    let archive = getArchiveFolder();
    if (!archive) {
      const now = (/* @__PURE__ */ new Date()).toISOString();
      archive = {
        id: generateId(),
        name: ARCHIVE_FOLDER_NAME,
        parent_id: "",
        created_at: now,
        last_accessed: now,
        access_count: 0
      };
      folders.push(archive);
      await saveFolders(folders);
    }
    return archive;
  }
  async function archiveStaleBookmarks() {
    const archive = await ensureArchiveFolder();
    const cutoff = Date.now() - STALE_DAYS * 24 * 60 * 60 * 1e3;
    let count = 0;
    for (const bm of bookmarks) {
      if (bm.folder_id === archive.id)
        continue;
      if (new Date(bm.last_accessed).getTime() >= cutoff)
        continue;
      const srcFolder = folders.find((f) => f.id === bm.folder_id);
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
  async function loadAll() {
    [bookmarks, folders] = await Promise.all([loadBookmarks(), loadFolders()]);
  }
  async function addBookmark(data) {
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const bm = { ...data, id: generateId(), created_at: now, last_accessed: now, access_count: 0 };
    bookmarks.push(bm);
    await saveBookmarks(bookmarks);
    return bm;
  }
  async function updateBookmark(id, data) {
    const idx = bookmarks.findIndex((b) => b.id === id);
    if (idx === -1)
      return;
    bookmarks[idx] = { ...bookmarks[idx], ...data };
    await saveBookmarks(bookmarks);
  }
  async function deleteBookmark(id) {
    bookmarks = bookmarks.filter((b) => b.id !== id);
    await saveBookmarks(bookmarks);
  }
  async function openBookmark(id) {
    const bm = bookmarks.find((b) => b.id === id);
    if (!bm)
      return "";
    const now = (/* @__PURE__ */ new Date()).toISOString();
    bm.last_accessed = now;
    bm.access_count++;
    const folder = folders.find((f) => f.id === bm.folder_id);
    if (folder) {
      folder.last_accessed = now;
      folder.access_count++;
      await saveFolders(folders);
    }
    await saveBookmarks(bookmarks);
    return bm.url;
  }
  async function addFolder(name) {
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const folder = {
      id: generateId(),
      name,
      parent_id: "",
      created_at: now,
      last_accessed: now,
      access_count: 0
    };
    folders.push(folder);
    await saveFolders(folders);
    return folder;
  }
  async function updateFolder(id, data) {
    const idx = folders.findIndex((f) => f.id === id);
    if (idx === -1)
      return;
    folders[idx] = { ...folders[idx], ...data };
    await saveFolders(folders);
  }
  async function deleteFolder(id) {
    folders = folders.filter((f) => f.id !== id);
    bookmarks = bookmarks.map((b) => b.folder_id === id ? { ...b, folder_id: "" } : b);
    await Promise.all([saveFolders(folders), saveBookmarks(bookmarks)]);
  }
  async function importFromNetscape(imported) {
    let newFolderCount = 0;
    const folderMap = /* @__PURE__ */ new Map();
    for (const f of folders)
      folderMap.set(f.name, f.id);
    for (const name of new Set(imported.map((b) => b.folderName).filter(Boolean))) {
      if (!folderMap.has(name)) {
        const now = (/* @__PURE__ */ new Date()).toISOString();
        const folder = {
          id: generateId(),
          name,
          parent_id: "",
          created_at: now,
          last_accessed: now,
          access_count: 0
        };
        folders.push(folder);
        folderMap.set(name, folder.id);
        newFolderCount++;
      }
    }
    for (const item of imported) {
      const created = new Date(item.addDate * 1e3).toISOString();
      bookmarks.push({
        id: generateId(),
        url: item.url,
        title: item.title,
        description: "",
        notes: "",
        folder_id: item.folderName ? folderMap.get(item.folderName) || "" : "",
        tags: [],
        created_at: created,
        last_accessed: created,
        access_count: 0
      });
    }
    await Promise.all([saveBookmarks(bookmarks), saveFolders(folders)]);
    return { bookmarkCount: imported.length, folderCount: newFolderCount };
  }
  function getFolder(id) {
    return folders.find((f) => f.id === id);
  }
  function bookmarkCountInFolder(folder_id) {
    return bookmarks.filter((b) => b.folder_id === folder_id).length;
  }
  function findBookmarkByUrl(url, excludeId) {
    const normalized = url.trim().replace(/\/+$/, "").toLowerCase();
    if (!normalized)
      return void 0;
    return bookmarks.find(
      (b) => b.url.trim().replace(/\/+$/, "").toLowerCase() === normalized && b.id !== excludeId
    );
  }

  // src/netscape.ts
  function decodeEntities(s) {
    const el2 = document.createElement("textarea");
    el2.innerHTML = s;
    return el2.value;
  }
  function escapeHtml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function parseNetscapeBookmarks(html) {
    const results = [];
    const folderStack = [];
    const folderDepths = [];
    let depth = 0;
    let pendingFolder = null;
    const pattern = /<(\/?)DL[^>]*>|<H3[^>]*>([^<]*)<\/H3>|<A\s+([^>]+)>([^<]*)<\/A>/gi;
    let m;
    while ((m = pattern.exec(html)) !== null) {
      if (m[2] !== void 0) {
        pendingFolder = decodeEntities(m[2].trim());
      } else if (m[3] !== void 0) {
        const attrs = m[3];
        const title = decodeEntities((m[4] ?? "").trim());
        const hrefMatch = attrs.match(/HREF="([^"]*)"/i);
        const dateMatch = attrs.match(/ADD_DATE="(\d+)"/i);
        if (hrefMatch) {
          const url = hrefMatch[1];
          if (url.startsWith("javascript:") || url.startsWith("place:"))
            continue;
          results.push({
            url,
            title: title || url,
            addDate: dateMatch ? parseInt(dateMatch[1], 10) : Math.floor(Date.now() / 1e3),
            folderName: folderStack.length > 0 ? folderStack[folderStack.length - 1] : ""
          });
        }
      } else {
        if (m[1] === "/") {
          if (folderDepths.length > 0 && folderDepths[folderDepths.length - 1] === depth) {
            folderStack.pop();
            folderDepths.pop();
          }
          depth--;
        } else {
          depth++;
          if (pendingFolder !== null) {
            folderStack.push(pendingFolder);
            folderDepths.push(depth);
            pendingFolder = null;
          }
        }
      }
    }
    return results;
  }
  function exportNetscapeBookmarks(bms, flds) {
    const lines = [
      "<!DOCTYPE NETSCAPE-Bookmark-file-1>",
      '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
      "<TITLE>Bookmarks</TITLE>",
      "<H1>Bookmarks</H1>",
      "<DL><p>"
    ];
    const byFolder = /* @__PURE__ */ new Map();
    for (const bm of bms) {
      const key = bm.folder_id || "";
      if (!byFolder.has(key))
        byFolder.set(key, []);
      byFolder.get(key).push(bm);
    }
    for (const folder of flds) {
      const addDate = Math.floor(new Date(folder.created_at).getTime() / 1e3);
      const lastMod = Math.floor(new Date(folder.last_accessed).getTime() / 1e3);
      lines.push(`    <DT><H3 ADD_DATE="${addDate}" LAST_MODIFIED="${lastMod}">${escapeHtml(folder.name)}</H3>`);
      lines.push("    <DL><p>");
      for (const bm of byFolder.get(folder.id) || []) {
        const bmDate = Math.floor(new Date(bm.created_at).getTime() / 1e3);
        lines.push(`        <DT><A HREF="${escapeHtml(bm.url)}" ADD_DATE="${bmDate}">${escapeHtml(bm.title)}</A>`);
      }
      lines.push("    </DL><p>");
      byFolder.delete(folder.id);
    }
    for (const bm of byFolder.get("") || []) {
      const bmDate = Math.floor(new Date(bm.created_at).getTime() / 1e3);
      lines.push(`    <DT><A HREF="${escapeHtml(bm.url)}" ADD_DATE="${bmDate}">${escapeHtml(bm.title)}</A>`);
    }
    lines.push("</DL><p>");
    return lines.join("\n");
  }

  // src/ui.ts
  var selectedFolderId = null;
  var searchQuery = "";
  var folderSortMode = "most-used";
  var confirmCallback = null;
  function el(id) {
    return document.getElementById(id);
  }
  function escapeHtml2(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function safeUrl(url) {
    try {
      const u = new URL(url);
      if (u.protocol === "http:" || u.protocol === "https:")
        return url;
    } catch {
    }
    return "#";
  }
  function relativeTime(iso) {
    const diff = Date.now() - new Date(iso).getTime();
    const min = Math.floor(diff / 6e4);
    if (min < 1)
      return "just now";
    if (min < 60)
      return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24)
      return `${hr}h ago`;
    const d = Math.floor(hr / 24);
    if (d < 30)
      return `${d}d ago`;
    const mo = Math.floor(d / 30);
    if (mo < 12)
      return `${mo}mo ago`;
    return `${Math.floor(mo / 12)}y ago`;
  }
  function faviconUrl(url) {
    try {
      const { hostname } = new URL(url);
      return `https://www.google.com/s2/favicons?domain=${hostname}&sz=16`;
    } catch {
      return "";
    }
  }
  function getDomain(url) {
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch {
      return "";
    }
  }
  function titleFromUrl(url) {
    try {
      const u = new URL(url);
      const segments = u.pathname.split("/").filter(Boolean);
      const last = segments[segments.length - 1];
      if (last) {
        return decodeURIComponent(last).replace(/\.[^.]+$/, "").replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      }
      return u.hostname.replace(/^www\./, "");
    } catch {
      return "";
    }
  }
  async function fetchPageTitle(url) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 4e3);
      const resp = await fetch(url, { signal: ctrl.signal });
      clearTimeout(timer);
      const html = await resp.text();
      const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      if (match && match[1].trim())
        return match[1].trim().replace(/\s+/g, " ").slice(0, 200);
    } catch {
    }
    return titleFromUrl(url);
  }
  var tooltipShowTimer = null;
  var tooltipHideTimer = null;
  function cancelTooltipTimers() {
    if (tooltipShowTimer) {
      clearTimeout(tooltipShowTimer);
      tooltipShowTimer = null;
    }
    if (tooltipHideTimer) {
      clearTimeout(tooltipHideTimer);
      tooltipHideTimer = null;
    }
  }
  function scheduleHideTooltip() {
    if (tooltipShowTimer) {
      clearTimeout(tooltipShowTimer);
      tooltipShowTimer = null;
    }
    tooltipHideTimer = window.setTimeout(() => {
      el("bookmark-tooltip").classList.add("hidden");
    }, 150);
  }
  function scheduleShowTooltip(bm, cardEl) {
    cancelTooltipTimers();
    tooltipShowTimer = window.setTimeout(() => {
      const tooltip = el("bookmark-tooltip");
      const folder = bm.folder_id ? getFolder(bm.folder_id) : null;
      let html = `<div class="tooltip-url">${escapeHtml2(bm.url)}</div>`;
      if (bm.description) {
        html += `<div class="tooltip-field"><span class="tooltip-label">Description</span>${escapeHtml2(bm.description)}</div>`;
      }
      if (folder) {
        html += `<div class="tooltip-field"><span class="tooltip-label">Folder</span>${escapeHtml2(folder.name)}</div>`;
      }
      if (bm.tags.length > 0) {
        html += `<div class="tooltip-tags">${bm.tags.map((t) => `<span class="tag">${escapeHtml2(t)}</span>`).join("")}</div>`;
      }
      if (bm.notes.trim()) {
        const notes = bm.notes.length > 200 ? bm.notes.slice(0, 200) + "\u2026" : bm.notes;
        html += `<div class="tooltip-field tooltip-notes"><span class="tooltip-label">Notes</span>${escapeHtml2(notes)}</div>`;
      }
      html += `<div class="tooltip-meta">Created ${relativeTime(bm.created_at)} \xB7 Opened ${bm.access_count} time${bm.access_count !== 1 ? "s" : ""}</div>`;
      tooltip.innerHTML = html;
      const rect = cardEl.getBoundingClientRect();
      tooltip.classList.remove("hidden");
      const tRect = tooltip.getBoundingClientRect();
      tooltip.style.left = `${rect.right - tRect.width}px`;
      tooltip.style.top = `${rect.bottom + 4}px`;
      if (tRect.bottom + rect.bottom + 4 - rect.top > window.innerHeight) {
        tooltip.style.top = `${rect.top - tRect.height - 4}px`;
      }
      if (rect.right - tRect.width < 0) {
        tooltip.style.left = "8px";
      }
    }, 300);
  }
  function createFolderItem(folder, isArchive = false) {
    var _a, _b;
    const count = bookmarkCountInFolder(folder.id);
    const li = document.createElement("li");
    li.className = "folder-item" + (selectedFolderId === folder.id ? " active" : "") + (isArchive ? " folder-archive" : "");
    li.dataset.id = folder.id;
    if (isArchive) {
      li.innerHTML = `
      <span class="folder-name" title="${escapeHtml2(folder.name)}">\u{1F4E6} ${escapeHtml2(folder.name)}</span>
      <span class="folder-count">${count}</span>
    `;
    } else {
      li.innerHTML = `
      <span class="folder-name" title="${escapeHtml2(folder.name)}">${escapeHtml2(folder.name)}</span>
      <span class="folder-count">${count}</span>
      <span class="folder-actions">
        <button class="btn-rename" title="Rename">\u270E</button>
        <button class="btn-del-folder" title="Delete">\u2715</button>
      </span>
    `;
      (_a = li.querySelector(".btn-rename")) == null ? void 0 : _a.addEventListener("click", (e) => {
        e.stopPropagation();
        openFolderModal(folder);
      });
      (_b = li.querySelector(".btn-del-folder")) == null ? void 0 : _b.addEventListener("click", (e) => {
        e.stopPropagation();
        confirmDelete(
          `Delete folder "${folder.name}"? Its bookmarks will become unfiled.`,
          async () => {
            await deleteFolder(folder.id);
            if (selectedFolderId === folder.id)
              selectedFolderId = null;
            renderAll();
          }
        );
      });
    }
    li.addEventListener("click", () => selectFolder(folder.id));
    return li;
  }
  function renderFolders() {
    const list = el("folder-list");
    list.innerHTML = "";
    const allItem = document.createElement("li");
    allItem.className = "folder-item folder-all" + (selectedFolderId === null ? " active" : "");
    allItem.innerHTML = `
    <span class="folder-name">All Bookmarks</span>
    <span class="folder-count">${bookmarks.length}</span>
  `;
    allItem.addEventListener("click", () => selectFolder(null));
    list.appendChild(allItem);
    const archive = getArchiveFolder();
    const sorted = sortedFolders(folderSortMode);
    const regularFolders = sorted.filter((f) => f.id !== (archive == null ? void 0 : archive.id));
    const archiveFolder = sorted.find((f) => f.id === (archive == null ? void 0 : archive.id));
    for (const folder of regularFolders) {
      list.appendChild(createFolderItem(folder));
    }
    if (archiveFolder) {
      const sep = document.createElement("li");
      sep.className = "folder-separator";
      list.appendChild(sep);
      list.appendChild(createFolderItem(archiveFolder, true));
    }
  }
  function renderBookmarks() {
    var _a;
    const container = el("bookmark-list");
    if (selectedFolderId === null) {
      el("current-folder-name").textContent = "All Bookmarks";
    } else {
      el("current-folder-name").textContent = ((_a = getFolder(selectedFolderId)) == null ? void 0 : _a.name) ?? "Unknown";
    }
    const list = sortedBookmarks(selectedFolderId, searchQuery);
    if (list.length === 0) {
      container.innerHTML = `
      <div class="empty-state">
        <div class="icon">\u{1F516}</div>
        <p>${searchQuery ? "No bookmarks match your search." : "No bookmarks here yet.<br>Click <strong>+ Add Bookmark</strong> to get started."}</p>
      </div>
    `;
      return;
    }
    container.innerHTML = "";
    for (const bm of list) {
      container.appendChild(createBookmarkCard(bm));
    }
  }
  function createBookmarkCard(bm) {
    var _a, _b, _c, _d, _e;
    const card = document.createElement("div");
    card.className = "bookmark-card";
    card.dataset.id = bm.id;
    const favicon = faviconUrl(bm.url);
    const faviconHtml = favicon ? `<img class="bookmark-favicon" src="${escapeHtml2(favicon)}" onerror="this.style.display='none'" alt="">` : "";
    const domain = getDomain(bm.url);
    const hasNotes = bm.notes.trim().length > 0;
    card.innerHTML = `
    <div class="card-row">
      ${faviconHtml}
      ${hasNotes ? `<button class="btn-notes-toggle" title="Toggle notes">\u{1F4DD}</button>` : ""}
      <a class="bookmark-title" href="${escapeHtml2(safeUrl(bm.url))}" rel="noopener noreferrer" title="${escapeHtml2(bm.title)}">${escapeHtml2(bm.title)}</a>
      ${domain ? `<span class="bookmark-domain" title="${escapeHtml2(bm.url)}">${escapeHtml2(domain)}</span>` : ""}
      <span class="bookmark-time" title="Last accessed: ${bm.last_accessed}">${relativeTime(bm.last_accessed)}</span>
      <div class="card-actions">
        <button class="btn-action btn-open" title="Open link">\u2197</button>
        <button class="btn-action btn-edit" title="Edit">\u270E</button>
        <button class="btn-action btn-del" title="Delete">\u2715</button>
      </div>
    </div>
    ${hasNotes ? `<div class="notes-body">${escapeHtml2(bm.notes)}</div>` : ""}`;
    const open = async () => {
      const url = await openBookmark(bm.id);
      window.open(url, "_blank", "noopener,noreferrer");
      renderAll();
    };
    (_a = card.querySelector(".btn-open")) == null ? void 0 : _a.addEventListener("click", open);
    (_b = card.querySelector(".bookmark-title")) == null ? void 0 : _b.addEventListener("click", (e) => {
      e.preventDefault();
      open();
    });
    (_c = card.querySelector(".btn-edit")) == null ? void 0 : _c.addEventListener("click", () => openBookmarkModal(bm));
    (_d = card.querySelector(".btn-del")) == null ? void 0 : _d.addEventListener(
      "click",
      () => confirmDelete(`Delete "${bm.title}"?`, async () => {
        await deleteBookmark(bm.id);
        renderAll();
      })
    );
    (_e = card.querySelector(".btn-notes-toggle")) == null ? void 0 : _e.addEventListener(
      "click",
      () => {
        var _a2;
        return (_a2 = card.querySelector(".notes-body")) == null ? void 0 : _a2.classList.toggle("open");
      }
    );
    card.addEventListener("mouseenter", () => scheduleShowTooltip(bm, card));
    card.addEventListener("mouseleave", scheduleHideTooltip);
    return card;
  }
  function renderAll() {
    renderFolders();
    renderBookmarks();
  }
  function selectFolder(id) {
    selectedFolderId = id;
    searchQuery = "";
    el("search-input").value = "";
    renderAll();
  }
  function openModal(id) {
    el(id).classList.remove("hidden");
  }
  function closeModal(id) {
    el(id).classList.add("hidden");
  }
  function openBookmarkModal(bm) {
    var _a;
    el("modal-bookmark-title").textContent = bm ? "Edit Bookmark" : "Add Bookmark";
    el("bm-id").value = (bm == null ? void 0 : bm.id) ?? "";
    el("bm-url").value = (bm == null ? void 0 : bm.url) ?? "";
    el("bm-title").value = (bm == null ? void 0 : bm.title) ?? "";
    el("bm-description").value = (bm == null ? void 0 : bm.description) ?? "";
    el("bm-notes").value = (bm == null ? void 0 : bm.notes) ?? "";
    el("bm-tags").value = ((_a = bm == null ? void 0 : bm.tags) == null ? void 0 : _a.join(", ")) ?? "";
    const select = el("bm-folder");
    select.innerHTML = '<option value="">\u2014 No folder \u2014</option>';
    for (const folder of sortedFolders()) {
      const opt = document.createElement("option");
      opt.value = folder.id;
      opt.textContent = folder.name;
      if (((bm == null ? void 0 : bm.folder_id) ?? selectedFolderId ?? "") === folder.id)
        opt.selected = true;
      select.appendChild(opt);
    }
    el("bm-duplicate-warning").classList.add("hidden");
    openModal("modal-bookmark");
    el("bm-url").focus();
  }
  function openFolderModal(folder) {
    el("modal-folder-title").textContent = folder ? "Rename Folder" : "Add Folder";
    el("folder-id").value = (folder == null ? void 0 : folder.id) ?? "";
    el("folder-name").value = (folder == null ? void 0 : folder.name) ?? "";
    openModal("modal-folder");
    el("folder-name").focus();
  }
  function confirmDelete(message, callback) {
    el("confirm-message").textContent = message;
    confirmCallback = callback;
    openModal("modal-confirm");
  }
  function checkDuplicateUrl(url, excludeId) {
    const warning = el("bm-duplicate-warning");
    const existing = findBookmarkByUrl(url, excludeId || void 0);
    if (existing) {
      const folder = existing.folder_id ? getFolder(existing.folder_id) : null;
      const folderText = folder ? ` in <span class="dup-folder">${escapeHtml2(folder.name)}</span>` : "";
      warning.innerHTML = `Already bookmarked as <strong>${escapeHtml2(existing.title)}</strong>${folderText}`;
      warning.classList.remove("hidden");
    } else {
      warning.classList.add("hidden");
    }
  }
  async function handleBookmarkSubmit(e) {
    e.preventDefault();
    const id = el("bm-id").value;
    const urlVal = el("bm-url").value.trim();
    if (!id) {
      const existing = findBookmarkByUrl(urlVal);
      if (existing) {
        const folder = existing.folder_id ? getFolder(existing.folder_id) : null;
        const where = folder ? ` in "${folder.name}"` : "";
        if (!confirm(`This URL is already bookmarked as "${existing.title}"${where}.

Add it anyway?`))
          return;
      }
    }
    let title = el("bm-title").value.trim();
    if (!title)
      title = await fetchPageTitle(urlVal) || getDomain(urlVal) || urlVal;
    const data = {
      url: urlVal,
      title,
      description: el("bm-description").value.trim(),
      notes: el("bm-notes").value,
      folder_id: el("bm-folder").value,
      tags: el("bm-tags").value.split(",").map((t) => t.trim()).filter(Boolean)
    };
    if (id) {
      await updateBookmark(id, data);
    } else {
      await addBookmark(data);
    }
    closeModal("modal-bookmark");
    renderAll();
  }
  async function handleFolderSubmit(e) {
    e.preventDefault();
    const id = el("folder-id").value;
    const name = el("folder-name").value.trim();
    if (!name)
      return;
    if (id) {
      await updateFolder(id, { name });
    } else {
      await addFolder(name);
    }
    closeModal("modal-folder");
    renderAll();
  }
  function initUI() {
    el("btn-add-bookmark").addEventListener("click", () => openBookmarkModal());
    el("btn-add-folder").addEventListener("click", () => openFolderModal());
    el("bookmark-tooltip").addEventListener("mouseenter", () => {
      if (tooltipHideTimer) {
        clearTimeout(tooltipHideTimer);
        tooltipHideTimer = null;
      }
    });
    el("bookmark-tooltip").addEventListener("mouseleave", scheduleHideTooltip);
    el("folder-sort").addEventListener("change", (e) => {
      folderSortMode = e.target.value;
      renderFolders();
    });
    el("btn-import").addEventListener("click", () => el("import-file").click());
    el("import-file").addEventListener("change", async (e) => {
      var _a;
      const file = (_a = e.target.files) == null ? void 0 : _a[0];
      if (!file)
        return;
      const html = await file.text();
      const parsed = parseNetscapeBookmarks(html);
      if (parsed.length === 0) {
        alert("No bookmarks found in the selected file.");
        el("import-file").value = "";
        return;
      }
      const { bookmarkCount, folderCount } = await importFromNetscape(parsed);
      renderAll();
      alert(`Imported ${bookmarkCount} bookmark${bookmarkCount !== 1 ? "s" : ""} and created ${folderCount} new folder${folderCount !== 1 ? "s" : ""}.`);
      el("import-file").value = "";
    });
    el("btn-export").addEventListener("click", () => {
      if (bookmarks.length === 0) {
        alert("No bookmarks to export.");
        return;
      }
      const html = exportNetscapeBookmarks(bookmarks, sortedFolders());
      const blob = new Blob([html], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "bookmarks.html";
      a.click();
      URL.revokeObjectURL(url);
    });
    el("search-input").addEventListener("input", (e) => {
      searchQuery = e.target.value;
      renderBookmarks();
    });
    el("form-bookmark").addEventListener("submit", handleBookmarkSubmit);
    el("form-folder").addEventListener("submit", handleFolderSubmit);
    el("bm-url").addEventListener("blur", async () => {
      const url = el("bm-url").value.trim();
      const editId = el("bm-id").value;
      checkDuplicateUrl(url, editId);
      const titleEl = el("bm-title");
      if (!url || titleEl.value.trim())
        return;
      const orig = titleEl.placeholder;
      titleEl.placeholder = "Fetching title\u2026";
      titleEl.disabled = true;
      const title = await fetchPageTitle(url);
      titleEl.disabled = false;
      titleEl.placeholder = orig;
      if (title && !titleEl.value.trim())
        titleEl.value = title;
    });
    document.querySelectorAll(".modal-close").forEach((btn) => {
      const modalId = btn.dataset.modal;
      if (modalId)
        btn.addEventListener("click", () => closeModal(modalId));
    });
    document.querySelectorAll(".modal").forEach((modal) => {
      modal.addEventListener("click", (e) => {
        if (e.target === modal)
          modal.classList.add("hidden");
      });
    });
    el("confirm-cancel").addEventListener("click", () => closeModal("modal-confirm"));
    el("confirm-ok").addEventListener("click", async () => {
      closeModal("modal-confirm");
      if (confirmCallback) {
        await confirmCallback();
        confirmCallback = null;
      }
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        document.querySelectorAll(".modal:not(.hidden)").forEach(
          (m) => m.classList.add("hidden")
        );
      }
    });
  }

  // src/main.ts
  async function main() {
    const loadingEl = document.getElementById("loading");
    const messageEl = document.getElementById("loading-message");
    const subEl = document.getElementById("loading-sub");
    const spinnerEl = document.getElementById("loading-spinner");
    const openBtn = document.getElementById("btn-open-folder");
    initUI();
    async function launch(forceNew) {
      openBtn.disabled = true;
      spinnerEl.style.display = "block";
      messageEl.textContent = "Opening folder\u2026";
      subEl.textContent = "";
      try {
        await initStorage(forceNew);
        messageEl.textContent = "Loading bookmarks\u2026";
        await loadAll();
        await archiveStaleBookmarks();
        loadingEl.classList.add("hidden");
        renderAll();
      } catch (err) {
        const e = err;
        if (e.name === "AbortError" || e.message.includes("aborted") || e.message.includes("user")) {
          messageEl.textContent = "VM Bookmarks Manager";
          subEl.textContent = "Select the folder where your bookmarks will be stored.";
        } else {
          messageEl.textContent = `Error: ${e.message}`;
          subEl.textContent = "Try again or refresh the page.";
        }
        spinnerEl.style.display = "none";
        openBtn.disabled = false;
      }
    }
    openBtn.addEventListener("click", () => launch(false));
    document.getElementById("btn-change-folder").addEventListener("click", () => launch(true));
  }
  main();
})();
