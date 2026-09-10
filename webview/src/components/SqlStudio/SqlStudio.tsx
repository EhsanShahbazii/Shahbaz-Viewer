import React, { useState } from 'react';
import { TableInfo } from '../../../src/common/messages';
import { QueryResultTable } from './QueryResultTable';

interface SqlStudioProps {
  tables: TableInfo[];
  activeTable?: string;
  onExecuteQuery: (query: string) => void;
  onExplainQuery: (query: string) => void;
  queryResult: {
    query: string;
    columns: string[];
    rows: any[];
    durationMs: number;
    rowsAffected?: number;
    error?: string;
  } | null;
  explainResult: {
    query: string;
    plan: any[];
    warnings?: string[];
  } | null;
}

export const SqlStudio: React.FC<SqlStudioProps> = ({
  tables,
  activeTable,
  onExecuteQuery,
  onExplainQuery,
  queryResult,
  explainResult,
}) => {
  const [query, setQuery] = useState(
    activeTable
      ? `SELECT * FROM "${activeTable}" LIMIT 50;`
      : 'SELECT * FROM sqlite_master;'
  );
  const [history, setHistory] = useState<string[]>([]);
  const [aiPrompt, setAiPrompt] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'results' | 'explain' | 'history'>('results');

  const handleRun = () => {
    if (!query.trim()) {return;}
    setHistory((prev) => [query, ...prev.filter((q) => q !== query).slice(0, 19)]);
    setActiveTab('results');
    onExecuteQuery(query);
  };

  const handleExplain = () => {
    if (!query.trim()) {return;}
    setActiveTab('explain');
    onExplainQuery(query);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleRun();
    }
  };

  // AI Natural language to SQL prompt generator
  const handleGenerateAiSql = () => {
    if (!aiPrompt.trim()) {return;}
    setIsAiLoading(true);

    setTimeout(() => {
      const lower = aiPrompt.toLowerCase();
      let generated = '';

      if (lower.includes('count') || lower.includes('how many')) {
        const target = activeTable || (tables[0] ? tables[0].name : 'table');
        generated = `SELECT COUNT(*) AS total_count FROM "${target}";`;
      } else if (lower.includes('recent') || lower.includes('latest') || lower.includes('order by')) {
        const target = activeTable || (tables[0] ? tables[0].name : 'table');
        generated = `SELECT * FROM "${target}" ORDER BY rowid DESC LIMIT 20;`;
      } else if (lower.includes('join')) {
        if (tables.length >= 2) {
          const t1 = tables[0];
          const t2 = tables[1];
          const fk = t1.foreignKeys[0];
          if (fk) {
            generated = `SELECT * FROM "${t1.name}" JOIN "${fk.table}" ON "${t1.name}"."${fk.from}" = "${fk.table}"."${fk.to}" LIMIT 50;`;
          } else {
            generated = `SELECT * FROM "${t1.name}" JOIN "${t2.name}" LIMIT 50;`;
          }
        } else {
          generated = `SELECT * FROM "${activeTable || 'table'}" LIMIT 50;`;
        }
      } else {
        const target = activeTable || (tables[0] ? tables[0].name : 'table');
        generated = `SELECT * FROM "${target}" WHERE 1=1 LIMIT 50;`;
      }

      setQuery(generated);
      setIsAiLoading(false);
      setAiPrompt('');
    }, 300);
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-vscode-bg">
      {/* Editor & Controls Section */}
      <div className="flex flex-col border-b border-vscode-border bg-vscode-header p-3 gap-3 flex-shrink-0">
        {/* AI Natural Language Prompt Bar */}
        <div className="flex items-center gap-2 bg-vscode-inputBg border border-vscode-inputBorder rounded px-2.5 py-1 text-xs">
          <span className="codicon codicon-sparkle text-amber-400 text-sm"></span>
          <input
            type="text"
            placeholder="Ask AI: e.g. 'Count total records', 'Get latest 20 rows', 'Join tables'..."
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleGenerateAiSql()}
            className="flex-1 bg-transparent text-vscode-inputFg outline-none text-xs"
          />
          <button
            onClick={handleGenerateAiSql}
            disabled={!aiPrompt.trim() || isAiLoading}
            className="flex items-center gap-1 px-2 py-0.5 rounded bg-vscode-button text-vscode-buttonFg hover:bg-vscode-buttonHover disabled:opacity-40 transition-colors text-xs"
          >
            <span>{isAiLoading ? 'Generating...' : 'Generate SQL'}</span>
          </button>
        </div>

        {/* SQL Code Input */}
        <div className="relative border border-vscode-border rounded overflow-hidden bg-vscode-inputBg">
          <textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={4}
            placeholder="Enter SQL query (e.g. SELECT * FROM users)..."
            className="w-full p-3 font-mono-code text-xs bg-transparent text-vscode-inputFg outline-none resize-y"
          />
        </div>

        {/* Action Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button
              onClick={handleRun}
              className="flex items-center gap-1.5 px-3 py-1 bg-vscode-button text-vscode-buttonFg hover:bg-vscode-buttonHover rounded font-semibold text-xs transition-colors shadow-sm"
              title="Execute Query (Cmd+Enter or Ctrl+Enter)"
            >
              <span className="codicon codicon-play text-xs"></span>
              <span>Run Query</span>
              <kbd className="opacity-70 text-[10px] ml-1">⌘↵</kbd>
            </button>
          </div>

          {/* Execution Metrics Badges */}
          {queryResult && (
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 text-xs">
              {queryResult.error ? (
                <span className="flex items-center gap-1 text-rose-400 font-medium">
                  <span className="codicon codicon-error text-xs"></span>
                  <span>Query Failed</span>
                </span>
              ) : (
                <>
                  <span className="flex items-center gap-1 text-emerald-400 font-medium">
                    <span className="codicon codicon-pass text-xs"></span>
                    <span>Success</span>
                  </span>
                  <span className="text-vscode-fg/60">•</span>
                  <span className="font-mono-code text-vscode-fg/80">
                    {queryResult.durationMs} ms
                  </span>
                  <span className="text-vscode-fg/60">•</span>
                  <span className="text-vscode-fg/80">
                    {queryResult.rows.length.toLocaleString()}{' '}
                    <span className="hidden sm:inline">rows returned</span>
                    <span className="sm:hidden">rows</span>
                  </span>
                  {queryResult.rowsAffected !== undefined && queryResult.rowsAffected > 0 && (
                    <>
                      <span className="text-vscode-fg/60">•</span>
                      <span className="text-vscode-info">
                        {queryResult.rowsAffected}{' '}
                        <span className="hidden sm:inline">rows modified</span>
                        <span className="sm:hidden">mod</span>
                      </span>
                    </>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Tabs navigation for Output: Results / Explain / History */}
      <div className="flex border-b border-vscode-border bg-vscode-header px-3 pt-1 gap-2 flex-shrink-0 text-xs">
        <button
          onClick={() => setActiveTab('results')}
          className={`flex items-center gap-1.5 px-3 py-1.5 border-b-2 font-medium transition-colors ${
            activeTab === 'results'
              ? 'border-vscode-focusBorder text-vscode-fg'
              : 'border-transparent text-vscode-fg/60 hover:text-vscode-fg'
          }`}
        >
          <span className="codicon codicon-table"></span>
          <span>Results</span>
        </button>

        <button
          onClick={() => {
            setActiveTab('explain');
            if (!explainResult && query.trim()) {
              handleExplain();
            }
          }}
          className={`flex items-center gap-1.5 px-3 py-1.5 border-b-2 font-medium transition-colors ${
            activeTab === 'explain'
              ? 'border-vscode-focusBorder text-vscode-fg'
              : 'border-transparent text-vscode-fg/60 hover:text-vscode-fg'
          }`}
        >
          <span className="codicon codicon-graph"></span>
          <span>Explain Plan</span>
          {explainResult?.warnings && explainResult.warnings.length > 0 && (
            <span className="w-2 h-2 rounded-full bg-amber-400"></span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('history')}
          className={`flex items-center gap-1.5 px-3 py-1.5 border-b-2 font-medium transition-colors ${
            activeTab === 'history'
              ? 'border-vscode-focusBorder text-vscode-fg'
              : 'border-transparent text-vscode-fg/60 hover:text-vscode-fg'
          }`}
        >
          <span className="codicon codicon-history"></span>
          <span>History ({history.length})</span>
        </button>
      </div>

      {/* Output Content Area */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-vscode-bg p-2.5">
        {activeTab === 'results' && (
          <>
            {queryResult?.error ? (
              <div className="p-4 border border-rose-500/30 rounded bg-rose-500/10 text-rose-300 font-mono-code text-xs whitespace-pre-wrap">
                {queryResult.error}
              </div>
            ) : queryResult && queryResult.columns.length > 0 ? (
              <QueryResultTable
                columns={queryResult.columns}
                rows={queryResult.rows}
                durationMs={queryResult.durationMs}
                totalReturned={queryResult.totalReturned}
                truncated={queryResult.truncated}
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-vscode-fg/50 text-xs">
                <span className="codicon codicon-terminal text-2xl mb-2 opacity-40"></span>
                <span>Execute a query to view results</span>
              </div>
            )}
          </>
        )}

        {activeTab === 'explain' && (
          <div className="flex-1 overflow-auto space-y-4 p-1">
            {explainResult?.warnings && explainResult.warnings.length > 0 && (
              <div className="p-3 border border-amber-500/30 rounded bg-amber-500/10 space-y-1">
                <div className="flex items-center gap-1.5 text-amber-400 font-semibold text-xs">
                  <span className="codicon codicon-warning"></span>
                  <span>Performance Advisories</span>
                </div>
                {explainResult.warnings.map((w, i) => (
                  <p key={i} className="text-xs text-amber-200/90 pl-5">
                    • {w}
                  </p>
                ))}
              </div>
            )}

            {explainResult && explainResult.plan.length > 0 ? (
              <div className="border border-vscode-border rounded overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-vscode-header border-b border-vscode-border text-vscode-fg/70">
                    <tr>
                      <th className="py-1.5 px-3">id</th>
                      <th className="py-1.5 px-3">parent</th>
                      <th className="py-1.5 px-3">notused</th>
                      <th className="py-1.5 px-3">Query Plan Detail</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-vscode-border font-mono-code">
                    {explainResult.plan.map((p, i) => (
                      <tr key={i} className="hover:bg-vscode-hover/50">
                        <td className="py-1.5 px-3">{p.id}</td>
                        <td className="py-1.5 px-3">{p.parent}</td>
                        <td className="py-1.5 px-3">{p.notused}</td>
                        <td className="py-1.5 px-3 font-semibold text-vscode-info">{p.detail}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-vscode-fg/50 text-xs gap-3">
                <span className="codicon codicon-graph text-3xl opacity-40"></span>
                <span>Inspect query execution plan, index usage, and performance advisories.</span>
                <button
                  onClick={handleExplain}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-vscode-button text-vscode-buttonFg hover:bg-vscode-buttonHover text-xs font-semibold shadow-sm transition-colors"
                >
                  <span className="codicon codicon-play text-xs"></span>
                  <span>Explain Query Plan</span>
                </button>
              </div>
            )}
          </div>
        )}

        {activeTab === 'history' && (
          <div className="space-y-2">
            {history.length === 0 ? (
              <div className="text-vscode-fg/50 text-xs text-center py-10">
                No query history yet.
              </div>
            ) : (
              history.map((h, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between p-2 rounded border border-vscode-border bg-vscode-header hover:bg-vscode-hover text-xs group"
                >
                  <pre className="font-mono-code truncate flex-1 pr-4">{h}</pre>
                  <button
                    onClick={() => {
                      setQuery(h);
                      setActiveTab('results');
                      onExecuteQuery(h);
                    }}
                    className="opacity-0 group-hover:opacity-100 flex items-center gap-1 px-2 py-0.5 rounded bg-vscode-button text-vscode-buttonFg text-[11px]"
                  >
                    <span className="codicon codicon-play text-[10px]"></span>
                    <span>Re-run</span>
                  </button>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};
