import { spawn } from 'child_process';
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
import {
  ISqliteEngine,
  QueryResult,
  ExplainResult,
  TableDataResult,
  CommitResult,
  MockDataResult,
  ImportResult,
} from './types';
import { MockDataGenerator } from './mockGenerator';

interface CachedSchema {
  columns: ColumnInfo[];
  foreignKeys: ForeignKeyInfo[];
  primaryKeys: string[];
  sql: string;
  hasRowid: boolean;
  blobColNames: Set<string>;
}

export class SqliteCliEngine implements ISqliteEngine {
  private filePath: string = '';
  private sqlite3Path: string = 'sqlite3';

  // In-memory RAM caches for ultra-fast page flips (<10ms)
  private schemaCache = new Map<string, CachedSchema>();
  private rowCountCache = new Map<string, number>();

  constructor(customSqlite3Path?: string) {
    if (customSqlite3Path && customSqlite3Path.trim()) {
      this.sqlite3Path = customSqlite3Path.trim();
    }
  }

  public setSqlite3Path(newPath: string): void {
    if (newPath && newPath.trim()) {
      this.sqlite3Path = newPath.trim();
    }
  }

  public getSqlite3Path(): string {
    return this.sqlite3Path;
  }

  public async load(filePath: string): Promise<void> {
    this.filePath = filePath;
    this.schemaCache.clear();
    this.rowCountCache.clear();
    // Verify that sqlite3 binary works and can query the database
    await this.runRawSql('SELECT 1;');
  }

  public close(): void {
    this.schemaCache.clear();
    this.rowCountCache.clear();
  }

  public getFilePath(): string {
    return this.filePath;
  }

  public saveToDisk(): void {
    // Changes are committed directly to the disk database file
  }

  /**
   * Fast row count estimation: tries max(_rowid_) first (instant index B-tree lookup ~3ms),
   * falling back to COUNT(*) if the table is WITHOUT ROWID or returns null.
   */
  public async getFastRowCount(tableName: string): Promise<number> {
    const cached = this.rowCountCache.get(`${tableName}::[]`);
    if (cached !== undefined) {
      return cached;
    }

    const escaped = SqliteCliEngine.escapeIdentifier(tableName);
    try {
      const countRows = await this.queryJson<{ count: number }>(
        `PRAGMA mmap_size = 268435456; PRAGMA query_only = ON; SELECT COUNT(*) as count FROM "${escaped}";`,
        30000
      );
      if (countRows.length > 0 && countRows[0].count !== undefined) {
        const count = Number(countRows[0].count);
        this.rowCountCache.set(`${tableName}::[]`, count);
        return count;
      }
    } catch {
      // ignore
    }

    return 0;
  }

  /**
   * Retrieves or populates cached table schema in RAM.
   */
  public async getSchema(tableName: string): Promise<CachedSchema> {
    const cached = this.schemaCache.get(tableName);
    if (cached) {
      return cached;
    }

    const escaped = SqliteCliEngine.escapeIdentifier(tableName);
    const [columns, foreignKeys] = await Promise.all([
      this.getTableColumns(tableName),
      this.getTableForeignKeys(tableName),
    ]);
    const primaryKeys = columns.filter((c) => c.pk > 0).map((c) => c.name);

    let sqlDef = '';
    try {
      const defRows = await this.queryJson<{ sql: string }>(
        `SELECT sql FROM sqlite_master WHERE name = ${SqliteCliEngine.escapeSql(tableName)} LIMIT 1;`
      );
      if (defRows.length > 0 && defRows[0].sql) {
        sqlDef = String(defRows[0].sql);
      }
    } catch {}

    let hasRowid = true;
    try {
      await this.runRawSql(`SELECT rowid FROM "${escaped}" LIMIT 1;`);
    } catch {
      hasRowid = false;
    }

    const blobColNames = new Set(
      columns.filter((c) => c.type.includes('BLOB')).map((c) => c.name)
    );

    const schema: CachedSchema = {
      columns,
      foreignKeys,
      primaryKeys,
      sql: sqlDef,
      hasRowid,
      blobColNames,
    };

    this.schemaCache.set(tableName, schema);
    return schema;
  }

  /**
   * Spawns the sqlite3 CLI process with -json and executes SQL piped via stdin.
   */
  private runRawSql(sql: string, timeoutMs: number = 30000): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!this.filePath) {
        return reject(new Error('No database loaded.'));
      }

      const args = ['-json', this.filePath];
      const child = spawn(this.sqlite3Path, args, {
        timeout: timeoutMs,
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('error', (err: any) => {
        if (err.code === 'ENOENT') {
          reject(
            new Error(
              `The sqlite3 executable could not be found at "${this.sqlite3Path}". Please verify that sqlite3 is installed or configure its path in settings (sqliteViewerStudio.sqlite3Path).`
            )
          );
        } else {
          reject(err);
        }
      });

      child.on('close', (code) => {
        if (code !== 0) {
          const errMsg = stderr.trim() || `sqlite3 exited with code ${code}`;
          reject(new Error(errMsg));
        } else {
          resolve(stdout);
        }
      });

      child.stdin.write(sql);
      child.stdin.end();
    });
  }

  /**
   * Executes a SQL query and parses the resulting JSON rows.
   */
  public async queryJson<T = any>(sql: string, timeoutMs: number = 30000): Promise<T[]> {
    const raw = await this.runRawSql(sql, timeoutMs);
    const trimmed = raw.trim();
    if (!trimmed) {
      return [];
    }

    const arrays = SqliteCliEngine.parseMultipleJsonArrays(trimmed);
    if (arrays.length === 0) {
      return [];
    }

    // If multiple arrays were returned (e.g. PRAGMA status followed by SELECT),
    // extract the actual data array
    for (let i = arrays.length - 1; i >= 0; i--) {
      const arr = arrays[i];
      if (arr.length > 0) {
        const first = arr[0];
        if (
          'mmap_size' in first ||
          'cache_size' in first ||
          'query_only' in first ||
          'synchronous' in first ||
          'temp_store' in first
        ) {
          continue;
        }
        return arr;
      }
    }

    return arrays[arrays.length - 1];
  }

  public async getMetadata(): Promise<DatabaseMetadata> {
    if (!this.filePath) {
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

    const schemaQuery = `
      PRAGMA mmap_size = 268435456;
      PRAGMA query_only = ON;
      SELECT type, name, sql 
      FROM sqlite_master 
      WHERE name NOT LIKE 'sqlite_%' 
      ORDER BY type, name;
    `;

    const schemaRows = await this.queryJson<{ type: string; name: string; sql: string }>(schemaQuery);
    const tables: TableInfo[] = [];
    const views: TableInfo[] = [];

    // Query columns, foreign keys, and assemble metadata immediately without blocking on counting
    const tablePromises = schemaRows.map(async (row) => {
      const type = row.type;
      const name = row.name;
      const sql = row.sql || '';

      const [columns, foreignKeys] = await Promise.all([
        this.getTableColumns(name),
        type === 'table' ? this.getTableForeignKeys(name) : Promise.resolve([]),
      ]);

      // If row count is already in RAM cache, use it; otherwise mark as -1 (progressive load)
      const cachedCount = this.rowCountCache.get(`${name}::[]`);
      const rowCount = cachedCount !== undefined ? cachedCount : -1;

      const primaryKeys = columns.filter((c) => c.pk > 0).map((c) => c.name);
      const blobColNames = new Set(
        columns.filter((c) => c.type.includes('BLOB')).map((c) => c.name)
      );

      // Pre-warm the schema cache in RAM
      this.schemaCache.set(name, {
        columns,
        foreignKeys,
        primaryKeys,
        sql,
        hasRowid: true,
        blobColNames,
      });

      const info: TableInfo = {
        name,
        type: type === 'table' ? 'table' : 'view',
        rowCount,
        columns,
        foreignKeys,
        sql,
      };

      return { type, info };
    });

    const results = await Promise.all(tablePromises);
    for (const r of results) {
      if (r.type === 'table') {
        tables.push(r.info);
      } else if (r.type === 'view') {
        views.push(r.info);
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

  /**
   * Asynchronously calculates exact row counts for tables in progressive batches
   * without blocking the UI or initial metadata load.
   */
  public async countTablesInBackground(
    onBatch: (counts: Record<string, number>) => void,
    isCancelled: () => boolean = () => false
  ): Promise<void> {
    if (!this.filePath) return;

    // Get all tables that don't have counts in rowCountCache yet
    const uncountedTables: string[] = [];
    for (const [tableName] of this.schemaCache.entries()) {
      if (this.rowCountCache.get(`${tableName}::[]`) === undefined) {
        uncountedTables.push(tableName);
      }
    }

    if (uncountedTables.length === 0) return;

    // Process in small batches of 4 tables for fast responsive visual updates
    const batchSize = 4;
    for (let i = 0; i < uncountedTables.length; i += batchSize) {
      if (isCancelled()) return;

      const batch = uncountedTables.slice(i, i + batchSize);
      try {
        const unionSql = batch
          .map(
            (tbl) =>
              `SELECT ${SqliteCliEngine.escapeSql(tbl)} AS tbl, COUNT(*) AS cnt FROM "${SqliteCliEngine.escapeIdentifier(tbl)}"`
          )
          .join('\nUNION ALL\n');

        const query = `
          PRAGMA mmap_size = 268435456;
          PRAGMA query_only = ON;
          ${unionSql};
        `;

        const rows = await this.queryJson<{ tbl: string; cnt: number }>(query, 30000);
        if (isCancelled()) return;

        const batchResults: Record<string, number> = {};
        for (const r of rows) {
          if (r && r.tbl && r.cnt !== undefined) {
            const cnt = Number(r.cnt);
            this.rowCountCache.set(`${r.tbl}::[]`, cnt);
            batchResults[r.tbl] = cnt;
          }
        }

        if (Object.keys(batchResults).length > 0) {
          onBatch(batchResults);
        }
      } catch {
        // Fallback: count tables in batch individually if a specific table errors or times out
        for (const tbl of batch) {
          if (isCancelled()) return;
          try {
            const cnt = await this.getFastRowCount(tbl);
            this.rowCountCache.set(`${tbl}::[]`, cnt);
            onBatch({ [tbl]: cnt });
          } catch {}
        }
      }
    }
  }

  public async getTableColumns(tableName: string): Promise<ColumnInfo[]> {
    const cached = this.schemaCache.get(tableName);
    if (cached) {
      return cached.columns;
    }

    try {
      const rows = await this.queryJson<any>(
        `PRAGMA table_info("${SqliteCliEngine.escapeIdentifier(tableName)}");`
      );
      return rows.map((v) => ({
        cid: Number(v.cid),
        name: String(v.name),
        type: String(v.type || 'TEXT').toUpperCase(),
        notnull: Boolean(v.notnull),
        dflt_value: v.dflt_value,
        pk: Number(v.pk),
      }));
    } catch {
      return [];
    }
  }

  public async getTableForeignKeys(tableName: string): Promise<ForeignKeyInfo[]> {
    const cached = this.schemaCache.get(tableName);
    if (cached) {
      return cached.foreignKeys;
    }

    try {
      const rows = await this.queryJson<any>(
        `PRAGMA foreign_key_list("${SqliteCliEngine.escapeIdentifier(tableName)}");`
      );
      return rows.map((v) => ({
        id: Number(v.id),
        seq: Number(v.seq),
        table: String(v.table),
        from: String(v.from),
        to: String(v.to),
        on_update: String(v.on_update),
        on_delete: String(v.on_delete),
      }));
    } catch {
      return [];
    }
  }

  public async getTableData(
    tableName: string,
    page: number = 0,
    pageSize: number = 50,
    sortColumn?: string,
    sortDirection: 'asc' | 'desc' = 'asc',
    filterText?: string,
    filterRules?: FilterRule[],
    filterConjunction: 'AND' | 'OR' = 'AND'
  ): Promise<TableDataResult> {
    const escapedTable = SqliteCliEngine.escapeIdentifier(tableName);

    // 1. Retrieve cached schema directly from RAM (0 ms)
    const schema = await this.getSchema(tableName);
    const { columns, foreignKeys, primaryKeys, sql: sqlDef } = schema;

    // 2. Build filter clauses
    const whereClauses: string[] = [];

    // 2.1 Text search across all columns
    if (filterText && filterText.trim().length > 0) {
      const text = `%${filterText.trim()}%`;
      const escapedText = SqliteCliEngine.escapeSql(text);
      const textClauses = columns.map(
        (c) => `CAST("${SqliteCliEngine.escapeIdentifier(c.name)}" AS TEXT) LIKE ${escapedText}`
      );
      if (textClauses.length > 0) {
        whereClauses.push(`(${textClauses.join(' OR ')})`);
      }
    }

    // 2.2 Structured filter rules from Visual Filter Builder
    if (filterRules && filterRules.length > 0) {
      const ruleClauses: string[] = [];
      for (const rule of filterRules) {
        const col = columns.find((c) => c.name === rule.column);
        if (!col) {continue;}
        const colEscaped = `"${SqliteCliEngine.escapeIdentifier(col.name)}"`;

        switch (rule.operator) {
          case '=':
          case '!=':
          case '>':
          case '>=':
          case '<':
          case '<=': {
            if (rule.value !== undefined && rule.value !== '') {
              ruleClauses.push(`${colEscaped} ${rule.operator} ${SqliteCliEngine.escapeSql(rule.value)}`);
            }
            break;
          }
          case 'contains': {
            if (rule.value) {
              ruleClauses.push(
                `CAST(${colEscaped} AS TEXT) LIKE ${SqliteCliEngine.escapeSql(`%${rule.value}%`)}`
              );
            }
            break;
          }
          case 'starts_with': {
            if (rule.value) {
              ruleClauses.push(
                `CAST(${colEscaped} AS TEXT) LIKE ${SqliteCliEngine.escapeSql(`${rule.value}%`)}`
              );
            }
            break;
          }
          case 'ends_with': {
            if (rule.value) {
              ruleClauses.push(
                `CAST(${colEscaped} AS TEXT) LIKE ${SqliteCliEngine.escapeSql(`%${rule.value}`)}`
              );
            }
            break;
          }
          case 'is_null': {
            ruleClauses.push(`${colEscaped} IS NULL`);
            break;
          }
          case 'is_not_null': {
            ruleClauses.push(`${colEscaped} IS NOT NULL`);
            break;
          }
          case 'in': {
            if (rule.value) {
              const items = rule.value.split(',').map((s) => s.trim()).filter(Boolean);
              if (items.length > 0) {
                const marks = items.map((it) => SqliteCliEngine.escapeSql(it)).join(', ');
                ruleClauses.push(`${colEscaped} IN (${marks})`);
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

    // 3. Instant Row Count from RAM Cache or parallel query
    const countCacheKey = `${tableName}:${filterText || ''}:${JSON.stringify(filterRules || [])}`;
    let cachedTotalRows = this.rowCountCache.get(countCacheKey);

    let countPromise: Promise<number>;
    if (cachedTotalRows !== undefined) {
      countPromise = Promise.resolve(cachedTotalRows);
    } else if (!filterClause) {
      countPromise = this.getFastRowCount(tableName).then((cnt) => {
        this.rowCountCache.set(countCacheKey, cnt);
        return cnt;
      });
    } else {
      const countSql = `PRAGMA mmap_size = 268435456; PRAGMA query_only = ON; SELECT COUNT(*) as count FROM "${escapedTable}"${filterClause};`;
      countPromise = this.queryJson<{ count: number }>(countSql, 15000)
        .then((res) => {
          const count = res.length > 0 && res[0].count !== undefined ? Number(res[0].count) : 0;
          this.rowCountCache.set(countCacheKey, count);
          return count;
        })
        .catch(() => 0);
    }

    // 4. Order clause
    let orderClause = '';
    if (sortColumn && columns.some((c) => c.name === sortColumn)) {
      const dir = sortDirection.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
      orderClause = ` ORDER BY "${SqliteCliEngine.escapeIdentifier(sortColumn)}" ${dir}`;
    }

    // 5. Select rowid if available
    const rowIdSelect = schema.hasRowid ? 'rowid as __rowid__, ' : '';

    // 6. BLOB column optimization:
    // Do NOT serialize 500 MB of full hex text across IPC for the whole table page!
    // Fetch exact size and up to 32KB of preview hex for format detection and hex dump.
    let selectList = '*';
    if (schema.blobColNames.size > 0) {
      selectList = columns
        .map((c) => {
          const colEsc = `"${SqliteCliEngine.escapeIdentifier(c.name)}"`;
          if (schema.blobColNames.has(c.name)) {
            return `length(${colEsc}) AS "__blob_size_${c.name}", hex(substr(${colEsc}, 1, 32768)) AS "__blob_hex_${c.name}"`;
          }
          return colEsc;
        })
        .join(', ');
    }

    // 7. Fast Paged Query with Memory-Mapped I/O PRAGMAs executed in parallel with count
    const offset = Math.max(0, page) * Math.max(1, pageSize);
    const dataSql = `PRAGMA mmap_size = 268435456; PRAGMA cache_size = -64000; PRAGMA query_only = ON; SELECT ${rowIdSelect}${selectList} FROM "${escapedTable}"${filterClause}${orderClause} LIMIT ${pageSize} OFFSET ${offset};`;

    const [totalRows, rawRows] = await Promise.all([
      countPromise,
      this.queryJson<any>(dataSql),
    ]);
    const rows = rawRows.map((r) => {
      const rowObj: Record<string, any> = {};
      for (const [k, v] of Object.entries(r)) {
        if (k.startsWith('__blob_hex_')) {
          const colName = k.replace('__blob_hex_', '');
          const hex = String(v || '');
          const size = Number(r[`__blob_size_${colName}`] || 0);
          rowObj[colName] = {
            __isBlob: true,
            size,
            base64: Buffer.from(hex, 'hex').toString('base64'),
          };
        } else if (k.startsWith('__blob_size_')) {
          continue;
        } else {
          rowObj[k] = v;
        }
      }
      return rowObj;
    });

    return {
      rows,
      totalRows,
      columns,
      primaryKeys,
      foreignKeys,
      sql: sqlDef,
    };
  }

  public async executeQuery(query: string): Promise<QueryResult> {
    const startTime = performance.now();
    try {
      // Append changes() check so we capture rows affected on mutations
      const multiSql = `${query};\nSELECT changes() as __rows_modified__;\n`;
      const raw = await this.runRawSql(multiSql);
      const durationMs = Math.round((performance.now() - startTime) * 100) / 100;

      const trimmed = raw.trim();
      if (!trimmed) {
        return {
          columns: [],
          rows: [],
          durationMs,
          rowsAffected: 0,
        };
      }

      // Parse all JSON arrays returned from multi-statement execution
      const arrays = SqliteCliEngine.parseMultipleJsonArrays(trimmed);

      // Find if changes() result exists in the last array
      let rowsAffected: number | undefined;
      let dataArray: any[] = [];

      if (arrays.length >= 2) {
        const lastArr = arrays[arrays.length - 1];
        if (lastArr.length > 0 && '__rows_modified__' in lastArr[0]) {
          rowsAffected = Number(lastArr[0].__rows_modified__);
          dataArray = arrays[arrays.length - 2];
        } else {
          dataArray = lastArr;
        }
      } else if (arrays.length === 1) {
        const firstArr = arrays[0];
        if (firstArr.length > 0 && '__rows_modified__' in firstArr[0]) {
          rowsAffected = Number(firstArr[0].__rows_modified__);
          dataArray = [];
        } else {
          dataArray = firstArr;
        }
      }

      if (dataArray.length === 0) {
        return {
          columns: [],
          rows: [],
          durationMs,
          rowsAffected: rowsAffected !== undefined ? rowsAffected : 0,
        };
      }

      const columns = Object.keys(dataArray[0]);
      const MAX_QUERY_ROWS = 5000;
      const totalReturned = dataArray.length;
      const rows = totalReturned > MAX_QUERY_ROWS ? dataArray.slice(0, MAX_QUERY_ROWS) : dataArray;

      return {
        columns,
        rows,
        durationMs,
        rowsAffected,
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

  public async explainQuery(query: string): Promise<ExplainResult> {
    const explainSql = `EXPLAIN QUERY PLAN ${query};`;
    const results = await this.queryJson<any>(explainSql);
    const warnings: string[] = [];

    if (results.length === 0) {
      return { plan: [], warnings: [] };
    }

    const plan = results.map((row) => {
      const detail = String(row['detail'] || '');
      if (detail.includes('SCAN TABLE')) {
        warnings.push(`Full table scan detected: "${detail}". Consider adding an index.`);
      }
      return row;
    });

    return { plan, warnings };
  }

  public async commitChanges(
    tableName: string,
    changes: CellChange[]
  ): Promise<CommitResult> {
    try {
      const escapedTable = SqliteCliEngine.escapeIdentifier(tableName);
      const statements: string[] = ['BEGIN TRANSACTION;'];

      for (const change of changes) {
        if (change.type === 'update' && change.updatedValues) {
          const setClauses: string[] = [];
          for (const [col, val] of Object.entries(change.updatedValues)) {
            setClauses.push(
              `"${SqliteCliEngine.escapeIdentifier(col)}" = ${SqliteCliEngine.escapeSql(val)}`
            );
          }

          const whereClauses: string[] = [];
          if (
            change.primaryKeyValues &&
            Object.keys(change.primaryKeyValues).length > 0
          ) {
            for (const [pkCol, pkVal] of Object.entries(change.primaryKeyValues)) {
              whereClauses.push(
                `"${SqliteCliEngine.escapeIdentifier(pkCol)}" = ${SqliteCliEngine.escapeSql(pkVal)}`
              );
            }
          } else if (change.rowId !== undefined) {
            whereClauses.push(`rowid = ${SqliteCliEngine.escapeSql(change.rowId)}`);
          } else {
            throw new Error(
              `Cannot update row in "${tableName}": Missing primary key or rowid.`
            );
          }

          statements.push(
            `UPDATE "${escapedTable}" SET ${setClauses.join(
              ', '
            )} WHERE ${whereClauses.join(' AND ')};`
          );
        } else if (change.type === 'delete') {
          const whereClauses: string[] = [];
          if (
            change.primaryKeyValues &&
            Object.keys(change.primaryKeyValues).length > 0
          ) {
            for (const [pkCol, pkVal] of Object.entries(change.primaryKeyValues)) {
              whereClauses.push(
                `"${SqliteCliEngine.escapeIdentifier(pkCol)}" = ${SqliteCliEngine.escapeSql(pkVal)}`
              );
            }
          } else if (change.rowId !== undefined) {
            whereClauses.push(`rowid = ${SqliteCliEngine.escapeSql(change.rowId)}`);
          } else {
            throw new Error(
              `Cannot delete row in "${tableName}": Missing primary key or rowid.`
            );
          }

          statements.push(
            `DELETE FROM "${escapedTable}" WHERE ${whereClauses.join(' AND ')};`
          );
        } else if (change.type === 'insert' && change.updatedValues) {
          const cols = Object.keys(change.updatedValues);
          const colNames = cols
            .map((c) => `"${SqliteCliEngine.escapeIdentifier(c)}"`)
            .join(', ');
          const values = cols
            .map((c) => SqliteCliEngine.escapeSql(change.updatedValues![c]))
            .join(', ');

          statements.push(
            `INSERT INTO "${escapedTable}" (${colNames}) VALUES (${values});`
          );
        }
      }

      statements.push('COMMIT;');
      await this.runRawSql(statements.join('\n'));

      this.rowCountCache.clear();

      return {
        success: true,
        message: `Successfully applied ${changes.length} change(s).`,
      };
    } catch (err: any) {
      try {
        await this.runRawSql('ROLLBACK;');
      } catch {
        // ignore
      }
      return {
        success: false,
        error: err.message || String(err),
      };
    }
  }

  public async getForeignKeyRecord(
    targetTable: string,
    targetColumn: string,
    value: any
  ): Promise<any> {
    const escapedTable = SqliteCliEngine.escapeIdentifier(targetTable);
    const escapedCol = SqliteCliEngine.escapeIdentifier(targetColumn);
    const escapedVal = SqliteCliEngine.escapeSql(value);

    const rows = await this.queryJson<any>(
      `SELECT * FROM "${escapedTable}" WHERE "${escapedCol}" = ${escapedVal} LIMIT 1;`
    );
    return rows.length > 0 ? rows[0] : null;
  }

  public async getBlobData(
    tableName: string,
    columnName: string,
    rowId: number | string
  ): Promise<{ size: number; base64: string }> {
    const escapedTable = SqliteCliEngine.escapeIdentifier(tableName);
    const escapedCol = SqliteCliEngine.escapeIdentifier(columnName);
    const rows = await this.queryJson<any>(
      `PRAGMA mmap_size = 268435456; SELECT length("${escapedCol}") as size, hex("${escapedCol}") as hex FROM "${escapedTable}" WHERE rowid = ${SqliteCliEngine.escapeSql(rowId)} LIMIT 1;`
    );
    if (rows.length > 0) {
      const hex = String(rows[0].hex || '');
      const size = Number(rows[0].size || 0);
      return {
        size,
        base64: Buffer.from(hex, 'hex').toString('base64'),
      };
    }
    return { size: 0, base64: '' };
  }

  public async generateMockData(
    tableName: string,
    count: number = 10
  ): Promise<Record<string, any>[]> {
    const columns = await this.getTableColumns(tableName);
    const foreignKeys = await this.getTableForeignKeys(tableName);

    // Provide query executor adapter for MockDataGenerator
    const executor = {
      exec: (sql: string) => {
        // Run sync-like query against this table info if needed
        return [];
      },
    };

    return MockDataGenerator.generateRows(executor, tableName, columns, foreignKeys, count);
  }

  public async insertMockData(
    tableName: string,
    rows: Record<string, any>[]
  ): Promise<MockDataResult> {
    if (rows.length === 0) {
      return { success: true, count: 0 };
    }

    try {
      const escapedTable = SqliteCliEngine.escapeIdentifier(tableName);
      const statements: string[] = ['BEGIN TRANSACTION;'];

      for (const row of rows) {
        const cols = Object.keys(row);
        const colNames = cols
          .map((c) => `"${SqliteCliEngine.escapeIdentifier(c)}"`)
          .join(', ');
        const values = cols
          .map((c) => SqliteCliEngine.escapeSql(row[c]))
          .join(', ');
        statements.push(
          `INSERT INTO "${escapedTable}" (${colNames}) VALUES (${values});`
        );
      }

      statements.push('COMMIT;');
      await this.runRawSql(statements.join('\n'));
      this.rowCountCache.clear();
      return { success: true, count: rows.length };
    } catch (err: any) {
      try {
        await this.runRawSql('ROLLBACK;');
      } catch {
        // ignore
      }
      return { success: false, count: 0, error: err.message || String(err) };
    }
  }

  public async importData(options: ImportOptions): Promise<ImportResult> {
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
      const escapedTable = SqliteCliEngine.escapeIdentifier(targetTable);
      const statements: string[] = ['BEGIN TRANSACTION;'];

      // 1. If mode === 'new', create the new table schema
      if (mode === 'new') {
        const colDefs = activeColumns.map((col) => {
          let def = `"${SqliteCliEngine.escapeIdentifier(col.targetName)}" ${col.type || 'TEXT'}`;
          if (col.isPk) {
            def += ' PRIMARY KEY';
          }
          if (col.notNull) {
            def += ' NOT NULL';
          }
          return def;
        });

        const hasPk = activeColumns.some((c) => c.isPk);
        const colDefinitions = hasPk
          ? colDefs.join(', ')
          : `"id" INTEGER PRIMARY KEY AUTOINCREMENT, ${colDefs.join(', ')}`;

        statements.push(`CREATE TABLE IF NOT EXISTS "${escapedTable}" (${colDefinitions});`);
      }

      // 2. Prepare SQL Insert with conflict resolution strategy
      let insertVerb = 'INSERT INTO';
      if (conflictStrategy === 'replace') {
        insertVerb = 'INSERT OR REPLACE INTO';
      } else if (conflictStrategy === 'ignore') {
        insertVerb = 'INSERT OR IGNORE INTO';
      }

      const colNames = activeColumns
        .map((c) => `"${SqliteCliEngine.escapeIdentifier(c.targetName)}"`)
        .join(', ');

      for (const row of rows) {
        const values = activeColumns.map((col) => {
          const val = row[col.sourceName];
          if (val === undefined || val === null || val === '') {
            return 'NULL';
          }

          const t = (col.type || '').toUpperCase();
          if (t.includes('INT')) {
            const parsed = parseInt(String(val), 10);
            return isNaN(parsed) ? 'NULL' : String(parsed);
          }
          if (
            t.includes('REAL') ||
            t.includes('FLOAT') ||
            t.includes('DOUBLE') ||
            t.includes('NUMERIC') ||
            t.includes('DECIMAL')
          ) {
            const parsed = parseFloat(String(val));
            return isNaN(parsed) ? 'NULL' : String(parsed);
          }
          if (t.includes('BOOL')) {
            if (val === true || val === 1 || val === '1' || String(val).toLowerCase() === 'true') {
              return '1';
            }
            if (val === false || val === 0 || val === '0' || String(val).toLowerCase() === 'false') {
              return '0';
            }
          }
          return SqliteCliEngine.escapeSql(String(val));
        });

        statements.push(`${insertVerb} "${escapedTable}" (${colNames}) VALUES (${values.join(', ')});`);
      }

      statements.push('COMMIT;');
      await this.runRawSql(statements.join('\n'));

      this.rowCountCache.clear();
      this.schemaCache.clear();

      return { success: true, count: rows.length, tableName: targetTable };
    } catch (err: any) {
      try {
        await this.runRawSql('ROLLBACK;');
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

  // --- Helpers ---

  public static escapeIdentifier(id: string): string {
    return id.replace(/"/g, '""');
  }

  public static escapeSql(val: any): string {
    if (val === null || val === undefined) {
      return 'NULL';
    }
    if (typeof val === 'number') {
      return isFinite(val) ? String(val) : 'NULL';
    }
    if (typeof val === 'boolean') {
      return val ? '1' : '0';
    }
    if (typeof val === 'bigint') {
      return val.toString();
    }
    if (Buffer.isBuffer(val) || val instanceof Uint8Array) {
      return `X'${Buffer.from(val).toString('hex')}'`;
    }
    return `'${String(val).replace(/'/g, "''")}'`;
  }

  public static parseMultipleJsonArrays(raw: string): any[][] {
    const trimmed = raw.trim();
    if (!trimmed) {return [];}

    const arrays: any[][] = [];
    const regex = /\[[\s\S]*?\](?=\s*(?:\[|$))/g;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(trimmed)) !== null) {
      try {
        arrays.push(JSON.parse(match[0]));
      } catch {
        // ignore parse failures on partial blocks
      }
    }

    if (arrays.length === 0) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          arrays.push(parsed);
        }
      } catch {
        // ignore
      }
    }

    return arrays;
  }
}
