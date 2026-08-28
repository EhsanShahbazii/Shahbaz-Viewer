import React, { useState, useEffect, useCallback } from 'react';
import { useVsCodeMessage } from './hooks/useVsCode';
import {
  DatabaseMetadata,
  ColumnInfo,
  ForeignKeyInfo,
  CellChange,
  HostToWebviewMessage,
  FilterRule,
  ImportOptions,
} from '../../src/common/messages';
import { Header, ViewMode } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { DataGrid } from './components/DataGrid/DataGrid';
import { SchemaViewer } from './components/SchemaViewer/SchemaViewer';
import { ErDiagram } from './components/SchemaViewer/ErDiagram';
import { SqlStudio } from './components/SqlStudio/SqlStudio';
import { DataVisualizer } from './components/Visualizer/DataVisualizer';
import { MockDataModal } from './components/Modals/MockDataModal';
import { OrmModal } from './components/Modals/OrmModal';
import { ImportWizardModal } from './components/Modals/ImportWizardModal';

export const App: React.FC = () => {
  // Database metadata state
  const [metadata, setMetadata] = useState<DatabaseMetadata | null>(null);
  const [activeTable, setActiveTable] = useState<string>('');
  const [viewMode, setViewMode] = useState<ViewMode>('data');

  // Modals state
  const [isMockModalOpen, setIsMockModalOpen] = useState(false);
  const [isOrmModalOpen, setIsOrmModalOpen] = useState(false);
  const [isGeneratingMock, setIsGeneratingMock] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [selectedImportFile, setSelectedImportFile] = useState<{
    filename: string;
    content: string;
  } | null>(null);
  const [importResult, setImportResult] = useState<{
    success: boolean;
    count: number;
    tableName: string;
    error?: string;
  } | null>(null);

  // Sidebar Layout state
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('sql_viewer_sidebar_width');
      return saved ? Number(saved) : 240;
    } catch {
      return 240;
    }
  });
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('sql_viewer_sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });

  const handleSidebarWidthChange = (newWidth: number) => {
    setSidebarWidth(newWidth);
    try {
      localStorage.setItem('sql_viewer_sidebar_width', String(newWidth));
    } catch {}
  };

  const handleToggleSidebar = () => {
    setIsSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('sql_viewer_sidebar_collapsed', String(next));
      } catch {}
      return next;
    });
  };

  // Active table data state
  const [columns, setColumns] = useState<ColumnInfo[]>([]);
  const [rows, setRows] = useState<any[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [primaryKeys, setPrimaryKeys] = useState<string[]>([]);
  const [foreignKeys, setForeignKeys] = useState<ForeignKeyInfo[]>([]);
  const [tableSql, setTableSql] = useState<string>('');

  // Sorting & Filtering
  const [sortColumn, setSortColumn] = useState<string | undefined>(undefined);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [filterText, setFilterText] = useState('');
  const [filterRules, setFilterRules] = useState<FilterRule[]>([]);
  const [filterConjunction, setFilterConjunction] = useState<'AND' | 'OR'>('AND');

  // Transaction dirty changes
  const [dirtyChanges, setDirtyChanges] = useState<CellChange[]>([]);

  // SQL Studio state
  const [queryResult, setQueryResult] = useState<{
    query: string;
    columns: string[];
    rows: any[];
    durationMs: number;
    rowsAffected?: number;
    error?: string;
  } | null>(null);

  const [explainResult, setExplainResult] = useState<{
    query: string;
    plan: any[];
    warnings?: string[];
  } | null>(null);

  // Charts & Visualizer state
  const [chartQueryResult, setChartQueryResult] = useState<{
    query: string;
    columns: string[];
    rows: any[];
    durationMs: number;
    error?: string;
    chartId?: string;
  } | null>(null);

  // Message receiver from VS Code Extension Host
  const handleHostMessage = useCallback((msg: HostToWebviewMessage) => {
    switch (msg.type) {
      case 'init': {
        setMetadata(msg.payload);
        if (msg.payload.tables.length > 0 && !activeTable) {
          setActiveTable(msg.payload.tables[0].name);
        }
        break;
      }

      case 'tableData': {
        setActiveTable(msg.payload.tableName);
        setColumns(msg.payload.columns);
        setRows(msg.payload.rows);
        setTotalRows(msg.payload.totalRows);
        setPage(msg.payload.page);
        setPageSize(msg.payload.pageSize);
        setPrimaryKeys(msg.payload.primaryKeys);
        setForeignKeys(msg.payload.foreignKeys);
        setTableSql(msg.payload.sql || '');
        setDirtyChanges([]); // Clear dirty changes on fresh load
        break;
      }

      case 'queryResult': {
        setQueryResult(msg.payload);
        break;
      }

      case 'chartQueryResult': {
        setChartQueryResult(msg.payload);
        break;
      }

      case 'explainResult': {
        setExplainResult(msg.payload);
        break;
      }

      case 'commitResult': {
        if (msg.payload.success) {
          setDirtyChanges([]);
        }
        break;
      }

      case 'mockDataGenerated': {
        setIsGeneratingMock(false);
        setIsMockModalOpen(false);
        if (!msg.payload.inserted && msg.payload.rows && msg.payload.rows.length > 0) {
          // Add generated rows to the top of the grid with dirty state
          setRows((prev) => [...msg.payload.rows!, ...prev]);
          setDirtyChanges((prev) => [
            ...prev,
            ...msg.payload.rows!.map((r) => ({
              type: 'insert' as const,
              primaryKeyValues: {},
              updatedValues: r,
            })),
          ]);
        }
        break;
      }

      case 'importFileSelected': {
        setSelectedImportFile(msg.payload);
        setIsImportModalOpen(true);
        break;
      }

      case 'importResult': {
        setIsImporting(false);
        setImportResult(msg.payload);
        if (msg.payload.success) {
          setIsImportModalOpen(false);
          setActiveTable(msg.payload.tableName);
        }
        break;
      }
    }
  }, [activeTable]);

  const { sendMessage } = useVsCodeMessage(handleHostMessage);

  // Send ready message on mount
  useEffect(() => {
    sendMessage({ type: 'ready' });
  }, []);

  // Fetch table data helper
  const fetchTable = useCallback(
    (
      tableName: string,
      newPage: number = page,
      newPageSize: number = pageSize,
      newSortCol?: string,
      newSortDir?: 'asc' | 'desc',
      newFilter?: string,
      newRules?: FilterRule[],
      newConj?: 'AND' | 'OR'
    ) => {
      sendMessage({
        type: 'selectTable',
        payload: {
          tableName,
          page: newPage,
          pageSize: newPageSize,
          sortColumn: newSortCol !== undefined ? newSortCol : sortColumn,
          sortDirection: newSortDir !== undefined ? newSortDir : sortDirection,
          filterText: newFilter !== undefined ? newFilter : filterText,
          filterRules: newRules !== undefined ? newRules : filterRules,
          filterConjunction: newConj !== undefined ? newConj : filterConjunction,
        },
      });
    },
    [page, pageSize, sortColumn, sortDirection, filterText, filterRules, filterConjunction, sendMessage]
  );

  // Select a new table
  const handleSelectTable = (name: string) => {
    setActiveTable(name);
    setPage(0);
    setFilterText('');
    setFilterRules([]);
    setSortColumn(undefined);
    fetchTable(name, 0, pageSize, undefined, 'asc', '', []);
  };

  // Pagination
  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    fetchTable(activeTable, newPage, pageSize);
  };

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize);
    setPage(0);
    fetchTable(activeTable, 0, newSize);
  };

  // Sorting
  const handleSortChange = (colName: string) => {
    let nextDir: 'asc' | 'desc' = 'asc';
    let nextCol: string | undefined = colName;

    if (sortColumn === colName) {
      if (sortDirection === 'asc') {
        nextDir = 'desc';
      } else {
        nextCol = undefined;
      }
    }

    setSortColumn(nextCol);
    setSortDirection(nextDir);
    fetchTable(activeTable, page, pageSize, nextCol, nextDir);
  };

  // Filter
  const handleFilterChange = (text: string) => {
    setFilterText(text);
    setPage(0);
    fetchTable(activeTable, 0, pageSize, sortColumn, sortDirection, text);
  };

  const handleApplyFilterRules = (rules: FilterRule[], conjunction: 'AND' | 'OR') => {
    setFilterRules(rules);
    setFilterConjunction(conjunction);
    setPage(0);
    fetchTable(activeTable, 0, pageSize, sortColumn, sortDirection, filterText, rules, conjunction);
  };

  // Inline cell editing
  const handleCellEdit = (row: any, column: ColumnInfo, newValue: any) => {
    // If value has not changed, do nothing
    const currentVal = row[column.name];
    if (newValue === currentVal || String(newValue ?? '') === String(currentVal ?? '')) {
      return;
    }

    // Determine primary key identifiers
    const pkValues: Record<string, any> = {};
    if (primaryKeys.length > 0) {
      primaryKeys.forEach((pk) => {
        pkValues[pk] = row[pk];
      });
    }

    // Optimistically update displayed row
    setRows((prevRows) =>
      prevRows.map((r) => {
        const matches =
          primaryKeys.length > 0
            ? primaryKeys.every((pk) => r[pk] === row[pk])
            : r.__rowid__ === row.__rowid__;
        if (matches) {
          return { ...r, [column.name]: newValue };
        }
        return r;
      })
    );

    // Track dirty changes
    setDirtyChanges((prev) => {
      const existingIdx = prev.findIndex((c) => {
        if (c.type !== 'update') {return false;}
        if (primaryKeys.length > 0) {
          return primaryKeys.every((pk) => c.primaryKeyValues[pk] === row[pk]);
        }
        return c.rowId === row.__rowid__;
      });

      if (existingIdx >= 0) {
        const updated = [...prev];
        updated[existingIdx] = {
          ...updated[existingIdx],
          updatedValues: {
            ...updated[existingIdx].updatedValues,
            [column.name]: newValue,
          },
        };
        return updated;
      } else {
        return [
          ...prev,
          {
            type: 'update',
            primaryKeyValues: pkValues,
            rowId: row.__rowid__,
            updatedValues: { [column.name]: newValue },
          },
        ];
      }
    });
  };

  // Delete row
  const handleDeleteRow = (row: any) => {
    const pkValues: Record<string, any> = {};
    if (primaryKeys.length > 0) {
      primaryKeys.forEach((pk) => {
        pkValues[pk] = row[pk];
      });
    }

    // Optimistically remove from grid
    setRows((prev) =>
      prev.filter((r) =>
        primaryKeys.length > 0
          ? !primaryKeys.every((pk) => r[pk] === row[pk])
          : r.__rowid__ !== row.__rowid__
      )
    );

    setDirtyChanges((prev) => [
      ...prev,
      {
        type: 'delete',
        primaryKeyValues: pkValues,
        rowId: row.__rowid__,
      },
    ]);
  };

  // Add row
  const handleAddRow = (customValues?: Record<string, any>) => {
    const newRow: Record<string, any> = {};
    columns.forEach((c) => {
      if (customValues && c.name in customValues) {
        newRow[c.name] = customValues[c.name];
      } else {
        newRow[c.name] = c.dflt_value !== null ? c.dflt_value : null;
      }
    });

    // Add to top of grid
    setRows((prev) => [newRow, ...prev]);

    setDirtyChanges((prev) => [
      ...prev,
      {
        type: 'insert',
        primaryKeyValues: {},
        updatedValues: newRow,
      },
    ]);
  };

  // Commit changes
  const handleCommitChanges = () => {
    if (dirtyChanges.length === 0 || !activeTable) {return;}
    sendMessage({
      type: 'commitChanges',
      payload: {
        tableName: activeTable,
        changes: dirtyChanges,
      },
    });
  };

  // Discard changes
  const handleDiscardChanges = () => {
    setDirtyChanges([]);
    fetchTable(activeTable);
  };

  // Foreign key navigation (jump to target table with target value filtered)
  const handleNavigateForeignKey = (
    targetTable: string,
    _targetColumn: string,
    value: any
  ) => {
    setActiveTable(targetTable);
    setViewMode('data');
    setFilterText(String(value));
    setPage(0);
    fetchTable(targetTable, 0, pageSize, undefined, 'asc', String(value));
  };

  // Export table data
  const handleExport = (format: 'csv' | 'json' | 'markdown' | 'sql' | 'ts') => {
    if (!activeTable) {return;}
    sendMessage({
      type: 'exportData',
      payload: {
        tableName: activeTable,
        format,
      },
    });
  };

  // SQL Studio execution
  const handleExecuteQuery = (query: string) => {
    sendMessage({
      type: 'executeQuery',
      payload: { query },
    });
  };

  const handleExplainQuery = (query: string) => {
    sendMessage({
      type: 'explainQuery',
      payload: { query },
    });
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-vscode-bg text-vscode-fg">
      {/* Top Header */}
      <Header
        databaseName={metadata?.name || 'Shahbaz Viewer'}
        activeTable={activeTable}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        dirtyCount={dirtyChanges.length}
        onCommitChanges={handleCommitChanges}
        onDiscardChanges={handleDiscardChanges}
        onExport={handleExport}
        onOpenOrmModal={() => setIsOrmModalOpen(true)}
        onOpenImportModal={() => setIsImportModalOpen(true)}
        onRefresh={() => fetchTable(activeTable)}
        isSidebarOpen={!isSidebarCollapsed}
        onToggleSidebar={handleToggleSidebar}
      />

      {/* Main Layout Body */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar */}
        {!isSidebarCollapsed && (
          <Sidebar
            tables={metadata?.tables || []}
            views={metadata?.views || []}
            activeTable={activeTable}
            sizeBytes={metadata?.sizeBytes || 0}
            onSelectTable={handleSelectTable}
            width={sidebarWidth}
            onWidthChange={handleSidebarWidthChange}
            onToggleCollapse={handleToggleSidebar}
          />
        )}

        {/* Content Area according to active ViewMode */}
        <main className="flex-1 flex flex-col overflow-hidden bg-vscode-bg">
          {viewMode === 'data' && (
            <DataGrid
              tableName={activeTable}
              columns={columns}
              rows={rows}
              totalRows={totalRows}
              page={page}
              pageSize={pageSize}
              primaryKeys={primaryKeys}
              foreignKeys={foreignKeys}
              dirtyChanges={dirtyChanges}
              sortColumn={sortColumn}
              sortDirection={sortDirection}
              filterText={filterText}
              filterRules={filterRules}
              filterConjunction={filterConjunction}
              onPageChange={handlePageChange}
              onPageSizeChange={handlePageSizeChange}
              onSortChange={handleSortChange}
              onFilterChange={handleFilterChange}
              onApplyFilterRules={handleApplyFilterRules}
              onCellEdit={handleCellEdit}
              onDeleteRow={handleDeleteRow}
              onAddRow={handleAddRow}
              onOpenMockDataModal={() => setIsMockModalOpen(true)}
              onOpenVisualizer={() => setViewMode('charts')}
              onNavigateForeignKey={handleNavigateForeignKey}
            />
          )}

          {viewMode === 'schema' && (
            <SchemaViewer
              tableName={activeTable}
              columns={columns}
              foreignKeys={foreignKeys}
              sql={tableSql}
            />
          )}

          {viewMode === 'erd' && (
            <ErDiagram
              tables={metadata?.tables || []}
              onSelectTable={(tableName) => {
                setActiveTable(tableName);
              }}
            />
          )}

          {viewMode === 'sql' && (
            <SqlStudio
              tables={metadata?.tables || []}
              activeTable={activeTable}
              onExecuteQuery={handleExecuteQuery}
              onExplainQuery={handleExplainQuery}
              queryResult={queryResult}
              explainResult={explainResult}
            />
          )}

          {viewMode === 'charts' && (
            <DataVisualizer
              tables={metadata?.tables || []}
              views={metadata?.views || []}
              activeTable={activeTable}
              onSelectTable={handleSelectTable}
              onExecuteQuery={(query, chartId) => {
                sendMessage({
                  type: 'executeChartQuery',
                  payload: { query, chartId },
                });
              }}
              chartQueryResult={chartQueryResult}
              onOpenInSqlStudio={(query) => {
                setViewMode('sql');
              }}
            />
          )}
        </main>
      </div>

      {/* Mock Data Generator Modal */}
      <MockDataModal
        isOpen={isMockModalOpen}
        onClose={() => setIsMockModalOpen(false)}
        tableName={activeTable}
        isLoading={isGeneratingMock}
        onGenerate={(count, insertDirectly) => {
          setIsGeneratingMock(true);
          sendMessage({
            type: 'generateMockData',
            payload: {
              tableName: activeTable,
              count,
              insertDirectly,
            },
          });
        }}
      />

      {/* ORM & Code Generation Modal */}
      <OrmModal
        isOpen={isOrmModalOpen}
        onClose={() => setIsOrmModalOpen(false)}
        tableName={activeTable}
        columns={columns}
        foreignKeys={foreignKeys}
        onOpenInEditor={(content, language) => {
          sendMessage({
            type: 'openInEditor',
            payload: { content, language },
          });
        }}
      />

      {/* CSV & JSON Import Wizard Modal */}
      <ImportWizardModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        tables={metadata?.tables || []}
        activeTable={activeTable}
        onOpenFilePicker={() => {
          sendMessage({ type: 'openImportFileDialog' });
        }}
        selectedFileContent={selectedImportFile}
        onExecuteImport={(options) => {
          setIsImporting(true);
          sendMessage({
            type: 'executeImport',
            payload: options,
          });
        }}
        isImporting={isImporting}
        importResult={importResult}
      />
    </div>
  );
};
