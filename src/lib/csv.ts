/**
 * Tiny dependency-free CSV helper used by the Orders and Finance export
 * buttons for offline accounting backups.
 */

export type CsvCell = string | number | null | undefined;

function escapeCell(value: CsvCell): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Serialises a matrix of cells into an RFC-4180 CSV string (CRLF rows). */
export function toCsv(rows: CsvCell[][]): string {
  return rows.map((row) => row.map(escapeCell).join(",")).join("\r\n");
}

/** Triggers a client-side download of `content` as `filename`. */
export function downloadCsv(filename: string, content: string): void {
  // Prepend a BOM so Excel reads UTF-8 correctly (৳ symbol, Bangla names).
  const blob = new Blob([`\uFEFF${content}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
