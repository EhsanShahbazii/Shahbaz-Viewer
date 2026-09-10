import React, { useState } from 'react';
import { ColumnInfo, ForeignKeyInfo } from '../../../src/common/messages';

interface SchemaViewerProps {
  tableName: string;
  columns: ColumnInfo[];
  foreignKeys: ForeignKeyInfo[];
  sql?: string;
}

export const SchemaViewer: React.FC<SchemaViewerProps> = ({
  tableName,
  columns,
  foreignKeys,
  sql,
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopySql = () => {
    if (sql) {
      navigator.clipboard.writeText(sql);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-auto bg-vscode-bg p-3 sm:p-6 space-y-4 sm:space-y-6">
      {/* Table Information Card */}
      <div className="border border-vscode-border rounded bg-vscode-header p-3 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="codicon codicon-table text-vscode-info text-lg"></span>
            <h2 className="text-base font-semibold">{tableName}</h2>
            <span className="text-xs px-2 py-0.5 rounded bg-vscode-badge text-vscode-badgeFg">
              {columns.length} columns
            </span>
            {foreignKeys.length > 0 && (
              <span className="text-xs px-2 py-0.5 rounded bg-sky-500/20 text-sky-300">
                {foreignKeys.length} foreign keys
              </span>
            )}
          </div>
        </div>

        {/* Columns Definition Table */}
        <div className="border border-vscode-border rounded overflow-x-auto bg-vscode-bg">
          <table className="w-full text-left text-xs">
            <thead className="bg-vscode-header border-b border-vscode-border font-medium text-vscode-fg/70">
              <tr>
                <th className="py-2 px-3">#</th>
                <th className="py-2 px-3">Column Name</th>
                <th className="py-2 px-3">Data Type</th>
                <th className="py-2 px-3">Key</th>
                <th className="py-2 px-3">Nullable</th>
                <th className="py-2 px-3">Default Value</th>
                <th className="py-2 px-3">Foreign Key Target</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-vscode-border font-mono-code">
              {columns.map((col, idx) => {
                const isPk = col.pk > 0;
                const fk = foreignKeys.find((f) => f.from === col.name);

                return (
                  <tr key={col.name} className="hover:bg-vscode-hover/50">
                    <td className="py-2 px-3 text-vscode-fg/40">{idx + 1}</td>
                    <td className="py-2 px-3 font-semibold text-vscode-fg flex items-center gap-1.5">
                      {isPk && <span className="codicon codicon-key text-amber-400 text-xs"></span>}
                      <span>{col.name}</span>
                    </td>
                    <td className="py-2 px-3 text-vscode-info">{col.type}</td>
                    <td className="py-2 px-3">
                      {isPk ? (
                        <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px] font-sans font-semibold">
                          PRIMARY KEY
                        </span>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="py-2 px-3 font-sans">
                      {col.notnull ? (
                        <span className="text-rose-400">NOT NULL</span>
                      ) : (
                        <span className="text-vscode-fg/50">NULL</span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-vscode-fg/70">
                      {col.dflt_value !== null && col.dflt_value !== undefined
                        ? String(col.dflt_value)
                        : '-'}
                    </td>
                    <td className="py-2 px-3 font-sans">
                      {fk ? (
                        <span className="flex items-center gap-1 text-sky-400">
                          <span className="codicon codicon-arrow-right text-[10px]"></span>
                          <span>{fk.table}({fk.to})</span>
                        </span>
                      ) : (
                        '-'
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* DDL SQL Definition */}
      <div className="border border-vscode-border rounded bg-vscode-header p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="codicon codicon-code text-vscode-fg/70"></span>
            <h3 className="text-sm font-semibold">DDL Definition (CREATE TABLE)</h3>
          </div>
          <button
            onClick={handleCopySql}
            className="flex items-center gap-1 text-xs px-2.5 py-1 rounded bg-vscode-secondaryBtn text-vscode-secondaryBtnFg hover:bg-vscode-secondaryBtnHover transition-colors"
          >
            <span className={`codicon ${copied ? 'codicon-check text-green-400' : 'codicon-copy'}`}></span>
            <span>{copied ? 'Copied' : 'Copy DDL'}</span>
          </button>
        </div>

        <div className="p-3 bg-vscode-inputBg border border-vscode-border rounded overflow-x-auto">
          <pre className="font-mono-code text-xs text-vscode-fg/90 leading-relaxed whitespace-pre-wrap">
            {sql || `-- No SQL definition available for ${tableName}`}
          </pre>
        </div>
      </div>
    </div>
  );
};
