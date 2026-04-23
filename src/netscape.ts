import type { Bookmark, Folder } from './types';

export interface ImportedBookmark {
  url: string;
  title: string;
  addDate: number;
  folderName: string;
}

function decodeEntities(s: string): string {
  const el = document.createElement('textarea');
  el.innerHTML = s;
  return el.value;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function parseNetscapeBookmarks(html: string): ImportedBookmark[] {
  const results: ImportedBookmark[] = [];
  const folderStack: string[] = [];
  const folderDepths: number[] = [];
  let depth = 0;
  let pendingFolder: string | null = null;

  const pattern = /<(\/?)DL[^>]*>|<H3[^>]*>([^<]*)<\/H3>|<A\s+([^>]+)>([^<]*)<\/A>/gi;

  let m;
  while ((m = pattern.exec(html)) !== null) {
    if (m[2] !== undefined) {
      pendingFolder = decodeEntities(m[2].trim());
    } else if (m[3] !== undefined) {
      const attrs = m[3];
      const title = decodeEntities((m[4] ?? '').trim());
      const hrefMatch = attrs.match(/HREF="([^"]*)"/i);
      const dateMatch = attrs.match(/ADD_DATE="(\d+)"/i);

      if (hrefMatch) {
        const url = hrefMatch[1];
        if (url.startsWith('javascript:') || url.startsWith('place:')) continue;
        results.push({
          url,
          title: title || url,
          addDate: dateMatch ? parseInt(dateMatch[1], 10) : Math.floor(Date.now() / 1000),
          folderName: folderStack.length > 0 ? folderStack[folderStack.length - 1] : '',
        });
      }
    } else {
      if (m[1] === '/') {
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

export function exportNetscapeBookmarks(bms: Bookmark[], flds: Folder[]): string {
  const lines: string[] = [
    '<!DOCTYPE NETSCAPE-Bookmark-file-1>',
    '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
    '<TITLE>Bookmarks</TITLE>',
    '<H1>Bookmarks</H1>',
    '<DL><p>',
  ];

  const byFolder = new Map<string, Bookmark[]>();
  for (const bm of bms) {
    const key = bm.folder_id || '';
    if (!byFolder.has(key)) byFolder.set(key, []);
    byFolder.get(key)!.push(bm);
  }

  for (const folder of flds) {
    const addDate = Math.floor(new Date(folder.created_at).getTime() / 1000);
    const lastMod = Math.floor(new Date(folder.last_accessed).getTime() / 1000);
    lines.push(`    <DT><H3 ADD_DATE="${addDate}" LAST_MODIFIED="${lastMod}">${escapeHtml(folder.name)}</H3>`);
    lines.push('    <DL><p>');
    for (const bm of byFolder.get(folder.id) || []) {
      const bmDate = Math.floor(new Date(bm.created_at).getTime() / 1000);
      lines.push(`        <DT><A HREF="${escapeHtml(bm.url)}" ADD_DATE="${bmDate}">${escapeHtml(bm.title)}</A>`);
    }
    lines.push('    </DL><p>');
    byFolder.delete(folder.id);
  }

  for (const bm of byFolder.get('') || []) {
    const bmDate = Math.floor(new Date(bm.created_at).getTime() / 1000);
    lines.push(`    <DT><A HREF="${escapeHtml(bm.url)}" ADD_DATE="${bmDate}">${escapeHtml(bm.title)}</A>`);
  }

  lines.push('</DL><p>');
  return lines.join('\n');
}
