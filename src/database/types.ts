import {
  ColumnInfo,
  DatabaseMetadata,
  ForeignKeyInfo,
  CellChange,
  FilterRule,
  ImportOptions,
} from '../common/messages';

export interface QueryResult {
  columns: string[];
  rows: any[];
  durationMs: number;
  rowsAffected?: number;
  totalReturned?: number;
  truncated?: boolean;
  error?: string;
}

export interface ExplainResult {
  plan: any[];
  warnings: string[];
}

export interface TableDataResult {
  rows: any[];
  totalRows: number;
  columns: ColumnInfo[];
  primaryKeys: string[];
  foreignKeys: ForeignKeyInfo[];
  sql?: string;
}

export interface CommitResult {
  success: boolean;
  error?: string;
  message?: string;
}

export interface MockDataResult {
  success: boolean;
  count: number;
  error?: string;
}

export interface ImportResult {
  success: boolean;
  count: number;
  tableName: string;
  error?: string;
}

export interface ISqliteEngine {
  load(filePath: string, fileBuffer?: Buffer | Uint8Array): Promise<void> | void;
  close(): Promise<void> | void;
  getFilePath(): string;
  saveToDisk?(): Promise<void> | void;
  getMetadata(): Promise<DatabaseMetadata> | DatabaseMetadata;
  getTableColumns(tableName: string): Promise<ColumnInfo[]> | ColumnInfo[];
  getTableForeignKeys(tableName: string): Promise<ForeignKeyInfo[]> | ForeignKeyInfo[];
  getTableData(
    tableName: string,
    page?: number,
    pageSize?: number,
    sortColumn?: string,
    sortDirection?: 'asc' | 'desc',
    filterText?: string,
    filterRules?: FilterRule[],
    filterConjunction?: 'AND' | 'OR'
  ): Promise<TableDataResult> | TableDataResult;
  executeQuery(query: string): Promise<QueryResult> | QueryResult;
  explainQuery(query: string): Promise<ExplainResult> | ExplainResult;
  commitChanges(
    tableName: string,
    changes: CellChange[]
  ): Promise<CommitResult> | CommitResult;
  getForeignKeyRecord(
    targetTable: string,
    targetColumn: string,
    value: any
  ): Promise<any> | any;
  generateMockData(
    tableName: string,
    count?: number
  ): Promise<Record<string, any>[]> | Record<string, any>[];
  insertMockData(
    tableName: string,
    rows: Record<string, any>[]
  ): Promise<MockDataResult> | MockDataResult;
  importData(options: ImportOptions): Promise<ImportResult> | ImportResult;
}
