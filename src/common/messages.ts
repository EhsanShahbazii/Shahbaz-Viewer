export interface ColumnInfo {
  cid: number;
  name: string;
  type: string;
  notnull: boolean;
  dflt_value: any;
  pk: number; // 0 or pk order
}

export interface ForeignKeyInfo {
  id: number;
  seq: number;
  table: string;
  from: string;
  to: string;
  on_update: string;
  on_delete: string;
}

export interface TableInfo {
  name: string;
  type: 'table' | 'view';
  rowCount: number;
  columns: ColumnInfo[];
  foreignKeys: ForeignKeyInfo[];
  sql?: string;
}

export interface DatabaseMetadata {
  name: string;
  path: string;
  sizeBytes: number;
  tables: TableInfo[];
  views: TableInfo[];
}

export interface CellChange {
  type: 'update' | 'insert' | 'delete';
  primaryKeyValues: Record<string, any>; // Keyed by PK column name
  rowId?: number; // fallback rowid if without rowid is not used
  updatedValues?: Record<string, any>; // Column name -> new value
}

export type FilterOperator =
  | '='
  | '!='
  | '>'
  | '>='
  | '<'
  | '<='
  | 'contains'
  | 'starts_with'
  | 'ends_with'
  | 'is_null'
  | 'is_not_null'
  | 'in';

export interface FilterRule {
  id: string;
  column: string;
  operator: FilterOperator;
  value?: string;
}

export interface ImportColumnDef {
  sourceName: string;
  targetName: string;
  type: string; // 'INTEGER' | 'REAL' | 'TEXT' | 'BOOLEAN' | 'DATETIME'
  isPk?: boolean;
  notNull?: boolean;
  skip?: boolean;
}

export interface ImportOptions {
  mode: 'new' | 'existing';
  targetTable: string;
  conflictStrategy: 'fail' | 'replace' | 'ignore';
  columns: ImportColumnDef[];
  rows: Record<string, any>[];
}

// Messages Webview sends to Extension Host
export type WebviewToHostMessage =
  | { type: 'ready' }
  | {
      type: 'selectTable';
      payload: {
        tableName: string;
        page: number;
        pageSize: number;
        sortColumn?: string;
        sortDirection?: 'asc' | 'desc';
        filterText?: string;
        filterRules?: FilterRule[];
        filterConjunction?: 'AND' | 'OR';
      };
    }
  | {
      type: 'executeQuery';
      payload: { query: string };
    }
  | {
      type: 'explainQuery';
      payload: { query: string };
    }
  | {
      type: 'commitChanges';
      payload: {
        tableName: string;
        changes: CellChange[];
      };
    }
  | {
      type: 'exportData';
      payload: {
        tableName: string;
        format: 'csv' | 'json' | 'markdown' | 'sql' | 'ts';
      };
    }
  | {
      type: 'fetchForeignKeyRecord';
      payload: {
        requestId: string;
        targetTable: string;
        targetColumn: string;
        value: any;
      };
    }
  | {
      type: 'generateMockData';
      payload: {
        tableName: string;
        count: number;
        insertDirectly: boolean;
      };
    }
  | {
      type: 'openInEditor';
      payload: {
        content: string;
        language: string;
      };
    }
  | {
      type: 'executeChartQuery';
      payload: {
        query: string;
        chartId?: string;
      };
    }
  | {
      type: 'openImportFileDialog';
    }
  | {
      type: 'executeImport';
      payload: ImportOptions;
    }
  | {
      type: 'exportImage';
      payload: {
        fileName: string;
        format: 'png' | 'svg' | 'pdf' | 'json';
        base64Data?: string;
        svgString?: string;
      };
    };

// Messages Extension Host sends to Webview
export type HostToWebviewMessage =
  | {
      type: 'init';
      payload: DatabaseMetadata;
    }
  | {
      type: 'tableData';
      payload: {
        tableName: string;
        columns: ColumnInfo[];
        rows: any[];
        totalRows: number;
        page: number;
        pageSize: number;
        primaryKeys: string[];
        foreignKeys: ForeignKeyInfo[];
        sql?: string;
      };
    }
  | {
      type: 'queryResult';
      payload: {
        query: string;
        columns: string[];
        rows: any[];
        durationMs: number;
        rowsAffected?: number;
        error?: string;
        totalReturned?: number;
        truncated?: boolean;
      };
    }
  | {
      type: 'explainResult';
      payload: {
        query: string;
        plan: any[];
        warnings?: string[];
      };
    }
  | {
      type: 'chartQueryResult';
      payload: {
        query: string;
        columns: string[];
        rows: any[];
        durationMs: number;
        error?: string;
        chartId?: string;
      };
    }
  | {
      type: 'commitResult';
      payload: {
        success: boolean;
        error?: string;
        message?: string;
      };
    }
  | {
      type: 'foreignKeyRecordResult';
      payload: {
        requestId: string;
        record: any;
        error?: string;
      };
    }
  | {
      type: 'mockDataGenerated';
      payload: {
        tableName: string;
        count: number;
        rows?: any[];
        inserted: boolean;
        error?: string;
      };
    }
  | {
      type: 'importFileSelected';
      payload: {
        filename: string;
        content: string;
      };
    }
  | {
      type: 'importResult';
      payload: {
        success: boolean;
        count: number;
        tableName: string;
        error?: string;
      };
    }
  | {
      type: 'error';
      payload: { message: string };
    };
