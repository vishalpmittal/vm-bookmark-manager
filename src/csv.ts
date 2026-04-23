/**
 * RFC 4180 compliant CSV parser and serializer.
 * Handles: quoted fields, embedded commas, embedded quotes (doubled), embedded newlines.
 */

export function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  const len = text.length;
  let i = 0;

  while (i < len) {
    const row: string[] = [];

    while (i < len) {
      let field = '';

      if (text[i] === '"') {
        // Quoted field
        i++; // skip opening quote
        while (i < len) {
          if (text[i] === '"') {
            if (i + 1 < len && text[i + 1] === '"') {
              field += '"'; // escaped double-quote
              i += 2;
            } else {
              i++; // skip closing quote
              break;
            }
          } else {
            field += text[i];
            i++;
          }
        }
      } else {
        // Unquoted field — read until comma or line ending
        while (i < len && text[i] !== ',' && text[i] !== '\r' && text[i] !== '\n') {
          field += text[i];
          i++;
        }
      }

      row.push(field);

      if (i < len && text[i] === ',') {
        i++; // consume comma, continue to next field
      } else {
        break; // end of row
      }
    }

    // Consume CRLF or LF
    if (i < len && text[i] === '\r') i++;
    if (i < len && text[i] === '\n') i++;

    // Skip blank rows
    if (row.length > 0 && !(row.length === 1 && row[0] === '')) {
      rows.push(row);
    }
  }

  return rows;
}

function quoteField(field: string): string {
  if (
    field.includes(',') ||
    field.includes('"') ||
    field.includes('\r') ||
    field.includes('\n')
  ) {
    return '"' + field.replace(/"/g, '""') + '"';
  }
  return field;
}

export function serializeCSV(rows: string[][]): string {
  return rows.map(row => row.map(quoteField).join(',')).join('\r\n') + '\r\n';
}
