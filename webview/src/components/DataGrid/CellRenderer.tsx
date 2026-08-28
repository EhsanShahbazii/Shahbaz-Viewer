import React, { useState, useEffect, useRef } from 'react';
import { ColumnInfo, ForeignKeyInfo } from '../../../src/common/messages';

interface CellRendererProps {
  value: any;
  column: ColumnInfo;
  foreignKey?: ForeignKeyInfo;
  isDirty?: boolean;
  isSelected?: boolean;
  onSelectCell?: (multi: boolean) => void;
  onEditCell?: (newValue: any) => void;
  onOpenJson?: (data: any) => void;
  onOpenBlob?: (blob: { size: number; base64: string }) => void;
  onNavigateForeignKey?: (targetTable: string, targetColumn: string, value: any) => void;
}

export const CellRenderer: React.FC<CellRendererProps> = ({
  value,
  column,
  foreignKey,
  isDirty = false,
  isSelected = false,
  onSelectCell,
  onEditCell,
  onOpenJson,
  onOpenBlob,
  onNavigateForeignKey,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleStartEdit = () => {
    if (value && typeof value === 'object' && value.__isBlob) {
      return; // cannot inline-edit blob
    }
    setEditValue(value === null || value === undefined ? '' : String(value));
    setIsEditing(true);
  };

  const handleSave = () => {
    setIsEditing(false);
    // Type coercion
    let finalVal: any = editValue;
    if (editValue.trim() === '' && !column.notnull) {
      finalVal = null;
    } else if (column.type.includes('INT') || column.type.includes('REAL') || column.type.includes('FLOA')) {
      const num = Number(editValue);
      finalVal = isNaN(num) ? editValue : num;
    }

    // Do NOT trigger edit if value was unchanged
    if (finalVal === value || String(finalVal ?? '') === String(value ?? '')) {
      return;
    }

    if (onEditCell) {
      onEditCell(finalVal);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      setIsEditing(false);
    }
  };

  if (isEditing) {
    return (
      <div className="w-full h-full flex items-center p-0.5">
        <input
          ref={inputRef}
          type="text"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
          className="w-full h-full px-1.5 py-0.5 text-xs bg-vscode-inputBg text-vscode-inputFg border border-vscode-focusBorder rounded font-mono-code outline-none"
        />
      </div>
    );
  }

  // Dirty cell badge styling
  const dirtyIndicator = isDirty ? (
    <span
      className="absolute top-0 right-0 w-2 h-2 bg-amber-400"
      style={{ clipPath: 'polygon(100% 0, 0 0, 100% 100%)' }}
      title="Unsaved edit"
    />
  ) : null;

  // 1. NULL / Undefined
  if (value === null || value === undefined) {
    return (
      <div
        onClick={(e) => onSelectCell && onSelectCell(e.shiftKey || e.metaKey || e.ctrlKey)}
        onDoubleClick={handleStartEdit}
        className={`relative w-full h-full flex items-center px-2 text-vscode-fg/35 italic font-mono-code text-xs cursor-text ${isDirty ? 'bg-amber-500/10' : ''}`}
      >
        <span>NULL</span>
        {dirtyIndicator}
      </div>
    );
  }

  // 2. Binary BLOB
  if (typeof value === 'object' && value.__isBlob) {
    return (
      <div
        onClick={(e) => onSelectCell && onSelectCell(e.shiftKey || e.metaKey || e.ctrlKey)}
        className={`relative w-full h-full flex items-center px-2`}
      >
        <button
          onClick={() => onOpenBlob && onOpenBlob(value)}
          className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 hover:bg-purple-500/30 transition-colors"
        >
          <span className="codicon codicon-file-binary text-xs"></span>
          <span>BLOB ({value.size}B)</span>
        </button>
      </div>
    );
  }

  const strVal = String(value);

  // 3. JSON Detection
  const isJsonCandidate =
    (strVal.startsWith('{') && strVal.endsWith('}')) ||
    (strVal.startsWith('[') && strVal.endsWith(']'));

  let isValidJson = false;
  if (isJsonCandidate && strVal.length > 3) {
    try {
      JSON.parse(strVal);
      isValidJson = true;
    } catch {
      isValidJson = false;
    }
  }

  if (isValidJson) {
    return (
      <div
        onClick={(e) => onSelectCell && onSelectCell(e.shiftKey || e.metaKey || e.ctrlKey)}
        onDoubleClick={handleStartEdit}
        className={`relative w-full h-full flex items-center justify-between px-2 gap-2 cursor-text ${isDirty ? 'bg-amber-500/10' : ''}`}
      >
        <span className="truncate font-mono-code text-xs">{strVal}</span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onOpenJson && onOpenJson(strVal);
          }}
          className="flex-shrink-0 flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/30"
          title="Inspect JSON"
        >
          <span className="codicon codicon-json text-[11px]"></span>
          <span>JSON</span>
        </button>
        {dirtyIndicator}
      </div>
    );
  }

  // 4. Foreign Key Link
  if (foreignKey) {
    return (
      <div
        onClick={(e) => onSelectCell && onSelectCell(e.shiftKey || e.metaKey || e.ctrlKey)}
        onDoubleClick={handleStartEdit}
        className={`relative w-full h-full flex items-center justify-between px-2 gap-2 cursor-text ${isDirty ? 'bg-amber-500/10' : ''}`}
      >
        <span className="font-mono-code text-xs truncate">{strVal}</span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (onNavigateForeignKey) {
              onNavigateForeignKey(foreignKey.table, foreignKey.to, value);
            }
          }}
          className="flex-shrink-0 flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-500/30 hover:bg-sky-500/30 transition-colors"
          title={`Jump to ${foreignKey.table}.${foreignKey.to} = ${strVal}`}
        >
          <span className="codicon codicon-link-external text-[11px]"></span>
          <span>{foreignKey.table}</span>
        </button>
        {dirtyIndicator}
      </div>
    );
  }

  // 5. Numeric & Text formatting
  const isNumeric =
    column.type.includes('INT') ||
    column.type.includes('REAL') ||
    column.type.includes('FLOA') ||
    column.type.includes('NUM');

  return (
    <div
      onClick={(e) => onSelectCell && onSelectCell(e.shiftKey || e.metaKey || e.ctrlKey)}
      onDoubleClick={handleStartEdit}
      className={`relative w-full h-full flex items-center px-2 font-mono-code text-xs truncate cursor-text ${
        isNumeric ? 'justify-end' : 'justify-start'
      } ${isDirty ? 'bg-amber-500/10 font-semibold' : ''}`}
      title={strVal}
    >
      <span className="truncate">{strVal}</span>
      {dirtyIndicator}
    </div>
  );
};
