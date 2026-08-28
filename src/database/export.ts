import { ColumnInfo } from '../common/messages';

export class DataExporter {
  public static toCsv(rows: any[], columns: ColumnInfo[]): string {
    const colNames = columns.map((c) => c.name);
    const header = colNames.map(escapeCsvCell).join(',');
    const lines = rows.map((row) =>
      colNames
        .map((col) => {
          const val = row[col];
          if (val === null || val === undefined) {return '';}
          if (typeof val === 'object' && val.__isBlob) {
            return `[BLOB ${val.size} bytes]`;
          }
          return escapeCsvCell(String(val));
        })
        .join(',')
    );
    return [header, ...lines].join('\n');
  }

  public static toJson(rows: any[]): string {
    const cleaned = rows.map((r) => {
      const copy: Record<string, any> = {};
      for (const [k, v] of Object.entries(r)) {
        if (k === '__rowid__') {continue;}
        if (v && typeof v === 'object' && (v as any).__isBlob) {
          copy[k] = `[BLOB ${(v as any).size} bytes]`;
        } else {
          copy[k] = v;
        }
      }
      return copy;
    });
    return JSON.stringify(cleaned, null, 2);
  }

  public static toMarkdown(rows: any[], columns: ColumnInfo[]): string {
    const colNames = columns.map((c) => c.name);
    const header = `| ${colNames.join(' | ')} |`;
    const divider = `| ${colNames.map(() => '---').join(' | ')} |`;
    const lines = rows.map((row) =>
      `| ${colNames
        .map((col) => {
          const val = row[col];
          if (val === null || val === undefined) {return '*NULL*';}
          if (typeof val === 'object' && val.__isBlob) {
            return `[BLOB ${val.size}B]`;
          }
          return String(val).replace(/\|/g, '\\|').replace(/\n/g, ' ');
        })
        .join(' | ')} |`
    );
    return [header, divider, ...lines].join('\n');
  }

  public static toSqlInsert(tableName: string, rows: any[], columns: ColumnInfo[]): string {
    const colNames = columns.map((c) => `"${c.name}"`).join(', ');
    const statements = rows.map((row) => {
      const vals = columns.map((c) => {
        const val = row[c.name];
        if (val === null || val === undefined) {return 'NULL';}
        if (typeof val === 'number') {return String(val);}
        if (typeof val === 'object' && val.__isBlob) {
          return `X'${Buffer.from(val.base64, 'base64').toString('hex')}'`;
        }
        return `'${String(val).replace(/'/g, "''")}'`;
      });
      return `INSERT INTO "${tableName}" (${colNames}) VALUES (${vals.join(', ')});`;
    });
    return statements.join('\n');
  }

  public static toTypeScriptInterface(tableName: string, columns: ColumnInfo[]): string {
    const interfaceName = toPascalCase(tableName);
    const fields = columns
      .map((c) => {
        const tsType = mapSqliteTypeToTs(c.type);
        const optional = c.notnull ? '' : ' | null';
        return `  ${c.name}: ${tsType}${optional};`;
      })
      .join('\n');

    return `export interface ${interfaceName} {\n${fields}\n}`;
  }
}

function escapeCsvCell(cell: string): string {
  if (cell.includes(',') || cell.includes('"') || cell.includes('\n') || cell.includes('\r')) {
    return `"${cell.replace(/"/g, '""')}"`;
  }
  return cell;
}

function toPascalCase(str: string): string {
  return str
    .replace(/(?:^\w|[A-Z]|\b\w)/g, (letter) => letter.toUpperCase())
    .replace(/[\s\-_]+/g, '');
}

function mapSqliteTypeToTs(sqliteType: string): string {
  const type = sqliteType.toUpperCase();
  if (type.includes('INT')) {return 'number';}
  if (type.includes('CHAR') || type.includes('TEXT') || type.includes('CLOB')) {return 'string';}
  if (type.includes('REAL') || type.includes('FLOA') || type.includes('DOUB') || type.includes('NUMERIC')) {
    return 'number';
  }
  if (type.includes('BLOB')) {return 'Uint8Array';}
  if (type.includes('BOOL')) {return 'boolean';}
  return 'any';
}
