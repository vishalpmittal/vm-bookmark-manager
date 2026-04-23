# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build Commands

```bash
npm run build     # Build dist/app.js (esbuild, single bundle)
npm run watch     # Rebuild on file changes
npx tsc --noEmit  # Type-check (no tests or linter configured)
```

After building, open `index.html` directly in Chrome/Edge via `file://` — no server needed. Always rebuild `dist/app.js` after editing `src/` files.

## Browser Requirements

Chrome 90+ or Edge 90+ only. Firefox and Safari are **not supported** — they lack the File System Access API. The esbuild target is `chrome90`.

## Architecture

Browser-only bookmark manager using plain TypeScript, HTML, and CSS. No frameworks, no runtime dependencies (dev dependencies only: tsc, esbuild).

**Root files**: `index.html` (entry point), `styles.css` (all styles, CSS variables in `:root`), `dist/app.js` (pre-built bundle, committed to repo), `build.sh` (produces `artifacts/`)

**Deploy files** (`deploy/`):
- `docker/Dockerfile` — nginx:alpine serving static files on port 80
- `docker/nginx.conf` — minimal nginx config with gzip
- `terraform/gcp/` — Cloud Run deployment via Artifact Registry (main.tf, variables.tf, outputs.tf)

**Source files** (`src/`):
- `types.ts` — `Bookmark` and `Folder` interfaces
- `csv.ts` — RFC 4180 CSV parser/serializer (handles quoted fields, embedded commas/newlines)
- `storage.ts` — File System Access API layer: reads/writes CSV files to a user-selected directory, persists the directory handle in IndexedDB (not `localStorage` — handles aren't serializable there)
- `store.ts` — In-memory state (`bookmarks[]`, `folders[]`), CRUD operations, centralized sorting logic
- `netscape.ts` — Netscape Bookmark File Format parser/serializer for browser import/export
- `ui.ts` — All DOM rendering, modals, form handlers, event wiring, hover tooltip, duplicate check
- `main.ts` — Bootstrap: wires the loading screen button to `initStorage()` (must be in a click handler for user-gesture requirement), then loads data and renders

**Data flow**: User clicks "Open Data Folder" button → `storage.initStorage()` gets directory handle → `store.loadAll()` reads CSVs via storage → `ui.renderAll()` builds the DOM. All mutations go through `store.*` functions which write back to CSV immediately.

**Key constraint**: `initStorage()` and `showDirectoryPicker` require a user gesture (button click). The "Data Folder" button in the header is wired in `main.ts` (not `ui.ts`) to preserve the gesture chain. Never call these from auto-running code paths.

## Data Model

```
Bookmark { id, url, title, description?, notes?, folder_id, tags?, created_at, last_accessed, access_count }
Folder   { id, name, parent_id?, created_at, last_accessed, access_count }
```

## Sorting Rules

- **Bookmarks**: Sort by `last_accessed` descending (most recently used first)
- **Folders**: Configurable via sidebar dropdown (`FolderSortMode`):
  - `most-used` (default) — `access_count` descending; break ties with `last_accessed` descending
  - `least-used` — `access_count` ascending; break ties with `last_accessed` ascending
  - `a-z` — alphabetical, case-insensitive
- The Archive folder is always pinned at the bottom regardless of sort mode
- Sorting logic is centralized in `store.ts` — do not duplicate comparators elsewhere

## Behavior

- Opening a bookmark increments its `access_count` + updates `last_accessed`, and does the same for its parent folder
- Adding a bookmark to a folder does NOT count as a folder access
- **Auto-archival**: On each app load, bookmarks not clicked for 90 days are moved to the "Archive" folder. The source folder name is added as a tag before moving. The Archive folder is created automatically, appears at the bottom of the sidebar, and cannot be renamed or deleted

## CSV Storage Format

**bookmarks.csv** — header row required:
```
id,url,title,description,notes,folder_id,tags,created_at,last_accessed,access_count
```

**folders.csv** — header row required:
```
id,name,parent_id,created_at,last_accessed,access_count
```

- `tags` stored as a pipe-separated string (e.g. `work|reference|tools`)
- `notes` field may contain commas — must be quoted per RFC 4180
- Timestamps stored as ISO 8601 strings (e.g. `2026-03-12T10:00:00.000Z`)
- Empty optional fields stored as empty string, not `null` or `undefined`
- On return visits, `handle.requestPermission({ mode: 'readwrite' })` re-grants access (requires user gesture)

## Design

- All color references must use CSS variables defined in `styles.css :root` — do not hardcode hex values
- Key variables: `--accent`, `--accent-hover`, `--accent-dark`, `--accent-light`, `--accent-gradient`, `--text`, `--text-muted`, `--sidebar-bg`, `--surface`, `--border`, `--danger`
- Gradient accents (`--accent-gradient`) are applied to primary buttons, header bar, modal/loading-box top borders, and open-link hover

## Bookmark Card Layout

Cards use a **compact single-row layout** (34px height):

```
[favicon] [📝?] [Title — truncated, flex]  [domain.com]  [time]  [↗][✎][✕]
```

- Tags and description are saved but **not displayed** in the card row — search still works across them
- Notes indicator (`📝`) appears before the title when a bookmark has notes; clicking it expands a notes row below
- Do not add more elements to the card row — keep it single-line

## Import/Export

- Supports the **Netscape Bookmark File Format** (the standard HTML format used by all major browsers)
- **Import**: Parsed bookmarks are added to the store; folders are created by name (existing folders are reused); `javascript:` and `place:` URLs are skipped
- **Export**: Bookmarks grouped by folder with `ADD_DATE`/`LAST_MODIFIED` timestamps; unfiled bookmarks go at root level
- Parser tracks `<DL>` nesting depth to correctly assign bookmarks to their immediate parent folder
- Logic is in `netscape.ts` (format handling) and `store.ts:importFromNetscape()` (bulk insert)

## Title Auto-Fetch

- Title is **not required** in the add/edit form — auto-fetched on URL blur if empty
- Fallback chain: `fetch()` + parse `<title>` (4s timeout) → `titleFromUrl()` (derive from URL path) → `getDomain()` → raw URL
- Never block submission waiting for a title — always have a fallback

## Duplicate URL Check

- URL matching is case-insensitive and ignores trailing slashes
- On URL blur: inline yellow warning; on submit (new bookmarks only): `confirm()` dialog
- When editing, the bookmark's own URL is excluded from the check

## Hover Tooltip

- Single shared `#bookmark-tooltip` element, repositioned per hover (300ms show delay, 150ms hide delay)
- Stays visible when mouse moves onto it; auto-positions to avoid viewport overflow

## Build Pipeline

`./build.sh` produces three artifacts in `artifacts/`:
- `vm-bookmarks-local.zip` — standalone zip (index.html, styles.css, dist/app.js, bookmarks-data/)
- `docker/` — self-contained Docker build context with Dockerfile, nginx.conf, and all static files
- `terraform/gcp/` — Terraform config for Cloud Run deployment

The script runs `npm ci` + `npm run build`, then copies files into each distribution. The `artifacts/` directory is cleaned on every run and gitignored.

## Development Guidelines

- The compiled output must work when opened as a local `file://` URL in Chrome/Edge
- `dist/app.js` is the pre-built bundle; always rebuild after editing `src/`
- `bookmarks-data/` contains sample CSVs and is tracked in git — do not add personal bookmark data here
- Notes field: plain text only, no HTML rendering
- Folder access stats are derived from bookmark activity, not tracked independently
