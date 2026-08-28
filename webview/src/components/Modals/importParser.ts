// High-performance, robust CSV & JSON Parser for SQLite Import Wizard
import { ImportColumnDef } from '../../../../src/common/messages';

export interface ParseResult {
  format: 'csv' | 'json';
  headers: string[];
  rows: Record<string, any>[];
  totalRows: number;
  delimiter?: string;
  error?: string;
}

// Auto-detect CSV delimiter
export function detectDelimiter(text: string): string {
  const sampleLines = text.split(/\r?\n/).slice(0, 10).filter((l) => l.trim().length > 0);
  if (sampleLines.length === 0) {return ',';}

  const counts: Record<string, number> = { ',': 0, ';': 0, '\t': 0, '|': 0 };

  for (const line of sampleLines) {
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (!inQuotes && counts[char] !== undefined) {
        counts[char]++;
      }
    }
  }

  let best = ',';
  let max = -1;
  for (const [delim, count] of Object.entries(counts)) {
    if (count > max) {
      max = count;
      best = delim;
    }
  }
  return max > 0 ? best : ',';
}

// RFC 4180 compliant CSV parser
export function parseCsv(
  text: string,
  delimiter?: string,
  hasHeader: boolean = true
): ParseResult {
  const delim = delimiter || detectDelimiter(text);
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;

  // Normalize line endings and strip BOM
  const clean = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  for (let i = 0; i < clean.length; i++) {
    const char = clean[i];
    const nextChar = clean[i + 1];

    if (inQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          currentField += '"';
          i++; // Skip escaped quote
        } else {
          inQuotes = false;
        }
      } else {
        currentField += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === delim) {
        currentRow.push(currentField.trim());
        currentField = '';
      } else if (char === '\n') {
        currentRow.push(currentField.trim());
        currentField = '';
        if (currentRow.some((f) => f.length > 0)) {
          rows.push(currentRow);
        }
        currentRow = [];
      } else {
        currentField += char;
      }
    }
  }

  // Push last field/row if not empty
  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    if (currentRow.some((f) => f.length > 0)) {
      rows.push(currentRow);
    }
  }

  if (rows.length === 0) {
    return {
      format: 'csv',
      headers: [],
      rows: [],
      totalRows: 0,
      delimiter: delim,
      error: 'CSV content is empty.',
    };
  }

  let rawHeaders: string[] = [];
  let dataRows: string[][] = [];

  if (hasHeader) {
    rawHeaders = rows[0].map((h, i) => h.trim() || `col_${i + 1}`);
    dataRows = rows.slice(1);
  } else {
    rawHeaders = rows[0].map((_, i) => `col_${i + 1}`);
    dataRows = rows;
  }

  // Ensure unique header names
  const seen: Record<string, number> = {};
  const headers = rawHeaders.map((h) => {
    const base = h.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase() || 'col';
    if (seen[base] !== undefined) {
      seen[base]++;
      return `${base}_${seen[base]}`;
    } else {
      seen[base] = 1;
      return base;
    }
  });

  const parsedObjects: Record<string, any>[] = dataRows.map((r) => {
    const obj: Record<string, any> = {};
    headers.forEach((h, idx) => {
      obj[h] = r[idx] !== undefined && r[idx] !== '' ? r[idx] : null;
    });
    return obj;
  });

  return {
    format: 'csv',
    headers,
    rows: parsedObjects,
    totalRows: parsedObjects.length,
    delimiter: delim,
  };
}

// Parse JSON or JSON Lines
export function parseJson(text: string): ParseResult {
  const clean = text.trim();
  if (!clean) {
    return {
      format: 'json',
      headers: [],
      rows: [],
      totalRows: 0,
      error: 'JSON content is empty.',
    };
  }

  let parsed: any;
  try {
    parsed = JSON.parse(clean);
  } catch (err: any) {
    // Try NDJSON / JSON Lines (each line is a valid JSON object)
    try {
      const lines = clean.split(/\r?\n/).filter((l) => l.trim().length > 0);
      const objects = lines.map((l) => JSON.parse(l));
      if (objects.length > 0 && typeof objects[0] === 'object') {
        parsed = objects;
      }
    } catch {
      return {
        format: 'json',
        headers: [],
        rows: [],
        totalRows: 0,
        error: `Invalid JSON syntax: ${err.message}`,
      };
    }
  }

  // Unwrap common wrapper keys: { data: [...] } or { records: [...] }
  let arrayData: any[] = [];
  if (Array.isArray(parsed)) {
    arrayData = parsed;
  } else if (parsed && typeof parsed === 'object') {
    for (const key of ['data', 'records', 'items', 'rows', 'results']) {
      if (Array.isArray(parsed[key])) {
        arrayData = parsed[key];
        break;
      }
    }
    if (arrayData.length === 0) {
      arrayData = [parsed]; // Single object
    }
  }

  if (arrayData.length === 0) {
    return {
      format: 'json',
      headers: [],
      rows: [],
      totalRows: 0,
      error: 'JSON does not contain an array of records.',
    };
  }

  // Extract union of all keys across objects
  const headerSet = new Set<string>();
  const normalizedRows: Record<string, any>[] = [];

  for (const item of arrayData) {
    if (typeof item === 'object' && item !== null) {
      const flatObj: Record<string, any> = {};
      for (const [k, v] of Object.entries(item)) {
        headerSet.add(k);
        if (typeof v === 'object' && v !== null) {
          flatObj[k] = JSON.stringify(v);
        } else {
          flatObj[k] = v;
        }
      }
      normalizedRows.push(flatObj);
    }
  }

  const headers = Array.from(headerSet);

  return {
    format: 'json',
    headers,
    rows: normalizedRows,
    totalRows: normalizedRows.length,
  };
}

// Infer SQLite data types from sample values
export function inferColumnDefs(
  headers: string[],
  rows: Record<string, any>[],
  existingTableColumns?: { name: string; type: string }[]
): ImportColumnDef[] {
  const sampleSize = Math.min(rows.length, 100);
  const sampleRows = rows.slice(0, sampleSize);

  return headers.map((header) => {
    // If target is an existing table with matching column name, use its type
    if (existingTableColumns) {
      const match = existingTableColumns.find(
        (c) => c.name.toLowerCase() === header.toLowerCase()
      );
      if (match) {
        return {
          sourceName: header,
          targetName: match.name,
          type: match.type || 'TEXT',
          isPk: false,
          notNull: false,
          skip: false,
        };
      }
    }

    let isInteger = true;
    let isReal = true;
    let isBoolean = true;
    let isDate = true;
    let nonNullCount = 0;

    for (const row of sampleRows) {
      const val = row[header];
      if (val === undefined || val === null || val === '') {continue;}
      nonNullCount++;
      const s = String(val).trim();

      // Check Integer
      if (!/^-?\d+$/.test(s)) {
        isInteger = false;
      }
      // Check Real / Float
      if (!/^-?\d*(\.\d+)?([eE][-+]?\d+)?$/.test(s)) {
        isReal = false;
      }
      // Check Boolean
      if (!['true', 'false', '0', '1', 'yes', 'no'].includes(s.toLowerCase())) {
        isBoolean = false;
      }
      // Check ISO date format
      if (!/^\d{4}-\d{2}-\d{2}/.test(s)) {
        isDate = false;
      }
    }

    let inferredType = 'TEXT';
    if (nonNullCount > 0) {
      if (isBoolean) {
        inferredType = 'INTEGER'; // SQLite stores booleans as 0 or 1
      } else if (isInteger) {
        inferredType = 'INTEGER';
      } else if (isReal) {
        inferredType = 'REAL';
      } else if (isDate) {
        inferredType = 'DATETIME';
      }
    }

    const cleanTargetName = header.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase();
    const isIdPk = cleanTargetName === 'id' && isInteger;

    return {
      sourceName: header,
      targetName: cleanTargetName,
      type: inferredType,
      isPk: isIdPk,
      notNull: false,
      skip: false,
    };
  });
}
