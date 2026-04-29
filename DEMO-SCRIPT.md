# VM Bookmarks Manager -- 90-Second Demo Script

**Setup**: Have Chrome open. Have the project folder ready. Have a browser bookmarks HTML export file available for the import step (export one from Chrome via Bookmarks Manager > three-dot menu > "Export bookmarks").

---

## 0:00 -- Launch & Data Folder (10s)

1. Open `index.html` in Chrome -- loading screen appears with "Open Data Folder" button
2. Click **Open Data Folder** -- select the `bookmarks-data/` directory
3. App loads -- sidebar shows 9 folders with bookmark counts, main area shows all 50 bookmarks

> "This is VM Bookmarks -- a browser-only bookmark manager. No server, no account. Data is stored as CSV files in a folder you choose."

## 0:10 -- Folder Navigation & Sorting (12s)

1. Click **Developer Tools** folder in sidebar -- main area filters to 5 dev bookmarks, "Open All" button appears in the header
2. Click **folder sort dropdown** -- switch to **A-Z**, folders reorder alphabetically
3. Switch back to **Most Used** -- folders reorder by access count
4. Point out **Archive** folder pinned at the bottom with the box icon

> "Folders sort by most-used by default -- your frequently accessed folders stay on top. Archive is always at the bottom."

## 0:22 -- Add a Bookmark (20s)

1. Click **+ Add Bookmark** -- modal opens
2. Paste `https://figma.com` in the URL field
3. **Tab out of URL** -- title auto-fetches to "Figma" (watch the placeholder change to "Fetching title...")
4. Add description: `Design and prototyping tool`
5. Select folder: **Developer Tools**
6. Add tags: `design, ui, prototyping`
7. Type in Notes: `Free tier available for 3 projects`
8. Click **Save** -- modal closes, new bookmark appears in the list with favicon

> "Just paste a URL -- the title is fetched automatically. Add tags, notes, and assign to a folder."

## 0:42 -- Duplicate Detection (8s)

1. Click **+ Add Bookmark** again
2. Paste `https://github.com` -- tab out of URL field
3. Yellow warning appears: **"Already bookmarked as GitHub in Developer Tools"**
4. Press **Esc** to close modal

> "If you bookmark a URL that already exists, you'll get a warning showing where it lives."

## 0:50 -- Hover Tooltip & Notes (10s)

1. Hover over **Reddit** bookmark -- tooltip appears after 300ms showing full URL, description, folder, tags, notes preview, and access stats
2. Move mouse away -- tooltip fades
3. Click the **notebook icon** next to **Slack** -- notes row expands below the card showing the note text
4. Click the icon again to collapse

> "Hover any bookmark for a full detail popup. Bookmarks with notes show an indicator -- click it to expand."

## 1:00 -- Search (8s)

1. Type `privacy` in the **search bar** -- list filters in real-time to DuckDuckGo and Telegram (both tagged with "privacy")
2. Clear the search field

> "Search works across titles, URLs, descriptions, notes, and tags -- all in real-time."

## 1:08 -- Open All in Folder (8s)

1. Click **Search Engines** folder (4 bookmarks)
2. Click **Open All** button in the content header -- all 4 search engine bookmarks open in new tabs
3. Note the access counts and times update in the list

> "Open All lets you launch every bookmark in a folder at once -- great for resuming a work session."

## 1:16 -- Import & Export (10s)

1. Click **Import** button in the header -- file picker opens
2. Select a browser bookmarks HTML export file -- alert shows "Imported X bookmarks and created Y new folders"
3. Click **Export** -- `bookmarks.html` downloads instantly

> "Import bookmarks from any browser, export them back out. Standard format that every browser understands."

## 1:26 -- Wrap-Up (4s)

> "Everything runs locally in your browser. Your data is just two CSV files you can open in any spreadsheet. No cloud, no sync, no tracking."

---

## Features Covered (18 of 18)

| # | Feature | Timestamp |
|---|---------|-----------|
| 1 | Loading screen & data folder selection | 0:00 |
| 2 | Folder navigation & selection | 0:10 |
| 3 | Folder sort modes (most-used, A-Z) | 0:10 |
| 4 | Archive folder (pinned at bottom) | 0:10 |
| 5 | Add bookmark modal | 0:22 |
| 6 | Title auto-fetch from URL | 0:22 |
| 7 | Folder assignment | 0:22 |
| 8 | Tags | 0:22 |
| 9 | Notes | 0:22 |
| 10 | Duplicate URL detection | 0:42 |
| 11 | ESC to close modals | 0:42 |
| 12 | Hover tooltip | 0:50 |
| 13 | Notes expand/collapse | 0:50 |
| 14 | Real-time search | 1:00 |
| 15 | Open All bookmarks in folder | 1:08 |
| 16 | Access count & time tracking | 1:08 |
| 17 | Import from browser HTML | 1:16 |
| 18 | Export to browser HTML | 1:16 |
