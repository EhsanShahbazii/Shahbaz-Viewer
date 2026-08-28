/**
 * Timestamp formatting utility for exported files.
 * Generates human-readable, filesystem-safe timestamp strings like:
 * YYYY-MM-DD_HH-mm-ss (e.g., 2026-09-06_12-40-04)
 */

export function getExportTimestamp(): string {
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  const yyyy = now.getFullYear();
  const mm = pad(now.getMonth() + 1);
  const dd = pad(now.getDate());
  const hh = pad(now.getHours());
  const min = pad(now.getMinutes());
  const ss = pad(now.getSeconds());
  return `${yyyy}-${mm}-${dd}_${hh}-${min}-${ss}`;
}

/**
 * Inserts a timestamp into a filename before its extension.
 * Example: insertTimestamp('orders.csv') -> 'orders_2026-09-06_12-40-04.csv'
 */
export function insertTimestamp(fileName: string): string {
  const timestamp = getExportTimestamp();
  const lastDot = fileName.lastIndexOf('.');
  if (lastDot === -1) {
    return `${fileName}_${timestamp}`;
  }
  const base = fileName.substring(0, lastDot);
  const ext = fileName.substring(lastDot);
  return `${base}_${timestamp}${ext}`;
}
