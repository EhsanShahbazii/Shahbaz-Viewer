import initSqlJs, { Database, SqlJsStatic } from 'sql.js';
import * as fs from 'fs';
import * as path from 'path';
import {
  ColumnInfo,
  DatabaseMetadata,
  ForeignKeyInfo,
  TableInfo,
  CellChange,
  FilterRule,
  ImportOptions,
} from '../common/messages';
import { MockDataGenerator } from './mockGenerator';

export class SqliteEngine {
  private static SQL: SqlJsStatic | null = null;
  private db: Database | null = null;
  private filePath: string = '';

  public static async init(wasmDir: string): Promise<void> {
    if (!SqliteEngine.SQL) {
      SqliteEngine.SQL = await initSqlJs({
        locateFile: (file) => path.join(wasmDir, file),
      });
    }
  }

  public load(fileBuffer: Buffer, filePath: string): void {
    if (!SqliteEngine.SQL) {
      throw new Error('SQLite engine not initialized.');
    }
    this.filePath = filePath;
    this.db = new SqliteEngine.SQL.Database(fileBuffer);
  }

  public getFilePath(): string {
    return this.filePath;
  }

  public saveToDisk(): void {
    if (!this.db || !this.filePath) {
      throw new Error('No database loaded to save.');
    }
    const data = this.db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(this.filePath, buffer);
  }

  public getMetadata(): DatabaseMetadata {
    if (!this.db) {
      throw new Error('No database loaded.');
    }

    const dbName = path.basename(this.filePath);
    let sizeBytes = 0;
    try {
      if (fs.existsSync(this.filePath)) {
        sizeBytes = fs.statSync(this.filePath).size;
      }
    } catch {
      // ignore
    }

    // Get all tables and views
    const schemaQuery = `
      SELECT type, name, sql 
      FROM sqlite_master 
      WHERE name NOT LIKE 'sqlite_%' 
      ORDER BY type, name;
    `;

    const schemaResults = this.db.exec(schemaQuery);
    const tables: TableInfo[] = [];
    const views: TableInfo[] = [];

    if (schemaResults.length > 0) {
      const rows = schemaResults[0].values;
      for (const row of rows) {
        const type = row[0] as string;
        const name = row[1] as string;
        const sql = (row[2] as string) || '';

        // Columns info
        const columns = this.getTableColumns(name);
        const foreignKeys = type === 'table' ? this.getTableForeignKeys(name) : [];

        // Approximate or exact row count
        let rowCount = 0;
        try {
          const countRes = this.db.exec(`SELECT COUNT(*) FROM "${name}"`);
          if (countRes.length > 0 && countRes[0].values.length > 0) {
            rowCount = Number(countRes[0].values[0][0]);
          }
        } catch {
          rowCount = 0;
        }

        const info: TableInfo = {
          name,
          type: type === 'table' ? 'table' : 'view',
          rowCount,
          columns,
          foreignKeys,
          sql,
        };

        if (type === 'table') {
          tables.push(info);
        } else if (type === 'view') {
          views.push(info);
        }
      }
    }

    return {
      name: dbName,
      path: this.filePath,
      sizeBytes,
      tables,
      views,
    };
  }

  public getTableColumns(tableName: string): ColumnInfo[] {
    if (!this.db) {return [];}
    try {
      const res = this.db.exec(`PRAGMA table_info("${tableName}")`);
      if (res.length === 0) {return [];}
      return res[0].values.map((v) => ({
        cid: Number(v[0]),
        name: String(v[1]),
        type: String(v[2] || 'TEXT').toUpperCase(),
        notnull: Boolean(v[3]),
        dflt_value: v[4],
        pk: Number(v[5]),
      }));
    } catch {
      return [];
    }
  }

  public getTableForeignKeys(tableName: string): ForeignKeyInfo[] {
    if (!this.db) {return [];}
    try {
      const res = this.db.exec(`PRAGMA foreign_key_list("${tableName}")`);
      if (res.length === 0) {return [];}
      return res[0].values.map((v) => ({
        id: Number(v[0]),
        seq: Number(v[1]),
        table: String(v[2]),
        from: String(v[3]),
        to: String(v[4]),
        on_update: String(v[5]),
        on_delete: String(v[6]),
      }));
    } catch {
      return [];
    }
  }

  public getTableData(
    tableName: string,
    page: number = 0,
    pageSize: number = 50,
    sortColumn?: string,
    sortDirection: 'asc' | 'desc' = 'asc',
    filterText?: string,
    filterRules?: FilterRule[],
    filterConjunction: 'AND' | 'OR' = 'AND'
  ): {
    rows: any[];
    totalRows: number;
    columns: ColumnInfo[];
    primaryKeys: string[];
    foreignKeys: ForeignKeyInfo[];
    sql?: string;
  } {
    if (!this.db) {
      throw new Error('Database not loaded.');
    }

    const columns = this.getTableColumns(tableName);
    const foreignKeys = this.getTableForeignKeys(tableName);
    const primaryKeys = columns.filter((c) => c.pk > 0).map((c) => c.name);

    // Get SQL definition
    let sqlDef = '';
    try {
      const defRes = this.db.exec(
        `SELECT sql FROM sqlite_master WHERE name = ?`,
        [tableName]
      );
      if (defRes.length > 0 && defRes[0].values.length > 0) {
        sqlDef = String(defRes[0].values[0][0] || '');
      }
    } catch {
      // ignore
    }

    // Build combined filter clauses
    const whereClauses: string[] = [];
    const params: any[] = [];

    // 1. Text search across all columns
    if (filterText && filterText.trim().length > 0) {
      const text = `%${filterText.trim()}%`;
      const textClauses = columns.map((c) => `CAST("${c.name}" AS TEXT) LIKE ?`);
      if (textClauses.length > 0) {
        whereClauses.push(`(${textClauses.join(' OR ')})`);
        textClauses.forEach(() => params.push(text));
      }
    }

    // 2. Structured filter rules from Visual Filter Builder
    if (filterRules && filterRules.length > 0) {
      const ruleClauses: string[] = [];
      for (const rule of filterRules) {
        const col = columns.find((c) => c.name === rule.column);
        if (!col) {continue;}

        switch (rule.operator) {
          case '=':
          case '!=':
          case '>':
          case '>=':
          case '<':
          case '<=': {
            if (rule.value !== undefined && rule.value !== '') {
              ruleClauses.push(`"${col.name}" ${rule.operator} ?`);
              params.push(rule.value);
            }
            break;
          }
          case 'contains':
          case 'like':
          case 'LIKE': {
            if (rule.value) {
              ruleClauses.push(`CAST("${col.name}" AS TEXT) LIKE ?`);
              params.push(`%${rule.value}%`);
            }
            break;
          }
          case 'starts_with': {
            if (rule.value) {
              ruleClauses.push(`CAST("${col.name}" AS TEXT) LIKE ?`);
              params.push(`${rule.value}%`);
            }
            break;
          }
          case 'ends_with': {
            if (rule.value) {
              ruleClauses.push(`CAST("${col.name}" AS TEXT) LIKE ?`);
              params.push(`%${rule.value}`);
            }
            break;
          }
          case 'is_null': {
            ruleClauses.push(`"${col.name}" IS NULL`);
            break;
          }
          case 'is_not_null': {
            ruleClauses.push(`"${col.name}" IS NOT NULL`);
            break;
          }
          case 'in': {
            if (rule.value) {
              const items = rule.value.split(',').map((s) => s.trim()).filter(Boolean);
              if (items.length > 0) {
                const marks = items.map(() => '?').join(', ');
                ruleClauses.push(`"${col.name}" IN (${marks})`);
                items.forEach((it) => params.push(it));
              }
            }
            break;
          }
        }
      }

      if (ruleClauses.length > 0) {
        const conj = filterConjunction === 'OR' ? ' OR ' : ' AND ';
        whereClauses.push(`(${ruleClauses.join(conj)})`);
      }
    }

    const filterClause = whereClauses.length > 0 ? ` WHERE ${whereClauses.join(' AND ')}` : '';

    // Total filtered row count
    let totalRows = 0;
    try {
      const countSql = `SELECT COUNT(*) FROM "${tableName}"${filterClause}`;
      const countRes = this.db.exec(countSql, params);
      if (countRes.length > 0 && countRes[0].values.length > 0) {
        totalRows = Number(countRes[0].values[0][0]);
      }
    } catch {
      totalRows = 0;
    }

    // Order clause
    let orderClause = '';
    if (sortColumn && columns.some((c) => c.name === sortColumn)) {
      const dir = sortDirection.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
      orderClause = ` ORDER BY "${sortColumn}" ${dir}`;
    }

    // Check rowid availability
    let rowIdSelect = 'rowid as __rowid__, ';
    try {
      this.db.exec(`SELECT rowid FROM "${tableName}" LIMIT 1`);
    } catch {
      rowIdSelect = '';
    }

    const offset = Math.max(0, page) * Math.max(1, pageSize);
    const dataSql = `SELECT ${rowIdSelect}* FROM "${tableName}"${filterClause}${orderClause} LIMIT ${pageSize} OFFSET ${offset};`;

    const dataRes = this.db.exec(dataSql, params);
    const rows: any[] = [];

    if (dataRes.length > 0) {
      const colNames = dataRes[0].columns;
      const values = dataRes[0].values;
      for (const rowVal of values) {
        const rowObj: Record<string, any> = {};
        for (let i = 0; i < colNames.length; i++) {
          const val = rowVal[i];
          if (val instanceof Uint8Array) {
            // Encode binary BLOB as base64 preview with byte count
            rowObj[colNames[i]] = {
              __isBlob: true,
              size: val.byteLength,
              base64: Buffer.from(val).toString('base64'),
            };
          } else {
            rowObj[colNames[i]] = val;
          }
        }
        rows.push(rowObj);
      }
    }

    return {
      rows,
      totalRows,
      columns,
      primaryKeys,
      foreignKeys,
      sql: sqlDef,
    };
  }

  public executeQuery(query: string): {
    columns: string[];
    rows: any[];
    durationMs: number;
    rowsAffected?: number;
    error?: string;
  } {
    if (!this.db) {
      throw new Error('Database not loaded.');
    }

    const startTime = performance.now();
    try {
      const results = this.db.exec(query);
      const durationMs = Math.round((performance.now() - startTime) * 100) / 100;

      if (results.length === 0) {
        // Mutation or DDL query (no result set)
        const rowsAffected = this.db.getRowsModified();
        return {
          columns: [],
          rows: [],
          durationMs,
          rowsAffected,
        };
      }

      const firstResult = results[results.length - 1]; // return last result if multiple statements
      const columns = firstResult.columns;
      const MAX_QUERY_ROWS = 5000;
      const totalReturned = firstResult.values.length;
      const valuesToMap = totalReturned > MAX_QUERY_ROWS
        ? firstResult.values.slice(0, MAX_QUERY_ROWS)
        : firstResult.values;

      const rows = valuesToMap.map((v) => {
        const rowObj: Record<string, any> = {};
        for (let i = 0; i < columns.length; i++) {
          const val = v[i];
          if (val instanceof Uint8Array) {
            rowObj[columns[i]] = {
              __isBlob: true,
              size: val.byteLength,
              base64: Buffer.from(val).toString('base64'),
            };
          } else {
            rowObj[columns[i]] = val;
          }
        }
        return rowObj;
      });

      return {
        columns,
        rows,
        durationMs,
        rowsAffected: this.db.getRowsModified(),
        totalReturned,
        truncated: totalReturned > MAX_QUERY_ROWS,
      };
    } catch (err: any) {
      const durationMs = Math.round((performance.now() - startTime) * 100) / 100;
      return {
        columns: [],
        rows: [],
        durationMs,
        error: err.message || String(err),
      };
    }
  }

  public explainQuery(query: string): {
    plan: any[];
    warnings: string[];
  } {
    if (!this.db) {
      throw new Error('Database not loaded.');
    }

    const explainSql = `EXPLAIN QUERY PLAN ${query}`;
    const results = this.db.exec(explainSql);
    const warnings: string[] = [];

    if (results.length === 0) {
      return { plan: [], warnings: [] };
    }

    const columns = results[0].columns;
    const plan = results[0].values.map((v) => {
      const row: Record<string, any> = {};
      columns.forEach((c, idx) => (row[c] = v[idx]));
      const detail = String(row['detail'] || '');
      if (detail.includes('SCAN TABLE')) {
        warnings.push(`Full table scan detected: "${detail}". Consider adding an index.`);
      }
      return row;
    });

    return { plan, warnings };
  }

  public commitChanges(
    tableName: string,
    changes: CellChange[]
  ): { success: boolean; error?: string; message?: string } {
    if (!this.db) {
      throw new Error('Database not loaded.');
    }

    try {
      this.db.exec('BEGIN TRANSACTION;');

      for (const change of changes) {
        if (change.type === 'update' && change.updatedValues) {
          const setClauses: string[] = [];
          const params: any[] = [];

          for (const [col, val] of Object.entries(change.updatedValues)) {
            setClauses.push(`"${col}" = ?`);
            params.push(val);
          }

          // Where clause based on primary keys or rowId
          const whereClauses: string[] = [];
          if (
            change.primaryKeyValues &&
            Object.keys(change.primaryKeyValues).length > 0
          ) {
            for (const [pkCol, pkVal] of Object.entries(change.primaryKeyValues)) {
              whereClauses.push(`"${pkCol}" = ?`);
              params.push(pkVal);
            }
          } else if (change.rowId !== undefined) {
            whereClauses.push('rowid = ?');
            params.push(change.rowId);
          } else {
            throw new Error(
              `Cannot update row in "${tableName}": Missing primary key or rowid.`
            );
          }

          const updateSql = `UPDATE "${tableName}" SET ${setClauses.join(
            ', '
          )} WHERE ${whereClauses.join(' AND ')};`;
          this.db.run(updateSql, params);
        } else if (change.type === 'delete') {
          const whereClauses: string[] = [];
          const params: any[] = [];

          if (
            change.primaryKeyValues &&
            Object.keys(change.primaryKeyValues).length > 0
          ) {
            for (const [pkCol, pkVal] of Object.entries(change.primaryKeyValues)) {
              whereClauses.push(`"${pkCol}" = ?`);
              params.push(pkVal);
            }
          } else if (change.rowId !== undefined) {
            whereClauses.push('rowid = ?');
            params.push(change.rowId);
          } else {
            throw new Error(
              `Cannot delete row in "${tableName}": Missing primary key or rowid.`
            );
          }

          const deleteSql = `DELETE FROM "${tableName}" WHERE ${whereClauses.join(
            ' AND '
          )};`;
          this.db.run(deleteSql, params);
        } else if (change.type === 'insert' && change.updatedValues) {
          const cols = Object.keys(change.updatedValues);
          const placeholders = cols.map(() => '?').join(', ');
          const params = Object.values(change.updatedValues);

          const insertSql = `INSERT INTO "${tableName}" (${cols
            .map((c) => `"${c}"`)
            .join(', ')}) VALUES (${placeholders});`;
          this.db.run(insertSql, params);
        }
      }

      this.db.exec('COMMIT;');
      this.saveToDisk();

      return {
        success: true,
        message: `Successfully applied ${changes.length} change(s).`,
      };
    } catch (err: any) {
      try {
        this.db.exec('ROLLBACK;');
      } catch {
        // ignore
      }
      return {
        success: false,
        error: err.message || String(err),
      };
    }
  }

  public getForeignKeyRecord(
    targetTable: string,
    targetColumn: string,
    value: any
  ): any {
    if (!this.db) {return null;}
    try {
      const res = this.db.exec(
        `SELECT * FROM "${targetTable}" WHERE "${targetColumn}" = ? LIMIT 1;`,
        [value]
      );
      if (res.length > 0 && res[0].values.length > 0) {
        const cols = res[0].columns;
        const vals = res[0].values[0];
        const obj: Record<string, any> = {};
        cols.forEach((c, idx) => (obj[c] = vals[idx]));
        return obj;
      }
      return null;
    } catch (err: any) {
      throw new Error(`Failed to fetch foreign record: ${err.message}`);
    }
  }

  public generateMockData(
    tableName: string,
    count: number = 10
  ): Record<string, any>[] {
    if (!this.db) {throw new Error('Database not loaded.');}
    const columns = this.getTableColumns(tableName);
    const foreignKeys = this.getTableForeignKeys(tableName);
    return MockDataGenerator.generateRows(this.db, tableName, columns, foreignKeys, count);
  }

  public insertMockData(
    tableName: string,
    rows: Record<string, any>[]
  ): { success: boolean; count: number; error?: string } {
    if (!this.db) {throw new Error('Database not loaded.');}
    if (rows.length === 0) {return { success: true, count: 0 };}

    try {
      this.db.exec('BEGIN TRANSACTION;');
      for (const row of rows) {
        const cols = Object.keys(row);
        const placeholders = cols.map(() => '?').join(', ');
        const params = Object.values(row);
        const sql = `INSERT INTO "${tableName}" (${cols
          .map((c) => `"${c}"`)
          .join(', ')}) VALUES (${placeholders});`;
        this.db.run(sql, params);
      }
      this.db.exec('COMMIT;');
      this.saveToDisk();
      return { success: true, count: rows.length };
    } catch (err: any) {
      try {
        this.db.exec('ROLLBACK;');
      } catch {
        // ignore
      }
      return { success: false, count: 0, error: err.message };
    }
  }

  public importData(options: ImportOptions): {
    success: boolean;
    count: number;
    tableName: string;
    error?: string;
  } {
    if (!this.db) {
      throw new Error('Database not loaded.');
    }

    const { mode, targetTable, conflictStrategy, columns, rows } = options;
    const activeColumns = columns.filter((c) => !c.skip);

    if (activeColumns.length === 0) {
      return {
        success: false,
        count: 0,
        tableName: targetTable,
        error: 'No columns selected for import.',
      };
    }

    try {
      this.db.exec('BEGIN TRANSACTION;');

      // 1. If mode === 'new', create the new table schema
      if (mode === 'new') {
        const colDefs = activeColumns.map((col) => {
          let def = `"${col.targetName}" ${col.type || 'TEXT'}`;
          if (col.isPk) {
            def += ' PRIMARY KEY';
          }
          if (col.notNull) {
            def += ' NOT NULL';
          }
          return def;
        });

        // If no explicit PK, inject an auto-incrementing id
        const hasPk = activeColumns.some((c) => c.isPk);
        const colDefinitions = hasPk
          ? colDefs.join(', ')
          : `"id" INTEGER PRIMARY KEY AUTOINCREMENT, ${colDefs.join(', ')}`;

        const createSql = `CREATE TABLE IF NOT EXISTS "${targetTable}" (${colDefinitions});`;
        this.db.exec(createSql);
      }

      // 2. Prepare SQL Insert with conflict resolution strategy
      let insertVerb = 'INSERT INTO';
      if (conflictStrategy === 'replace') {
        insertVerb = 'INSERT OR REPLACE INTO';
      } else if (conflictStrategy === 'ignore') {
        insertVerb = 'INSERT OR IGNORE INTO';
      }

      const colNames = activeColumns.map((c) => `"${c.targetName}"`).join(', ');
      const placeholders = activeColumns.map(() => '?').join(', ');
      const insertSql = `${insertVerb} "${targetTable}" (${colNames}) VALUES (${placeholders});`;

      // 3. Insert records batch
      let insertedCount = 0;
      for (const row of rows) {
        const params = activeColumns.map((col) => {
          const val = row[col.sourceName];
          if (val === undefined || val === null || val === '') {
            return null;
          }

          const t = (col.type || '').toUpperCase();
          if (t.includes('INT')) {
            const parsed = parseInt(String(val), 10);
            return isNaN(parsed) ? null : parsed;
          }
          if (
            t.includes('REAL') ||
            t.includes('FLOAT') ||
            t.includes('DOUBLE') ||
            t.includes('NUMERIC') ||
            t.includes('DECIMAL')
          ) {
            const parsed = parseFloat(String(val));
            return isNaN(parsed) ? null : parsed;
          }
          if (t.includes('BOOL')) {
            if (val === true || val === 1 || val === '1' || String(val).toLowerCase() === 'true') {
              return 1;
            }
            if (val === false || val === 0 || val === '0' || String(val).toLowerCase() === 'false') {
              return 0;
            }
          }
          return String(val);
        });

        this.db.run(insertSql, params);
        insertedCount++;
      }

      this.db.exec('COMMIT;');
      this.saveToDisk();
      return { success: true, count: insertedCount, tableName: targetTable };
    } catch (err: any) {
      try {
        this.db.exec('ROLLBACK;');
      } catch {
        // ignore
      }
      return {
        success: false,
        count: 0,
        tableName: targetTable,
        error: err.message || String(err),
      };
    }
  }
}
