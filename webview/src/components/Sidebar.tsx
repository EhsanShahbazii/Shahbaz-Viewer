import React, { useState } from 'react';
import { TableInfo } from '../../../src/common/messages';

interface SidebarProps {
  tables: TableInfo[];
  views: TableInfo[];
  activeTable?: string;
  sizeBytes: number;
  onSelectTable: (tableName: string) => void;
  onRefresh: () => void;
  width?: number;
  onWidthChange?: (newWidth: number) => void;
  onToggleCollapse?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  tables,
  views,
  activeTable,
  sizeBytes,
  onSelectTable,
  onRefresh,
  width = 240,
  onWidthChange,
  onToggleCollapse,
}) => {
  const [filter, setFilter] = useState('');
  const [tablesExpanded, setTablesExpanded] = useState(true);
  const [viewsExpanded, setViewsExpanded] = useState(true);

  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = width;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientX - startX;
      const newWidth = Math.max(160, Math.min(480, startWidth + delta));
      if (onWidthChange) {
        onWidthChange(newWidth);
      }
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) {return '0 B';}
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const filteredTables = tables.filter((t) =>
    t.name.toLowerCase().includes(filter.toLowerCase())
  );
  const filteredViews = views.filter((v) =>
    v.name.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <aside
      style={{ width: `${width}px` }}
      className="relative flex flex-col h-full border-r border-vscode-border bg-vscode-sidebar flex-shrink-0 select-none text-xs"
    >
      {/* Search Filter Box & Collapse Button */}
      <div className="p-2 border-b border-vscode-border bg-vscode-sidebar flex items-center gap-1.5">
        <div className="relative flex-1 flex items-center">
          <span className="codicon codicon-filter absolute left-2.5 top-1/2 -translate-y-1/2 text-vscode-fg/50 text-xs pointer-events-none flex items-center"></span>
          <input
            type="text"
            placeholder="Filter tables..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="w-full pl-7 pr-6 py-1 bg-vscode-inputBg text-vscode-inputFg border border-vscode-inputBorder rounded text-xs outline-none focus:border-vscode-focusBorder"
          />
          {filter && (
            <button
              onClick={() => setFilter('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-vscode-fg/50 hover:text-vscode-fg flex items-center"
            >
              <span className="codicon codicon-close text-xs"></span>
            </button>
          )}
        </div>

        {/* Refresh Button placed directly to the right of the table filter input */}
        <button
          onClick={onRefresh}
          className="w-6 h-6 flex items-center justify-center rounded text-vscode-fg/70 hover:text-vscode-fg hover:bg-vscode-list-hoverBg transition-colors flex-shrink-0"
          title="Refresh Databases & Table"
        >
          <span className="codicon codicon-refresh text-xs"></span>
        </button>

        {onToggleCollapse && (
          <button
            onClick={onToggleCollapse}
            className="w-6 h-6 flex items-center justify-center rounded text-vscode-fg/60 hover:text-vscode-fg hover:bg-vscode-list-hoverBg transition-colors flex-shrink-0"
            title="Collapse Sidebar"
          >
            <span className="codicon codicon-chevron-left text-xs leading-none flex items-center justify-center"></span>
          </button>
        )}
      </div>

      {/* Tree View List */}
      <div className="flex-1 overflow-y-auto py-2 space-y-3">
        {/* Tables Section */}
        <div>
          <div
            onClick={() => setTablesExpanded((prev) => !prev)}
            className="flex items-center justify-between px-3 py-1 cursor-pointer text-vscode-fg/70 hover:text-vscode-fg font-semibold uppercase tracking-wider text-[10px]"
          >
            <div className="flex items-center gap-1">
              <span
                className={`codicon ${
                  tablesExpanded ? 'codicon-chevron-down' : 'codicon-chevron-right'
                } text-xs`}
              ></span>
              <span>Tables ({filteredTables.length})</span>
            </div>
          </div>

          {tablesExpanded && (
            <div className="mt-0.5 space-y-0.5">
              {filteredTables.map((t) => {
                const isActive = activeTable === t.name;
                return (
                  <button
                    key={t.name}
                    onClick={() => onSelectTable(t.name)}
                    className={`w-full flex items-center justify-between px-3 py-1 text-left transition-colors ${
                      isActive
                        ? 'bg-vscode-active text-vscode-activeFg font-medium'
                        : 'hover:bg-vscode-hover text-vscode-fg'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate pr-2">
                      <span className="codicon codicon-table text-vscode-info text-xs"></span>
                      <span className="truncate">{t.name}</span>
                    </div>
                    <span
                      className={`text-[10px] font-mono-code px-1.5 py-0.2 rounded ${
                        isActive
                          ? 'bg-black/20 text-vscode-activeFg'
                          : 'bg-vscode-badge text-vscode-badgeFg'
                      }`}
                    >
                      {t.rowCount.toLocaleString()}
                    </span>
                  </button>
                );
              })}
              {filteredTables.length === 0 && (
                <div className="px-6 py-1 text-vscode-fg/40 text-xs italic">
                  No tables found
                </div>
              )}
            </div>
          )}
        </div>

        {/* Views Section */}
        {views.length > 0 && (
          <div>
            <div
              onClick={() => setViewsExpanded((prev) => !prev)}
              className="flex items-center justify-between px-3 py-1 cursor-pointer text-vscode-fg/70 hover:text-vscode-fg font-semibold uppercase tracking-wider text-[10px]"
            >
              <div className="flex items-center gap-1">
                <span
                  className={`codicon ${
                    viewsExpanded ? 'codicon-chevron-down' : 'codicon-chevron-right'
                  } text-xs`}
                ></span>
                <span>Views ({filteredViews.length})</span>
              </div>
            </div>

            {viewsExpanded && (
              <div className="mt-0.5 space-y-0.5">
                {filteredViews.map((v) => {
                  const isActive = activeTable === v.name;
                  return (
                    <button
                      key={v.name}
                      onClick={() => onSelectTable(v.name)}
                      className={`w-full flex items-center justify-between px-3 py-1 text-left transition-colors ${
                        isActive
                          ? 'bg-vscode-active text-vscode-activeFg font-medium'
                          : 'hover:bg-vscode-hover text-vscode-fg'
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate pr-2">
                        <span className="codicon codicon-eye text-emerald-400 text-xs"></span>
                        <span className="truncate">{v.name}</span>
                      </div>
                      <span
                        className={`text-[10px] font-mono-code px-1.5 py-0.2 rounded ${
                          isActive
                            ? 'bg-black/20 text-vscode-activeFg'
                            : 'bg-vscode-badge text-vscode-badgeFg'
                        }`}
                      >
                        view
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Sidebar Footer Stats */}
      <div className="p-2.5 border-t border-vscode-border bg-vscode-sidebar text-[11px] text-vscode-fg/60 flex items-center justify-between">
        <span>File size</span>
        <span className="font-mono-code font-medium text-vscode-fg">
          {formatBytes(sizeBytes)}
        </span>
      </div>

      {/* Resizable Right Border Drag Handle */}
      <div
        onMouseDown={handleResizeStart}
        className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-vscode-focusBorder/60 transition-colors z-20 group"
        title="Drag to resize sidebar"
      >
        <div className="w-0.5 h-full bg-transparent group-hover:bg-vscode-focusBorder mx-auto transition-colors" />
      </div>
    </aside>
  );
};
