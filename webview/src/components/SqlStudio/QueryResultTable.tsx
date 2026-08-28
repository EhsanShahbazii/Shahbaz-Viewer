import React, { useState, useRef, useMemo, useEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ColumnInfo } from '../../../src/common/messages';
import { CellRenderer } from '../DataGrid/CellRenderer';
import { AggregateFooter, CellSelection } from '../DataGrid/AggregateFooter';
import { JsonModal } from '../DataGrid/JsonModal';
import { BlobModal } from '../DataGrid/BlobModal';
import { insertTimestamp } from '../../utils/timestamp';

interface QueryResultTableProps {
  columns: string[];
  rows: any[];
  durationMs: number;
  totalReturned?: number;
  truncated?: boolean;
}

export const QueryResultTable: React.FC<QueryResultTableProps> = ({
  columns: columnNames,
  rows,
  durationMs,
  totalReturned,
  truncated,
}) => {
  const parentRef = useRef<HTMLDivElement>(null);

  // Filter and search state
  const [filterText, setFilterText] = useState('');

  // Sorting state
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc' | null>(null);

  // Column resizing state
  const [colWidths, setColWidths] = useState<Record<string, number>>({});
  const [resizingCol, setResizingCol] = useState<{ name: string; startX: number; startW: number } | null>(null);

  // Cell selection state for Live Aggregates
  const [selectedCells, setSelectedCells] = useState<CellSelection[]>([]);
  const [selectionAnchor, setSelectionAnchor] = useState<{ rowIdx: number; colIdx: number } | null>(null);
  const [isDraggingSelection, setIsDraggingSelection] = useState(false);

  // Modals state
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

  // Infer ColumnInfo for each column name
  const columns: ColumnInfo[] = useMemo(() => {
    return columnNames.map((colName) => {
      let hasBlob = false;
      let hasReal = false;
      let hasInt = false;
      let hasText = false;

      for (let i = 0; i < Math.min(rows.length, 50); i++) {
        const v = rows[i]?.[colName];
        if (v === null || v === undefined) continue;
        if (typeof v === 'object' && v.__isBlob) {
          hasBlob = true;
        } else if (typeof v === 'number') {
          if (Number.isInteger(v)) hasInt = true;
          else hasReal = true;
        } else if (typeof v === 'string') {
          hasText = true;
        }
      }

      let type = 'TEXT';
      if (hasBlob) type = 'BLOB';
      else if (hasReal) type = 'REAL';
      else if (hasInt && !hasText) type = 'INTEGER';

      return {
        name: colName,
        type,
        notnull: false,
        pk: false,
      };
    });
  }, [columnNames, rows]);

  // Global mouseup to finish drag selection
  useEffect(() => {
    const handleMouseUp = () => {
      setIsDraggingSelection(false);
    };
    window.addEventListener('mouseup', handleMouseUp);
    return () => window.removeEventListener('mouseup', handleMouseUp);
  }, []);

  // Clear selection on query change
  useEffect(() => {
    setSelectedCells([]);
    setSelectionAnchor(null);
  }, [columnNames, rows]);

  // Filter rows by search text
  const filteredRows = useMemo(() => {
    if (!filterText.trim()) return rows;
    const term = filterText.toLowerCase();
    return rows.filter((r) => {
      return columnNames.some((c) => {
        const val = r[c];
        if (val === null || val === undefined) return false;
        return String(val).toLowerCase().includes(term);
      });
    });
  }, [rows, columnNames, filterText]);

  // Sort rows
  const sortedRows = useMemo(() => {
    if (!sortColumn || !sortDirection) return filteredRows;
    return [...filteredRows].sort((a, b) => {
      const valA = a[sortColumn];
      const valB = b[sortColumn];
      if (valA === null || valA === undefined) return sortDirection === 'asc' ? 1 : -1;
      if (valB === null || valB === undefined) return sortDirection === 'asc' ? -1 : 1;
      if (typeof valA === 'number' && typeof valB === 'number') {
        return sortDirection === 'asc' ? valA - valB : valB - valA;
      }
      return sortDirection === 'asc'
        ? String(valA).localeCompare(String(valB))
        : String(valB).localeCompare(String(valA));
    });
  }, [filteredRows, sortColumn, sortDirection]);

  // Auto-calculated column widths based on maximum cell content length
  const autoColWidths = useMemo(() => {
    const map: Record<string, number> = {};
    columns.forEach((col) => {
      const headerLen = (col.name.length + col.type.length) * 8 + 70;
      let maxContentLen = 0;
      const sampleSize = Math.min(rows.length, 80);
      for (let i = 0; i < sampleSize; i++) {
        const r = rows[i];
        const val = r[col.name];
        if (val !== null && val !== undefined) {
          const str = typeof val === 'object' ? (val.__isBlob ? 'BLOB (000B)' : JSON.stringify(val)) : String(val);
          if (str.length > maxContentLen) {
            maxContentLen = str.length;
          }
        }
      }
      const contentLen = maxContentLen * 8 + 32;
      const idealW = Math.min(480, Math.max(headerLen, Math.max(90, Math.round(contentLen))));
      map[col.name] = idealW;
    });
    return map;
  }, [columns, rows]);

  const getColWidth = (colName: string): number => {
    return colWidths[colName] || autoColWidths[colName] || 150;
  };

  const handleAutoFitColumn = (colName: string) => {
    const idealW = autoColWidths[colName] || 150;
    setColWidths((prev) => ({
      ...prev,
      [colName]: idealW,
    }));
  };

  const handleResizeMouseDown = (e: React.MouseEvent, colName: string) => {
    e.stopPropagation();
    e.preventDefault();
    const startX = e.clientX;
    const startW = getColWidth(colName);

    setResizingCol({ name: colName, startX, startW });

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

  const handleSortToggle = (colName: string) => {
    if (sortColumn !== colName) {
      setSortColumn(colName);
      setSortDirection('asc');
    } else if (sortDirection === 'asc') {
      setSortDirection('desc');
    } else {
      setSortColumn(null);
      setSortDirection(null);
    }
  };

  // Virtualizer for smooth 60fps scrolling
  const rowVirtualizer = useVirtualizer({
    count: sortedRows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 32,
    overscan: 15,
  });

  // Quick cell lookup
  const selectedCellKeys = useMemo(() => {
    const set = new Set<string>();
    for (const c of selectedCells) {
      set.add(`${c.rowIndex}:${c.columnName}`);
    }
    return set;
  }, [selectedCells]);

  // Rectangular range selection
  const selectCellRange = (startRow: number, startCol: number, endRow: number, endCol: number, append = false) => {
    const minR = Math.max(0, Math.min(startRow, endRow));
    const maxR = Math.min(sortedRows.length - 1, Math.max(startRow, endRow));
    const minC = Math.max(0, Math.min(startCol, endCol));
    const maxC = Math.min(columns.length - 1, Math.max(startCol, endCol));

    const rangeCells: CellSelection[] = [];
    for (let r = minR; r <= maxR; r++) {
      const row = sortedRows[r];
      if (!row) continue;
      const displayRow = r + 1;
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

  const handleCellMouseDown = (rowIdx: number, colIdx: number, colName: string, cellVal: any, e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.closest('button')) return;
    e.preventDefault();

    const displayRowIndex = rowIdx + 1;

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

  const handleCellMouseEnter = (rowIdx: number, colIdx: number) => {
    if (!isDraggingSelection || !selectionAnchor) return;
    selectCellRange(selectionAnchor.rowIdx, selectionAnchor.colIdx, rowIdx, colIdx, false);
  };

  const handleSelectRow = (rowIdx: number, e: React.MouseEvent) => {
    if (e.shiftKey && selectionAnchor) {
      selectCellRange(selectionAnchor.rowIdx, 0, rowIdx, columns.length - 1, false);
    } else {
      setSelectionAnchor({ rowIdx, colIdx: 0 });
      selectCellRange(rowIdx, 0, rowIdx, columns.length - 1, e.metaKey || e.ctrlKey);
    }
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = document.activeElement?.tagName;
      if (activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT') return;

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        selectCellRange(0, 0, sortedRows.length - 1, columns.length - 1, false);
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
      if (e.key === 'ArrowDown') newR = Math.min(sortedRows.length - 1, newR + 1);
      if (e.key === 'ArrowLeft') newC = Math.max(0, newC - 1);
      if (e.key === 'ArrowRight') newC = Math.min(columns.length - 1, newC + 1);

      const targetCol = columns[newC];
      const targetRow = sortedRows[newR];

      if (e.shiftKey) {
        selectCellRange(currentAnchor.rowIdx, currentAnchor.colIdx, newR, newC, false);
      } else {
        setSelectionAnchor({ rowIdx: newR, colIdx: newC });
        if (targetCol && targetRow) {
          setSelectedCells([
            {
              rowIndex: newR + 1,
              columnName: targetCol.name,
              value: targetRow[targetCol.name],
            },
          ]);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectionAnchor, sortedRows, columns]);

  // Export results
  const exportCsv = () => {
    if (sortedRows.length === 0) return;
    const headers = columnNames.join(',');
    const body = sortedRows
      .map((r) =>
        columnNames
          .map((c) => {
            const val = r[c];
            if (val === null || val === undefined) return '';
            const str = String(val).replace(/"/g, '""');
            return `"${str}"`;
          })
          .join(',')
      )
      .join('\n');
    const blob = new Blob([headers + '\n' + body], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', insertTimestamp('query_result.csv'));
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportJson = () => {
    if (sortedRows.length === 0) return;
    const blob = new Blob([JSON.stringify(sortedRows, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', insertTimestamp('query_result.json'));
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const copyAsTsv = () => {
    if (sortedRows.length === 0) return;
    const headers = columnNames.join('\t');
    const body = sortedRows
      .map((r) => columnNames.map((c) => String(r[c] ?? '')).join('\t'))
      .join('\n');
    navigator.clipboard.writeText(headers + '\n' + body);
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-vscode-bg border border-vscode-border rounded select-none">
      {/* Search & Export Toolbar */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-vscode-border bg-vscode-header text-xs flex-shrink-0 gap-2">
        {/* Search input */}
        <div className="flex items-center gap-2 flex-1 max-w-sm bg-vscode-inputBg border border-vscode-inputBorder rounded px-2 py-0.5">
          <span className="codicon codicon-search text-vscode-fg/50 text-xs"></span>
          <input
            type="text"
            placeholder="Search query results..."
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            className="flex-1 bg-transparent text-vscode-inputFg outline-none text-xs"
          />
          {filterText && (
            <button onClick={() => setFilterText('')} className="text-vscode-fg/50 hover:text-vscode-fg">
              <span className="codicon codicon-close text-xs"></span>
            </button>
          )}
        </div>

        {/* Export Buttons */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={copyAsTsv}
            className="flex items-center gap-1 px-2 py-1 bg-vscode-secondaryBtn text-vscode-secondaryBtnFg hover:bg-vscode-secondaryBtnHover rounded text-xs transition-colors"
            title="Copy all results as TSV to clipboard"
          >
            <span className="codicon codicon-copy text-xs"></span>
            <span>Copy</span>
          </button>
          <button
            onClick={exportCsv}
            className="flex items-center gap-1 px-2 py-1 bg-vscode-secondaryBtn text-vscode-secondaryBtnFg hover:bg-vscode-secondaryBtnHover rounded text-xs transition-colors"
            title="Export to CSV"
          >
            <span className="codicon codicon-cloud-download text-xs"></span>
            <span>CSV</span>
          </button>
          <button
            onClick={exportJson}
            className="flex items-center gap-1 px-2 py-1 bg-vscode-secondaryBtn text-vscode-secondaryBtnFg hover:bg-vscode-secondaryBtnHover rounded text-xs transition-colors"
            title="Export to JSON"
          >
            <span className="codicon codicon-file-code text-xs"></span>
            <span>JSON</span>
          </button>
        </div>
      </div>

      {/* Grid Container */}
      <div ref={parentRef} className="flex-1 overflow-auto bg-vscode-bg relative">
        <div
          style={{
            height: `${rowVirtualizer.getTotalSize() + 32}px`,
            minWidth: `${columns.reduce((acc, col) => acc + getColWidth(col.name), 48)}px`,
            position: 'relative',
          }}
        >
          {/* Header Row */}
          <div className="sticky top-0 z-20 flex bg-vscode-header border-b border-vscode-border font-medium text-xs text-vscode-fg select-none">
            {/* Corner row number header */}
            <div className="sticky left-0 z-30 w-12 flex-shrink-0 h-8 flex items-center justify-center border-r border-vscode-border bg-vscode-header text-vscode-fg/40 font-mono-code text-[11px]">
              #
            </div>

            {/* Column Headers */}
            {columns.map((col, colIdx) => {
              const colW = getColWidth(col.name);
              const isSorted = sortColumn === col.name;

              return (
                <div
                  key={col.name}
                  style={{ width: `${colW}px` }}
                  onClick={() => handleSortToggle(col.name)}
                  className="flex-shrink-0 h-8 flex items-center justify-between px-2.5 border-r border-vscode-border hover:bg-vscode-hover/80 cursor-pointer group relative overflow-hidden transition-colors"
                  title={`Click to sort by ${col.name} (${col.type})`}
                >
                  <div className="flex items-center gap-1.5 truncate">
                    <span className="truncate font-semibold">{col.name}</span>
                    <span className="px-1 py-0.2 text-[9px] font-mono-code rounded bg-vscode-badge text-vscode-badgeFg opacity-75">
                      {col.type}
                    </span>
                  </div>

                  <div className="flex items-center ml-1">
                    {isSorted ? (
                      <span
                        className={`codicon ${
                          sortDirection === 'asc' ? 'codicon-arrow-up' : 'codicon-arrow-down'
                        } text-xs text-vscode-focusBorder`}
                      ></span>
                    ) : (
                      <span className="codicon codicon-chevron-down opacity-0 group-hover:opacity-40 text-xs"></span>
                    )}
                  </div>

                  {/* Resizer Handle */}
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

          {/* Virtual Rows */}
          {sortedRows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-vscode-fg/50 text-xs">
              <span className="codicon codicon-search text-2xl mb-2 opacity-40"></span>
              <span>No matching records</span>
            </div>
          ) : (
            rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const row = sortedRows[virtualRow.index];
              const rowIndex = virtualRow.index + 1;

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
                  {/* Row Number */}
                  <div
                    onClick={(e) => handleSelectRow(virtualRow.index, e)}
                    className="sticky left-0 z-10 w-12 flex-shrink-0 h-full flex items-center justify-center border-r border-vscode-border bg-vscode-bg group-hover:bg-vscode-hover hover:!bg-vscode-active/40 text-vscode-fg/50 font-mono-code text-[11px] cursor-pointer select-none"
                    title="Click to select row (Shift+Click for range)"
                  >
                    <span>{rowIndex}</span>
                  </div>

                  {/* Cells */}
                  {columns.map((col, colIdx) => {
                    const colW = getColWidth(col.name);
                    const isSelected = selectedCellKeys.has(`${rowIndex}:${col.name}`);
                    const isAnchor =
                      selectionAnchor?.rowIdx === virtualRow.index && selectionAnchor?.colIdx === colIdx;

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
                          isSelected={isSelected}
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

      {/* Footer / Stats Bar */}
      <div className="h-9 px-3 flex items-center justify-between border-t border-vscode-border bg-vscode-header text-xs flex-shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-vscode-fg/70">
            {filterText ? `${sortedRows.length} of ${rows.length} rows` : `${rows.length.toLocaleString()} rows`}
          </span>
          {truncated && totalReturned && (
            <span
              className="text-[11px] text-amber-400 bg-amber-500/15 px-2 py-0.5 rounded border border-amber-500/30 font-medium"
              title={`Result capped at ${rows.length.toLocaleString()} rows for peak performance and stability. Total matched in database: ${totalReturned.toLocaleString()} rows.`}
            >
              Capped from {totalReturned.toLocaleString()} rows
            </span>
          )}
          <span className="text-vscode-fg/40">•</span>
          <span className="font-mono-code text-vscode-fg/70">{durationMs} ms</span>
        </div>

        {/* Live Aggregates for Multi-Cell Selection */}
        <AggregateFooter selectedCells={selectedCells} totalRows={rows.length} />
      </div>

      {/* JSON Inspection Modal */}
      {jsonModal.open && (
        <JsonModal
          title={jsonModal.title}
          data={jsonModal.data}
          onClose={() => setJsonModal({ open: false, title: '', data: null })}
        />
      )}

      {/* BLOB Inspection Modal */}
      {blobModal.open && (
        <BlobModal
          colName={blobModal.colName}
          blob={blobModal.blob}
          onClose={() => setBlobModal({ open: false, colName: '', blob: null })}
        />
      )}
    </div>
  );
};
