import React, { useRef, useState, useMemo, useEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ColumnInfo, ForeignKeyInfo, CellChange, FilterRule } from '../../../src/common/messages';
import { CellRenderer } from './CellRenderer';
import { JsonModal } from './JsonModal';
import { BlobModal } from './BlobModal';
import { FilterBuilder } from './FilterBuilder';
import { AggregateFooter, CellSelection } from './AggregateFooter';
import { AddRowModal } from '../Modals/AddRowModal';

interface DataGridProps {
  tableName: string;
  columns: ColumnInfo[];
  rows: any[];
  totalRows: number;
  page: number;
  pageSize: number;
  primaryKeys: string[];
  foreignKeys: ForeignKeyInfo[];
  dirtyChanges: CellChange[];
  sortColumn?: string;
  sortDirection?: 'asc' | 'desc';
  filterText?: string;
  filterRules?: FilterRule[];
  filterConjunction?: 'AND' | 'OR';
  onPageChange: (newPage: number) => void;
  onPageSizeChange: (newSize: number) => void;
  onSortChange: (column: string) => void;
  onFilterChange: (text: string) => void;
  onApplyFilterRules: (rules: FilterRule[], conjunction: 'AND' | 'OR') => void;
  onCellEdit: (row: any, column: ColumnInfo, newValue: any) => void;
  onDeleteRow: (row: any) => void;
  onAddRow: (rowValues?: Record<string, any>) => void;
  onOpenMockDataModal: () => void;
  onOpenVisualizer?: () => void;
  onNavigateForeignKey: (targetTable: string, targetColumn: string, value: any) => void;
}

export const DataGrid: React.FC<DataGridProps> = ({
  tableName,
  columns,
  rows,
  totalRows,
  page,
  pageSize,
  primaryKeys,
  foreignKeys,
  dirtyChanges,
  sortColumn,
  sortDirection,
  filterText,
  filterRules = [],
  filterConjunction = 'AND',
  onPageChange,
  onPageSizeChange,
  onSortChange,
  onFilterChange,
  onApplyFilterRules,
  onCellEdit,
  onDeleteRow,
  onAddRow,
  onOpenMockDataModal,
  onOpenVisualizer,
  onNavigateForeignKey,
}) => {
  const parentRef = useRef<HTMLDivElement>(null);

  // Add row modal state
  const [isAddRowModalOpen, setIsAddRowModalOpen] = useState(false);

  // Filter builder state
  const [isFilterBuilderOpen, setIsFilterBuilderOpen] = useState(false);
  const [isMoreActionsOpen, setIsMoreActionsOpen] = useState(false);
  const [draftRules, setDraftRules] = useState<FilterRule[]>(filterRules);
  const [draftConjunction, setDraftConjunction] = useState<'AND' | 'OR'>(filterConjunction);

  // Cell selection state for Live Aggregates
  const [selectedCells, setSelectedCells] = useState<CellSelection[]>([]);
  const [selectionAnchor, setSelectionAnchor] = useState<{ rowIdx: number; colIdx: number } | null>(null);
  const [isDraggingSelection, setIsDraggingSelection] = useState(false);

  // Global mouseup to finish drag selection
  useEffect(() => {
    const handleMouseUp = () => {
      setIsDraggingSelection(false);
    };
    window.addEventListener('mouseup', handleMouseUp);
    return () => window.removeEventListener('mouseup', handleMouseUp);
  }, []);

  useEffect(() => {
    setDraftRules(filterRules);
  }, [filterRules]);

  useEffect(() => {
    setDraftConjunction(filterConjunction);
  }, [filterConjunction]);

  // Clear cell selection when page or table changes
  useEffect(() => {
    setSelectedCells([]);
    setSelectionAnchor(null);
  }, [tableName, page]);

  // Column resizing state (stores width in px for each column)
  const [colWidths, setColWidths] = useState<Record<string, number>>({});
  const [resizingCol, setResizingCol] = useState<{ name: string; startX: number; startW: number } | null>(null);

  // Modal inspection states
  const [jsonModal, setJsonModal] = useState<{ open: boolean; title: string; data: any }>({
    open: false,
    title: '',
    data: null,
  });

  const [blobModal, setBlobModal] = useState<{
    open: boolean;
    colName: string;
    blob: { size: number; base64: string } | null;
  }>({
    open: false,
    colName: '',
    blob: null,
  });

  // Virtualizer for 60fps scrolling
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 32, // 32px standard row height
    overscan: 15,
  });

  // Auto-calculated column widths based on maximum cell content length
  const autoColWidths = useMemo(() => {
    const map: Record<string, number> = {};
    columns.forEach((col) => {
      // Header length with badges, sort icon, column name, type pill, padding
      const headerLen = (col.name.length + col.type.length) * 8 + 80;
      let maxContentLen = 0;
      const sampleSize = Math.min(rows.length, 80);
      for (let i = 0; i < sampleSize; i++) {
        const r = rows[i];
        const val = r[col.name];
        if (val !== null && val !== undefined) {
          let str: string;
          if (typeof val === 'object') {
            str = val.__isBlob ? 'BLOB (000B)' : JSON.stringify(val);
          } else {
            str = String(val);
          }
          if (str.length > maxContentLen) {
            maxContentLen = str.length;
          }
        }
      }
      // Monospaced character estimation plus cell padding
      const contentLen = maxContentLen * 8 + 32;
      const idealW = Math.min(480, Math.max(headerLen, Math.max(90, Math.round(contentLen))));
      map[col.name] = idealW;
    });
    return map;
  }, [columns, rows]);

  // Column width calculation (user resized OR auto-calculated content length OR fallback 160)
  const getColWidth = (colName: string): number => {
    return colWidths[colName] || autoColWidths[colName] || 160;
  };

  // Double-click resizer to auto-fit specific column to its maximum cell length
  const handleAutoFitColumn = (colName: string) => {
    const idealW = autoColWidths[colName] || 160;
    setColWidths((prev) => ({
      ...prev,
      [colName]: idealW,
    }));
  };

  // Start column resize (fixed: uses startW + delta, NOT accumulating onto prev!)
  const handleResizeMouseDown = (e: React.MouseEvent, colName: string) => {
    e.stopPropagation();
    e.preventDefault();
    const startX = e.clientX;
    const startW = getColWidth(colName);

    setResizingCol({
      name: colName,
      startX,
      startW,
    });

    const onMouseMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientX - startX;
      setColWidths((prev) => ({
        ...prev,
        [colName]: Math.max(70, Math.round(startW + delta)),
      }));
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      setResizingCol(null);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  // Map foreign keys by column name for quick lookup
  const fkMap = useMemo(() => {
    const map = new Map<string, ForeignKeyInfo>();
    foreignKeys.forEach((fk) => map.set(fk.from, fk));
    return map;
  }, [foreignKeys]);

  // Check if a specific cell has an unsaved modification
  const isCellDirty = (row: any, colName: string): boolean => {
    return dirtyChanges.some((c) => {
      if (c.type !== 'update' || !c.updatedValues || !(colName in c.updatedValues)) {
        return false;
      }
      if (primaryKeys.length > 0) {
        return primaryKeys.every((pk) => c.primaryKeyValues[pk] === row[pk]);
      }
      return c.rowId === row.__rowid__;
    });
  };

  // Quick O(1) cell lookup for selection rendering
  const selectedCellKeys = useMemo(() => {
    const set = new Set<string>();
    for (const c of selectedCells) {
      set.add(`${c.rowIndex}:${c.columnName}`);
    }
    return set;
  }, [selectedCells]);

  // Select a rectangular range of cells between two coordinates
  const selectCellRange = (startRow: number, startCol: number, endRow: number, endCol: number, append = false) => {
    const minR = Math.max(0, Math.min(startRow, endRow));
    const maxR = Math.min(rows.length - 1, Math.max(startRow, endRow));
    const minC = Math.max(0, Math.min(startCol, endCol));
    const maxC = Math.min(columns.length - 1, Math.max(startCol, endCol));

    const rangeCells: CellSelection[] = [];
    for (let r = minR; r <= maxR; r++) {
      const row = rows[r];
      if (!row) continue;
      const displayRow = page * pageSize + r + 1;
      for (let c = minC; c <= maxC; c++) {
        const col = columns[c];
        if (!col) continue;
        rangeCells.push({
          rowIndex: displayRow,
          columnName: col.name,
          value: row[col.name],
        });
      }
    }

    if (append) {
      setSelectedCells((prev) => {
        const existingKeys = new Set(prev.map((item) => `${item.rowIndex}:${item.columnName}`));
        const filtered = rangeCells.filter((item) => !existingKeys.has(`${item.rowIndex}:${item.columnName}`));
        return [...prev, ...filtered];
      });
    } else {
      setSelectedCells(rangeCells);
    }
  };

  // Start selection or range selection on mouse down
  const handleCellMouseDown = (rowIdx: number, colIdx: number, colName: string, cellVal: any, e: React.MouseEvent) => {
    if (e.button !== 0) return; // Only left click

    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.closest('button')) {
      return;
    }
    e.preventDefault();

    const displayRowIndex = page * pageSize + rowIdx + 1;

    if (e.shiftKey) {
      const anchor = selectionAnchor || { rowIdx: 0, colIdx: 0 };
      if (!selectionAnchor) setSelectionAnchor(anchor);
      selectCellRange(anchor.rowIdx, anchor.colIdx, rowIdx, colIdx, false);
    } else if (e.metaKey || e.ctrlKey) {
      setSelectionAnchor({ rowIdx, colIdx });
      setSelectedCells((prev) => {
        const exists = prev.some((c) => c.rowIndex === displayRowIndex && c.columnName === colName);
        if (exists) {
          return prev.filter((c) => !(c.rowIndex === displayRowIndex && c.columnName === colName));
        }
        return [...prev, { rowIndex: displayRowIndex, columnName: colName, value: cellVal }];
      });
    } else {
      setIsDraggingSelection(true);
      setSelectionAnchor({ rowIdx, colIdx });
      setSelectedCells([{ rowIndex: displayRowIndex, columnName: colName, value: cellVal }]);
    }
  };

  // Expand range selection while dragging
  const handleCellMouseEnter = (rowIdx: number, colIdx: number) => {
    if (!isDraggingSelection || !selectionAnchor) return;
    selectCellRange(selectionAnchor.rowIdx, selectionAnchor.colIdx, rowIdx, colIdx, false);
  };

  // Pro Excel Keyboard Navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = document.activeElement?.tagName;
      if (activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT') {
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        selectCellRange(0, 0, rows.length - 1, columns.length - 1, false);
        return;
      }

      if (e.key === 'Escape') {
        setSelectedCells([]);
        setSelectionAnchor(null);
        return;
      }

      const isArrow = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key);
      if (!isArrow) return;

      e.preventDefault();

      const currentAnchor = selectionAnchor || { rowIdx: 0, colIdx: 0 };
      let newR = currentAnchor.rowIdx;
      let newC = currentAnchor.colIdx;

      if (e.key === 'ArrowUp') newR = Math.max(0, newR - 1);
      if (e.key === 'ArrowDown') newR = Math.min(rows.length - 1, newR + 1);
      if (e.key === 'ArrowLeft') newC = Math.max(0, newC - 1);
      if (e.key === 'ArrowRight') newC = Math.min(columns.length - 1, newC + 1);

      if (e.shiftKey) {
        selectCellRange(currentAnchor.rowIdx, currentAnchor.colIdx, newR, newC, false);
      } else {
        setSelectionAnchor({ rowIdx: newR, colIdx: newC });
        const targetRow = rows[newR];
        const targetCol = columns[newC];
        if (targetRow && targetCol) {
          const displayRow = page * pageSize + newR + 1;
          setSelectedCells([{ rowIndex: displayRow, columnName: targetCol.name, value: targetRow[targetCol.name] }]);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectionAnchor, rows, columns, page, pageSize]);

  // Select all cells in a row
  const handleSelectRow = (rowIdx: number, row: any, e: React.MouseEvent) => {
    const displayRowIndex = page * pageSize + rowIdx + 1;
    const rowCells: CellSelection[] = columns.map((col) => ({
      rowIndex: displayRowIndex,
      columnName: col.name,
      value: row[col.name],
    }));

    if (e.shiftKey && selectionAnchor) {
      selectCellRange(selectionAnchor.rowIdx, 0, rowIdx, columns.length - 1, false);
    } else if (e.metaKey || e.ctrlKey) {
      setSelectedCells((prev) => {
        const existingKeys = new Set(prev.map((item) => `${item.rowIndex}:${item.columnName}`));
        const filtered = rowCells.filter((item) => !existingKeys.has(`${item.rowIndex}:${item.columnName}`));
        return [...prev, ...filtered];
      });
    } else {
      setSelectionAnchor({ rowIdx, colIdx: 0 });
      setSelectedCells(rowCells);
    }
  };

  // Select all cells in a column
  const handleSelectColumn = (colName: string, colIdx: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const colCells: CellSelection[] = rows.map((row, rIdx) => ({
      rowIndex: page * pageSize + rIdx + 1,
      columnName: colName,
      value: row[colName],
    }));

    if (e.metaKey || e.ctrlKey) {
      setSelectedCells((prev) => {
        const existingKeys = new Set(prev.map((item) => `${item.rowIndex}:${item.columnName}`));
        const filtered = colCells.filter((item) => !existingKeys.has(`${item.rowIndex}:${item.columnName}`));
        return [...prev, ...filtered];
      });
    } else {
      setSelectionAnchor({ rowIdx: 0, colIdx });
      setSelectedCells(colCells);
    }
  };

  const totalPages = Math.ceil(totalRows / pageSize) || 1;

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-vscode-bg">
      {/* Top Filter & Action Bar */}
      <div className="h-10 px-2 sm:px-3 flex items-center justify-between border-b border-vscode-border bg-vscode-header flex-shrink-0 text-xs gap-2 min-w-0">
        <div className="flex items-center gap-1.5 sm:gap-2 flex-1 max-w-sm sm:max-w-md min-w-0">
          <div className="relative w-full flex items-center min-w-0">
            <span className="codicon codicon-search absolute left-2.5 top-1/2 -translate-y-1/2 text-vscode-fg/50 text-xs pointer-events-none flex items-center"></span>
            <input
              type="text"
              placeholder={`Search ${tableName}...`}
              value={filterText || ''}
              onChange={(e) => onFilterChange(e.target.value)}
              className="w-full pl-7 pr-7 py-1 bg-vscode-inputBg text-vscode-inputFg border border-vscode-inputBorder rounded text-xs outline-none focus:border-vscode-focusBorder"
            />
            {filterText && (
              <button
                onClick={() => onFilterChange('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-vscode-fg/50 hover:text-vscode-fg flex items-center"
              >
                <span className="codicon codicon-close text-xs"></span>
              </button>
            )}
          </div>

          {/* Visual Filter Builder Toggle Button */}
          <button
            onClick={() => setIsFilterBuilderOpen((prev) => !prev)}
            className={`flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1 rounded transition-colors flex-shrink-0 ${
              isFilterBuilderOpen || (filterRules && filterRules.length > 0)
                ? 'bg-vscode-button text-vscode-buttonFg font-medium shadow-sm'
                : 'bg-vscode-secondaryBtn text-vscode-secondaryBtnFg hover:bg-vscode-secondaryBtnHover'
            }`}
            title="Open Visual Multi-Condition Filter Builder"
          >
            <span className="codicon codicon-filter text-xs"></span>
            <span className="hidden sm:inline">Filters</span>
            {filterRules && filterRules.length > 0 && (
              <span className="ml-0.5 px-1 py-0.2 rounded-full bg-amber-400 text-black text-[10px] font-bold">
                {filterRules.length}
              </span>
            )}
          </button>
        </div>

        {/* Action Controls & Table Counts */}
        <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
          {/* Always Essential: Add Row Button */}
          <button
            onClick={() => setIsAddRowModalOpen(true)}
            className="flex items-center gap-1 px-2 sm:px-2.5 py-1 bg-vscode-secondaryBtn text-vscode-secondaryBtnFg hover:bg-vscode-secondaryBtnHover rounded transition-colors"
            title="Open modal to insert a new row"
          >
            <span className="codicon codicon-plus text-xs"></span>
            <span className="hidden sm:inline">Add Row</span>
          </button>

          {/* Secondary Actions (Desktop: inline buttons) */}
          <div className="hidden lg:flex items-center gap-1.5">
            {onOpenVisualizer && (
              <button
                onClick={onOpenVisualizer}
                className="flex items-center gap-1.5 px-2.5 py-1 bg-vscode-secondaryBtn text-vscode-secondaryBtnFg hover:bg-vscode-secondaryBtnHover rounded transition-colors"
                title="Open Quick Charts & Data Visualizer for this table"
              >
                <span className="codicon codicon-graph-line text-vscode-info text-xs"></span>
                <span>Visualize</span>
              </button>
            )}

            <button
              onClick={onOpenMockDataModal}
              className="flex items-center gap-1.5 px-2.5 py-1 bg-vscode-secondaryBtn text-vscode-secondaryBtnFg hover:bg-vscode-secondaryBtnHover rounded transition-colors"
              title="Generate realistic mock rows"
            >
              <span className="codicon codicon-sparkle text-amber-400 text-xs"></span>
              <span>Mock Data</span>
            </button>

            <button
              onClick={() => setColWidths({})}
              className="flex items-center gap-1.5 px-2.5 py-1 bg-vscode-secondaryBtn text-vscode-secondaryBtnFg hover:bg-vscode-secondaryBtnHover rounded transition-colors"
              title="Auto-fit all columns to maximum cell content length"
            >
              <span className="codicon codicon-split-horizontal text-xs"></span>
              <span>Auto-fit</span>
            </button>
          </div>

          {/* Secondary Actions (Small Viewport: Dropdown Menu) */}
          <div className="relative lg:hidden">
            <button
              onClick={() => setIsMoreActionsOpen((prev) => !prev)}
              className="flex items-center justify-center p-1 rounded bg-vscode-secondaryBtn text-vscode-secondaryBtnFg hover:bg-vscode-secondaryBtnHover transition-colors"
              title="More Actions"
            >
              <span className="codicon codicon-ellipsis text-xs"></span>
            </button>

            {isMoreActionsOpen && (
              <>
                <div
                  className="fixed inset-0 z-[90] cursor-default"
                  onClick={() => setIsMoreActionsOpen(false)}
                />
                <div
                  className="absolute right-0 top-full mt-1.5 w-48 border border-vscode-menuBorder rounded-lg shadow-2xl py-1 text-xs z-[100] divide-y divide-vscode-border animate-in fade-in zoom-in-95 duration-100"
                  style={{ backgroundColor: 'var(--vscode-menu-background, var(--vscode-editorWidget-background, #252526))' }}
                >
                  <div className="py-1">
                    {onOpenVisualizer && (
                      <button
                        onClick={() => {
                          setIsMoreActionsOpen(false);
                          onOpenVisualizer();
                        }}
                        className="w-full text-left px-3 py-1.5 hover:bg-vscode-hover hover:text-vscode-fg flex items-center gap-2 transition-colors"
                      >
                        <span className="codicon codicon-graph-line text-vscode-info text-xs"></span>
                        <span>Visualize Table</span>
                      </button>
                    )}

                    <button
                      onClick={() => {
                        setIsMoreActionsOpen(false);
                        onOpenMockDataModal();
                      }}
                      className="w-full text-left px-3 py-1.5 hover:bg-vscode-hover hover:text-vscode-fg flex items-center gap-2 transition-colors"
                    >
                      <span className="codicon codicon-sparkle text-amber-400 text-xs"></span>
                      <span>Generate Mock Data</span>
                    </button>

                    <button
                      onClick={() => {
                        setIsMoreActionsOpen(false);
                        setColWidths({});
                      }}
                      className="w-full text-left px-3 py-1.5 hover:bg-vscode-hover hover:text-vscode-fg flex items-center gap-2 transition-colors"
                    >
                      <span className="codicon codicon-split-horizontal text-xs"></span>
                      <span>Auto-fit Columns</span>
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Row Count Badge */}
          <div className="text-vscode-fg/70 text-[11px] sm:text-xs">
            <span className="hidden sm:inline">
              {totalRows === 0 ? '0' : (page * pageSize + 1).toLocaleString()} -{' '}
              {Math.min((page + 1) * pageSize, totalRows).toLocaleString()} of{' '}
              <span className="font-semibold text-vscode-fg">{totalRows.toLocaleString()}</span> rows
            </span>
            <span className="sm:hidden font-mono font-medium text-vscode-fg">
              {totalRows.toLocaleString()} rows
            </span>
          </div>
        </div>
      </div>

      {/* Visual Multi-Condition Filter Builder */}
      <FilterBuilder
        isOpen={isFilterBuilderOpen}
        onClose={() => setIsFilterBuilderOpen(false)}
        columns={columns}
        rules={draftRules}
        conjunction={draftConjunction}
        onChangeRules={setDraftRules}
        onChangeConjunction={setDraftConjunction}
        onApply={() => {
          onApplyFilterRules(draftRules, draftConjunction);
        }}
        onClear={() => {
          setDraftRules([]);
          onApplyFilterRules([], 'AND');
        }}
      />

      {/* Main Virtual Grid View */}
      <div
        ref={parentRef}
        className="flex-1 overflow-auto relative border-b border-vscode-border"
      >
        <div
          style={{
            height: `${rowVirtualizer.getTotalSize() + 32}px`,
            width: 'max-content',
            minWidth: '100%',
            position: 'relative',
          }}
        >
          {/* Sticky Table Header */}
          <div className="sticky top-0 z-20 flex bg-vscode-header border-b border-vscode-border text-xs font-medium select-none shadow-sm">
            {/* Row Number Header */}
            <div className="sticky left-0 z-30 w-12 flex-shrink-0 h-8 flex items-center justify-center border-r border-vscode-border bg-vscode-header text-vscode-fg/50 font-mono-code text-[11px]">
              #
            </div>

            {/* Dynamic Column Headers */}
            {columns.map((col, colIdx) => {
              const isPk = col.pk > 0;
              const fk = fkMap.get(col.name);
              const isSorted = sortColumn === col.name;
              const colW = getColWidth(col.name);

              return (
                <div
                  key={col.name}
                  style={{ width: `${colW}px` }}
                  onClick={() => onSortChange(col.name)}
                  className="relative flex-shrink-0 h-8 px-2 flex items-center justify-between border-r border-vscode-border hover:bg-vscode-hover cursor-pointer transition-colors group"
                >
                  <div className="flex items-center gap-1.5 truncate">
                    {/* Primary Key Badge */}
                    {isPk && (
                      <span
                        className="codicon codicon-key text-amber-400 text-xs"
                        title="Primary Key"
                      ></span>
                    )}
                    {/* Foreign Key Badge */}
                    {fk && (
                      <span
                        className="codicon codicon-link text-sky-400 text-xs"
                        title={`Foreign Key -> ${fk.table}.${fk.to}`}
                      ></span>
                    )}
                    <span className="font-semibold truncate text-vscode-fg">{col.name}</span>
                    <span className="text-[10px] text-vscode-fg/40 font-mono-code font-normal">
                      {col.type}
                    </span>
                  </div>

                  {/* Column Select & Sort Indicator */}
                  <div className="flex items-center gap-1 text-vscode-fg/60">
                    <button
                      type="button"
                      onClick={(e) => handleSelectColumn(col.name, colIdx, e)}
                      className="codicon codicon-selection opacity-0 group-hover:opacity-60 hover:!opacity-100 hover:text-vscode-fg p-0.5 rounded transition-all text-xs"
                      title="Select all cells in column"
                    />
                    {isSorted ? (
                      <span
                        className={`codicon ${
                          sortDirection === 'desc' ? 'codicon-arrow-down' : 'codicon-arrow-up'
                        } text-xs text-vscode-focusBorder`}
                      ></span>
                    ) : (
                      <span className="codicon codicon-chevron-down opacity-0 group-hover:opacity-40 text-xs"></span>
                    )}
                  </div>

                  {/* Draggable Resizer Handle (Double-click to auto-fit) */}
                  <div
                    onMouseDown={(e) => handleResizeMouseDown(e, col.name)}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      handleAutoFitColumn(col.name);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="absolute right-0 top-0 w-2 h-full cursor-col-resize hover:bg-vscode-focusBorder z-10"
                    title="Drag to resize column (Double-click to auto-fit to content)"
                  />
                </div>
              );
            })}
          </div>

          {/* Virtual Row Items */}
          {rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-vscode-fg/50 text-sm">
              <span className="codicon codicon-search text-3xl mb-2 opacity-50"></span>
              <span>No records found</span>
            </div>
          ) : (
            rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const row = rows[virtualRow.index];
              const rowIndex = page * pageSize + virtualRow.index + 1;

              return (
                <div
                  key={virtualRow.index}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start + 32}px)`,
                  }}
                  className="flex border-b border-vscode-border hover:bg-vscode-hover/60 transition-colors group"
                >
                  {/* Sticky Row Number (Shows delete trash button on hover) */}
                  <div
                    onClick={(e) => handleSelectRow(virtualRow.index, row, e)}
                    className="sticky left-0 z-10 w-12 flex-shrink-0 h-full flex items-center justify-center border-r border-vscode-border bg-vscode-bg group-hover:bg-vscode-hover hover:!bg-vscode-active/40 text-vscode-fg/50 font-mono-code text-[11px] cursor-pointer select-none relative group/rowno"
                    title="Click to select row (Shift+Click for range)"
                  >
                    <span className="group-hover/rowno:hidden">{rowIndex}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteRow(row);
                      }}
                      className="hidden group-hover/rowno:flex items-center justify-center w-full h-full text-rose-400 hover:text-rose-300 hover:bg-rose-500/20 transition-colors"
                      title={`Delete Row #${rowIndex}`}
                    >
                      <span className="codicon codicon-trash text-xs"></span>
                    </button>
                  </div>

                  {/* Data Cells */}
                  {columns.map((col, colIdx) => {
                    const colW = getColWidth(col.name);
                    const fk = fkMap.get(col.name);
                    const isDirty = isCellDirty(row, col.name);
                    const isSelected = selectedCellKeys.has(`${rowIndex}:${col.name}`);
                    const isAnchor = selectionAnchor?.rowIdx === virtualRow.index && selectionAnchor?.colIdx === colIdx;

                    return (
                      <div
                        key={col.name}
                        style={{ width: `${colW}px` }}
                        onMouseDown={(e) =>
                          handleCellMouseDown(virtualRow.index, colIdx, col.name, row[col.name], e)
                        }
                        onMouseEnter={() => handleCellMouseEnter(virtualRow.index, colIdx)}
                        className={`flex-shrink-0 h-full border-r border-vscode-border overflow-hidden select-none relative transition-colors ${
                          isSelected
                            ? 'bg-sky-500/25 ring-1 ring-inset ring-sky-400 z-10'
                            : 'hover:bg-vscode-hover/30'
                        } ${isAnchor ? 'ring-2 ring-inset ring-sky-400 bg-sky-500/35 font-medium' : ''} ${
                          isDraggingSelection ? 'cursor-cell' : ''
                        }`}
                      >
                        <CellRenderer
                          value={row[col.name]}
                          column={col}
                          foreignKey={fk}
                          isDirty={isDirty}
                          isSelected={isSelected}
                          onEditCell={(newVal) => onCellEdit(row, col, newVal)}
                          onOpenJson={(data) =>
                            setJsonModal({
                              open: true,
                              title: `${col.name} (Row #${rowIndex})`,
                              data,
                            })
                          }
                          onOpenBlob={(blob) =>
                            setBlobModal({
                              open: true,
                              colName: `${col.name} (Row #${rowIndex})`,
                              blob,
                            })
                          }
                          onNavigateForeignKey={onNavigateForeignKey}
                        />
                      </div>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Bottom Pagination & Live Aggregate Status Bar */}
      <div className="min-h-9 px-2 sm:px-3 py-1 flex flex-wrap items-center justify-between border-t border-vscode-border bg-vscode-header text-xs flex-shrink-0 gap-2">
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="text-vscode-fg/70 hidden sm:inline">Rows:</span>
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="bg-vscode-inputBg text-vscode-inputFg border border-vscode-inputBorder rounded px-1.5 py-0.5 outline-none text-xs"
              title="Rows per page"
            >
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={500}>500</option>
              <option value={1000}>1000</option>
            </select>
          </div>

          {/* Live Footer Aggregates (Count, Sum, Avg, Min, Max) */}
          <AggregateFooter selectedCells={selectedCells} totalRows={totalRows} />
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 ml-auto">
          <span className="text-vscode-fg/70">
            <span className="hidden sm:inline">Page </span>
            <span className="font-semibold text-vscode-fg">{page + 1}</span>
            <span className="text-vscode-fg/50"> / </span>
            <span className="font-semibold text-vscode-fg">{totalPages}</span>
          </span>

          <div className="flex items-center gap-0.5">
            <button
              disabled={page === 0}
              onClick={() => onPageChange(0)}
              className="h-6 px-1 rounded hover:bg-vscode-hover disabled:opacity-30 disabled:hover:bg-transparent hidden sm:inline-flex items-center -space-x-1.5"
              title="First Page"
            >
              <span className="codicon codicon-chevron-left text-xs"></span>
              <span className="codicon codicon-chevron-left text-xs"></span>
            </button>
            <button
              disabled={page === 0}
              onClick={() => onPageChange(page - 1)}
              className="h-6 w-6 rounded hover:bg-vscode-hover disabled:opacity-30 disabled:hover:bg-transparent flex items-center justify-center"
              title="Previous Page"
            >
              <span className="codicon codicon-chevron-left text-xs"></span>
            </button>
            <button
              disabled={page >= totalPages - 1}
              onClick={() => onPageChange(page + 1)}
              className="h-6 w-6 rounded hover:bg-vscode-hover disabled:opacity-30 disabled:hover:bg-transparent flex items-center justify-center"
              title="Next Page"
            >
              <span className="codicon codicon-chevron-right text-xs"></span>
            </button>
            <button
              disabled={page >= totalPages - 1}
              onClick={() => onPageChange(totalPages - 1)}
              className="h-6 px-1 rounded hover:bg-vscode-hover disabled:opacity-30 disabled:hover:bg-transparent hidden sm:inline-flex items-center -space-x-1.5"
              title="Last Page"
            >
              <span className="codicon codicon-chevron-right text-xs"></span>
              <span className="codicon codicon-chevron-right text-xs"></span>
            </button>
          </div>
        </div>
      </div>

      {/* Modals */}
      <JsonModal
        isOpen={jsonModal.open}
        title={jsonModal.title}
        data={jsonModal.data}
        onClose={() => setJsonModal({ open: false, title: '', data: null })}
      />

      <BlobModal
        isOpen={blobModal.open}
        columnName={blobModal.colName}
        blobData={blobModal.blob as any}
        onClose={() => setBlobModal({ open: false, colName: '', blob: null })}
      />

      <AddRowModal
        isOpen={isAddRowModalOpen}
        onClose={() => setIsAddRowModalOpen(false)}
        tableName={tableName}
        columns={columns}
        onAdd={(newRow) => onAddRow(newRow)}
      />
    </div>
  );
};
