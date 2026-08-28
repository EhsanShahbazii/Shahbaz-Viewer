import React, { useState, useEffect } from 'react';

export type ViewMode = 'data' | 'schema' | 'erd' | 'sql' | 'charts';

interface HeaderProps {
  databaseName: string;
  activeTable?: string;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  dirtyCount: number;
  onCommitChanges: () => void;
  onDiscardChanges: () => void;
  onExport: (format: 'csv' | 'json' | 'markdown' | 'sql' | 'ts') => void;
  onOpenOrmModal: () => void;
  onOpenImportModal: () => void;
  onRefresh: () => void;
  isSidebarOpen?: boolean;
  onToggleSidebar?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  databaseName,
  activeTable,
  viewMode,
  onViewModeChange,
  dirtyCount,
  onCommitChanges,
  onDiscardChanges,
  onExport,
  onOpenOrmModal,
  onOpenImportModal,
  onRefresh,
  isSidebarOpen = true,
  onToggleSidebar,
}) => {
  const [exportOpen, setExportOpen] = useState(false);

  // Close export menu when switching view mode
  useEffect(() => {
    setExportOpen(false);
  }, [viewMode]);

  return (
    <header className="h-10 border-b border-vscode-border bg-vscode-header flex items-center justify-between px-3 flex-shrink-0 select-none z-30">
      {/* Left side: Sidebar Toggle, Database name & View Mode Tabs */}
      <div className="flex items-center gap-3">
        {onToggleSidebar && (
          <button
            onClick={onToggleSidebar}
            className="flex items-center justify-center w-6 h-6 rounded hover:bg-vscode-hover text-vscode-fg transition-colors"
            title={isSidebarOpen ? 'Hide Sidebar (Ctrl+B)' : 'Show Sidebar (Ctrl+B)'}
          >
            <span
              className={`codicon ${
                isSidebarOpen ? 'codicon-layout-sidebar-left' : 'codicon-layout-sidebar-left-off'
              } text-xs`}
            ></span>
          </button>
        )}

        <div className="flex items-center gap-2">
          <span className="codicon codicon-database text-vscode-info text-sm"></span>
          <span className="font-semibold text-xs text-vscode-fg tracking-wide">
            {databaseName || 'No Database Loaded'}
          </span>
        </div>

        {/* View Mode Switcher Pills */}
        <div className="flex items-center bg-vscode-bg p-0.5 rounded border border-vscode-border text-xs">
          <button
            onClick={() => onViewModeChange('data')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded transition-colors ${
              viewMode === 'data'
                ? 'bg-vscode-button text-vscode-buttonFg font-medium shadow-sm'
                : 'text-vscode-fg/70 hover:text-vscode-fg'
            }`}
          >
            <span className="codicon codicon-table text-xs"></span>
            <span>Data Grid</span>
          </button>

          <button
            onClick={() => onViewModeChange('schema')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded transition-colors ${
              viewMode === 'schema'
                ? 'bg-vscode-button text-vscode-buttonFg font-medium shadow-sm'
                : 'text-vscode-fg/70 hover:text-vscode-fg'
            }`}
          >
            <span className="codicon codicon-inspect text-xs"></span>
            <span>Schema & DDL</span>
          </button>

          <button
            onClick={() => onViewModeChange('erd')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded transition-colors ${
              viewMode === 'erd'
                ? 'bg-vscode-button text-vscode-buttonFg font-medium shadow-sm'
                : 'text-vscode-fg/70 hover:text-vscode-fg'
            }`}
          >
            <span className="codicon codicon-type-hierarchy text-xs"></span>
            <span>ER Diagram</span>
          </button>

          <button
            onClick={() => onViewModeChange('sql')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded transition-colors ${
              viewMode === 'sql'
                ? 'bg-vscode-button text-vscode-buttonFg font-medium shadow-sm'
                : 'text-vscode-fg/70 hover:text-vscode-fg'
            }`}
          >
            <span className="codicon codicon-code text-xs"></span>
            <span>SQL Studio</span>
          </button>

          <button
            onClick={() => onViewModeChange('charts')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded transition-colors ${
              viewMode === 'charts'
                ? 'bg-vscode-button text-vscode-buttonFg font-medium shadow-sm'
                : 'text-vscode-fg/70 hover:text-vscode-fg'
            }`}
            title="Quick Charts & Data Visualizer"
          >
            <span className="codicon codicon-graph-line text-xs"></span>
            <span>Charts</span>
          </button>
        </div>
      </div>

      {/* Right side: Dirty Changes commit bar & Export actions */}
      <div className="flex items-center gap-2">
        {/* Transaction Dirty Bar */}
        {dirtyCount > 0 && (
          <div className="flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/30 rounded px-2 py-0.5 text-xs animate-pulse">
            <span className="w-2 h-2 rounded-full bg-amber-400"></span>
            <span className="text-amber-300 font-medium">
              {dirtyCount} unsaved {dirtyCount === 1 ? 'change' : 'changes'}
            </span>
            <button
              onClick={onCommitChanges}
              className="ml-1 px-2 py-0.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded font-medium flex items-center gap-1 transition-colors"
              title="Save changes to SQLite file"
            >
              <span className="codicon codicon-save text-xs"></span>
              <span>Commit</span>
            </button>
            <button
              onClick={onDiscardChanges}
              className="px-2 py-0.5 bg-rose-600/30 hover:bg-rose-600/50 text-rose-200 rounded transition-colors"
              title="Discard pending changes"
            >
              Discard
            </button>
          </div>
        )}

        {/* ORM & Code Generator Button */}
        {activeTable && (
          <button
            onClick={onOpenOrmModal}
            className="flex items-center gap-1.5 text-xs px-2.5 py-1 bg-vscode-secondaryBtn text-vscode-secondaryBtnFg hover:bg-vscode-secondaryBtnHover rounded transition-colors"
            title="Generate Prisma, Drizzle, Zod, and ORM models"
          >
            <span className="codicon codicon-code text-xs text-amber-400"></span>
            <span>ORM Code</span>
          </button>
        )}

        {/* Import CSV / JSON Button */}
        <button
          onClick={onOpenImportModal}
          className="flex items-center gap-1 text-xs px-2.5 py-1 bg-vscode-secondaryBtn text-vscode-secondaryBtnFg hover:bg-vscode-secondaryBtnHover rounded transition-colors"
          title="Import CSV or JSON data into SQLite"
        >
          <span className="codicon codicon-cloud-upload text-xs text-vscode-info"></span>
          <span>Import</span>
        </button>

        {/* Export Menu Dropdown */}
        {activeTable && (
          <div className="relative">
            <button
              onClick={() => setExportOpen((prev) => !prev)}
              className="flex items-center gap-1 text-xs px-2.5 py-1 bg-vscode-secondaryBtn text-vscode-secondaryBtnFg hover:bg-vscode-secondaryBtnHover rounded transition-colors"
            >
              <span className="codicon codicon-export text-xs"></span>
              <span>Export</span>
              <span className="codicon codicon-chevron-down text-[10px]"></span>
            </button>

            {exportOpen && (
              <>
                <div
                  className="fixed inset-0 z-[90] cursor-default"
                  onClick={() => setExportOpen(false)}
                />
                <div
                  className="absolute right-0 top-full mt-1.5 w-60 border border-vscode-menuBorder rounded-lg shadow-2xl py-1 text-xs z-[100] divide-y divide-vscode-border animate-in fade-in zoom-in-95 duration-100"
                  style={{ backgroundColor: 'var(--vscode-menu-background, var(--vscode-editorWidget-background, #252526))' }}
                  onClick={() => setExportOpen(false)}
                >
                  <div className="py-1">
                    <button
                      onClick={() => onExport('csv')}
                      className="w-full text-left px-3 py-1.5 hover:bg-vscode-hover hover:text-vscode-fg flex items-center justify-between transition-colors group"
                    >
                      <div className="flex items-center gap-2">
                        <span className="codicon codicon-table text-emerald-400 text-xs"></span>
                        <span className="font-medium text-vscode-fg">CSV (.csv)</span>
                      </div>
                      <span className="text-[10px] text-vscode-fg/50 group-hover:text-vscode-fg/70 font-mono">Excel / Sheets</span>
                    </button>
                    <button
                      onClick={() => onExport('json')}
                      className="w-full text-left px-3 py-1.5 hover:bg-vscode-hover hover:text-vscode-fg flex items-center justify-between transition-colors group"
                    >
                      <div className="flex items-center gap-2">
                        <span className="codicon codicon-json text-amber-400 text-xs"></span>
                        <span className="font-medium text-vscode-fg">JSON (.json)</span>
                      </div>
                      <span className="text-[10px] text-vscode-fg/50 group-hover:text-vscode-fg/70 font-mono">REST API</span>
                    </button>
                    <button
                      onClick={() => onExport('markdown')}
                      className="w-full text-left px-3 py-1.5 hover:bg-vscode-hover hover:text-vscode-fg flex items-center justify-between transition-colors group"
                    >
                      <div className="flex items-center gap-2">
                        <span className="codicon codicon-markdown text-sky-400 text-xs"></span>
                        <span className="font-medium text-vscode-fg">Markdown Table</span>
                      </div>
                      <span className="text-[10px] text-vscode-fg/50 group-hover:text-vscode-fg/70 font-mono">GitHub / Docs</span>
                    </button>
                  </div>
                  <div className="py-1">
                    <button
                      onClick={() => onExport('sql')}
                      className="w-full text-left px-3 py-1.5 hover:bg-vscode-hover hover:text-vscode-fg flex items-center justify-between transition-colors group"
                    >
                      <div className="flex items-center gap-2">
                        <span className="codicon codicon-database text-rose-400 text-xs"></span>
                        <span className="font-medium text-vscode-fg">SQL INSERT</span>
                      </div>
                      <span className="text-[10px] text-vscode-fg/50 group-hover:text-vscode-fg/70 font-mono">DDL Dump</span>
                    </button>
                    <button
                      onClick={() => onExport('ts')}
                      className="w-full text-left px-3 py-1.5 hover:bg-vscode-hover hover:text-vscode-fg flex items-center justify-between transition-colors group"
                    >
                      <div className="flex items-center gap-2">
                        <span className="codicon codicon-file-code text-blue-400 text-xs"></span>
                        <span className="font-medium text-vscode-fg">TypeScript Interface</span>
                      </div>
                      <span className="text-[10px] text-vscode-fg/50 group-hover:text-vscode-fg/70 font-mono">Code Types</span>
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* Refresh Button */}
        <button
          onClick={onRefresh}
          className="p-1 rounded hover:bg-vscode-hover text-vscode-fg"
          title="Refresh Data"
        >
          <span className="codicon codicon-refresh text-xs"></span>
        </button>
      </div>
    </header>
  );
};
