import React, { useState } from 'react';
import { ColumnInfo, ForeignKeyInfo } from '../../../../src/common/messages';
import { OrmGenerator } from '../../../../src/database/ormGenerator';

export type OrmDialect = 'prisma' | 'drizzle' | 'zod' | 'python' | 'golang';

interface OrmModalProps {
  isOpen: boolean;
  onClose: () => void;
  tableName: string;
  columns: ColumnInfo[];
  foreignKeys: ForeignKeyInfo[];
  onOpenInEditor: (content: string, language: string) => void;
}

export const OrmModal: React.FC<OrmModalProps> = ({
  isOpen,
  onClose,
  tableName,
  columns,
  foreignKeys,
  onOpenInEditor,
}) => {
  const [activeDialect, setActiveDialect] = useState<OrmDialect>('prisma');
  const [copied, setCopied] = useState(false);

  if (!isOpen) {return null;}

  // Generate code based on active dialect
  let generatedCode = '';
  let languageId = 'typescript';

  switch (activeDialect) {
    case 'prisma':
      generatedCode = OrmGenerator.toPrisma(tableName, columns, foreignKeys);
      languageId = 'prisma';
      break;
    case 'drizzle':
      generatedCode = OrmGenerator.toDrizzle(tableName, columns, foreignKeys);
      languageId = 'typescript';
      break;
    case 'zod':
      generatedCode = OrmGenerator.toZod(tableName, columns);
      languageId = 'typescript';
      break;
    case 'python':
      generatedCode = OrmGenerator.toPython(tableName, columns);
      languageId = 'python';
      break;
    case 'golang':
      generatedCode = OrmGenerator.toGolang(tableName, columns);
      languageId = 'go';
      break;
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(generatedCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleOpenEditor = () => {
    onOpenInEditor(generatedCode, languageId);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 select-none">
      <div className="bg-vscode-bg border border-vscode-border rounded shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-vscode-header border-b border-vscode-border">
          <div className="flex items-center gap-2">
            <span className="codicon codicon-code text-vscode-info text-base"></span>
            <span className="font-semibold text-sm">ORM & Schema Code Generation</span>
            <span className="text-xs px-2 py-0.5 rounded bg-vscode-badge text-vscode-badgeFg font-mono-code">
              {tableName}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleOpenEditor}
              className="flex items-center gap-1 text-xs px-2.5 py-1 rounded bg-vscode-secondaryBtn text-vscode-secondaryBtnFg hover:bg-vscode-secondaryBtnHover transition-colors"
              title="Open in a new VS Code editor tab beside this viewer"
            >
              <span className="codicon codicon-split-horizontal text-xs"></span>
              <span>Open in Editor</span>
            </button>

            <button
              onClick={handleCopy}
              className="flex items-center gap-1 text-xs px-2.5 py-1 rounded bg-vscode-button text-vscode-buttonFg hover:bg-vscode-buttonHover transition-colors"
            >
              <span className={`codicon ${copied ? 'codicon-check text-green-300' : 'codicon-copy'} text-xs`}></span>
              <span>{copied ? 'Copied' : 'Copy Code'}</span>
            </button>

            <button
              onClick={onClose}
              className="p-1 rounded hover:bg-vscode-hover text-vscode-fg/70 hover:text-vscode-fg transition-colors"
            >
              <span className="codicon codicon-close"></span>
            </button>
          </div>
        </div>

        {/* Dialect Tabs Navigation */}
        <div className="flex border-b border-vscode-border bg-vscode-bg px-4 pt-1 gap-1 text-xs">
          <button
            onClick={() => setActiveDialect('prisma')}
            className={`flex items-center gap-1.5 px-3 py-1.5 border-b-2 font-medium transition-colors ${
              activeDialect === 'prisma'
                ? 'border-vscode-focusBorder text-vscode-fg'
                : 'border-transparent text-vscode-fg/60 hover:text-vscode-fg'
            }`}
          >
            <span className="codicon codicon-database text-vscode-info text-xs"></span>
            <span>Prisma</span>
          </button>

          <button
            onClick={() => setActiveDialect('drizzle')}
            className={`flex items-center gap-1.5 px-3 py-1.5 border-b-2 font-medium transition-colors ${
              activeDialect === 'drizzle'
                ? 'border-vscode-focusBorder text-vscode-fg'
                : 'border-transparent text-vscode-fg/60 hover:text-vscode-fg'
            }`}
          >
            <span className="codicon codicon-zap text-amber-400 text-xs"></span>
            <span>Drizzle ORM</span>
          </button>

          <button
            onClick={() => setActiveDialect('zod')}
            className={`flex items-center gap-1.5 px-3 py-1.5 border-b-2 font-medium transition-colors ${
              activeDialect === 'zod'
                ? 'border-vscode-focusBorder text-vscode-fg'
                : 'border-transparent text-vscode-fg/60 hover:text-vscode-fg'
            }`}
          >
            <span className="codicon codicon-symbol-class text-blue-400 text-xs"></span>
            <span>TypeScript + Zod</span>
          </button>

          <button
            onClick={() => setActiveDialect('python')}
            className={`flex items-center gap-1.5 px-3 py-1.5 border-b-2 font-medium transition-colors ${
              activeDialect === 'python'
                ? 'border-vscode-focusBorder text-vscode-fg'
                : 'border-transparent text-vscode-fg/60 hover:text-vscode-fg'
            }`}
          >
            <span className="codicon codicon-terminal text-emerald-400 text-xs"></span>
            <span>Python (SQLAlchemy)</span>
          </button>

          <button
            onClick={() => setActiveDialect('golang')}
            className={`flex items-center gap-1.5 px-3 py-1.5 border-b-2 font-medium transition-colors ${
              activeDialect === 'golang'
                ? 'border-vscode-focusBorder text-vscode-fg'
                : 'border-transparent text-vscode-fg/60 hover:text-vscode-fg'
            }`}
          >
            <span className="codicon codicon-code text-cyan-400 text-xs"></span>
            <span>Go Struct</span>
          </button>
        </div>

        {/* Code Content Area */}
        <div className="flex-1 p-4 overflow-auto bg-vscode-inputBg">
          <pre className="font-mono-code text-xs leading-relaxed select-text whitespace-pre text-vscode-fg/90">
            {generatedCode}
          </pre>
        </div>
      </div>
    </div>
  );
};
