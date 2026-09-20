import { spawnSync } from 'child_process';
import * as fs from 'fs';
import {
  ColumnInfo,
  DatabaseMetadata,
  ForeignKeyInfo,
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
import { SqliteCliEngine } from './sqliteCliEngine';
import { SqliteWasmEngine } from './wasmEngine';

export class SqliteEngine implements ISqliteEngine {
  private activeEngine: ISqliteEngine | null = null;
  private filePath: string = '';

  public static async init(wasmDir: string): Promise<void> {
    await SqliteWasmEngine.init(wasmDir);
  }

  public static findSqlite3Executable(customPath?: string): string | null {
    if (customPath && customPath.trim()) {
      const trimmed = customPath.trim();
      if (fs.existsSync(trimmed)) {
        return trimmed;
      }
    }

    // Check system PATH
    try {
      const res = spawnSync('sqlite3', ['--version'], {
        encoding: 'utf-8',
        timeout: 2000,
      });
      if (res.status === 0) {
        return 'sqlite3';
      }
    } catch {
      // ignore
    }

    // Platform-specific standard paths
    const commonPaths =
      process.platform === 'win32'
        ? [
            'C:\\Windows\\System32\\sqlite3.exe',
            'C:\\Program Files\\SQLite\\sqlite3.exe',
            'C:\\Program Files (x86)\\SQLite\\sqlite3.exe',
            'C:\\sqlite\\sqlite3.exe',
          ]
        : [
            '/usr/bin/sqlite3',
            '/usr/local/bin/sqlite3',
            '/opt/homebrew/bin/sqlite3',
          ];

    for (const p of commonPaths) {
      if (fs.existsSync(p)) {
        try {
          const res = spawnSync(p, ['--version'], {
            encoding: 'utf-8',
            timeout: 2000,
          });
          if (res.status === 0) {
            return p;
          }
        } catch {
          // ignore
        }
      }
    }

    return null;
  }

  public async load(
    filePath: string,
    fileBuffer?: Buffer | Uint8Array,
    customSqlitePath?: string
  ): Promise<void> {
    this.close();
    this.filePath = filePath;

    // If memory buffer is supplied directly (e.g. virtual VS Code document)
    if (fileBuffer) {
      const wasm = new SqliteWasmEngine();
      wasm.load(filePath, fileBuffer);
      this.activeEngine = wasm;
      return;
    }

    // Physical disk file
    if (fs.existsSync(filePath)) {
      const stats = fs.statSync(filePath);
      const isHeavy = stats.size >= 100 * 1024 * 1024; // >= 100MB
      const isOver2GiB = stats.size >= 2 * 1024 * 1024 * 1024; // >= 2 GiB

      const sqlite3Bin = SqliteEngine.findSqlite3Executable(customSqlitePath);

      if (sqlite3Bin) {
        // Disk-backed CLI engine: 0 RAM overhead, streams/pages on demand directly from disk
        const cli = new SqliteCliEngine(sqlite3Bin);
        await cli.load(filePath);
        this.activeEngine = cli;
        return;
      }

      if (isOver2GiB) {
        throw new Error(
          `Database file size (${(stats.size / (1024 * 1024 * 1024)).toFixed(2)} GiB) exceeds 2 GiB. ` +
            `SQLite databases of this size cannot be allocated into WebAssembly memory. ` +
            `Please install the sqlite3 CLI tool or specify its path in Settings (sqliteViewerStudio.sqlite3Path) to query directly from disk.`
        );
      }

      // Fall back to WASM for smaller files if sqlite3 CLI is missing
      const wasm = new SqliteWasmEngine();
      const buffer = fs.readFileSync(filePath);
      wasm.load(filePath, buffer);
      this.activeEngine = wasm;
      return;
    }

    throw new Error(`Database file not found: ${filePath}`);
  }

  public close(): void {
    if (this.activeEngine) {
      try {
        this.activeEngine.close();
      } catch (err) {
        console.error('Error closing SQLite engine:', err);
      }
      this.activeEngine = null;
    }
  }

  public getFilePath(): string {
    return this.activeEngine ? this.activeEngine.getFilePath() : this.filePath;
  }

  public saveToDisk(): void {
    if (this.activeEngine?.saveToDisk) {
      this.activeEngine.saveToDisk();
    }
  }

  public async getMetadata(): Promise<DatabaseMetadata> {
    if (!this.activeEngine) {
      throw new Error('No database loaded.');
    }
    return this.activeEngine.getMetadata();
  }

  public async getTableColumns(tableName: string): Promise<ColumnInfo[]> {
    if (!this.activeEngine) {
      return [];
    }
    return this.activeEngine.getTableColumns(tableName);
  }

  public async getTableForeignKeys(tableName: string): Promise<ForeignKeyInfo[]> {
    if (!this.activeEngine) {
      return [];
    }
    return this.activeEngine.getTableForeignKeys(tableName);
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
    if (!this.activeEngine) {
      throw new Error('Database not loaded.');
    }
    return this.activeEngine.getTableData(
      tableName,
      page,
      pageSize,
      sortColumn,
      sortDirection,
      filterText,
      filterRules,
      filterConjunction
    );
  }

  public async executeQuery(query: string): Promise<QueryResult> {
    if (!this.activeEngine) {
      throw new Error('Database not loaded.');
    }
    return this.activeEngine.executeQuery(query);
  }

  public async explainQuery(query: string): Promise<ExplainResult> {
    if (!this.activeEngine) {
      throw new Error('Database not loaded.');
    }
    return this.activeEngine.explainQuery(query);
  }

  public async commitChanges(
    tableName: string,
    changes: CellChange[]
  ): Promise<CommitResult> {
    if (!this.activeEngine) {
      throw new Error('Database not loaded.');
    }
    return this.activeEngine.commitChanges(tableName, changes);
  }

  public async getForeignKeyRecord(
    targetTable: string,
    targetColumn: string,
    value: any
  ): Promise<any> {
    if (!this.activeEngine) {
      return null;
    }
    return this.activeEngine.getForeignKeyRecord(targetTable, targetColumn, value);
  }

  public async getBlobData(
    tableName: string,
    columnName: string,
    rowId: number | string
  ): Promise<{ size: number; base64: string }> {
    if (this.activeEngine && 'getBlobData' in this.activeEngine && typeof (this.activeEngine as any).getBlobData === 'function') {
      return (this.activeEngine as any).getBlobData(tableName, columnName, rowId);
    }
    return { size: 0, base64: '' };
  }

  public async generateMockData(
    tableName: string,
    count: number = 10
  ): Promise<Record<string, any>[]> {
    if (!this.activeEngine) {
      throw new Error('Database not loaded.');
    }
    return this.activeEngine.generateMockData(tableName, count);
  }

  public async insertMockData(
    tableName: string,
    rows: Record<string, any>[]
  ): Promise<MockDataResult> {
    if (!this.activeEngine) {
      throw new Error('Database not loaded.');
    }
    return this.activeEngine.insertMockData(tableName, rows);
  }

  public async importData(options: ImportOptions): Promise<ImportResult> {
    if (!this.activeEngine) {
      throw new Error('Database not loaded.');
    }
    return this.activeEngine.importData(options);
  }
}
