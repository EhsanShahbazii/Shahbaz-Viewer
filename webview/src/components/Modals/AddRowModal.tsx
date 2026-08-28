import React, { useState, useEffect } from 'react';
import { ColumnInfo } from '../../../src/common/messages';

interface AddRowModalProps {
  isOpen: boolean;
  onClose: () => void;
  tableName: string;
  columns: ColumnInfo[];
  onAdd: (rowValues: Record<string, any>) => void;
}

export const AddRowModal: React.FC<AddRowModalProps> = ({
  isOpen,
  onClose,
  tableName,
  columns,
  onAdd,
}) => {
  const [formValues, setFormValues] = useState<Record<string, any>>({});
  const [nullFlags, setNullFlags] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (isOpen) {
      const initial: Record<string, any> = {};
      const nulls: Record<string, boolean> = {};

      columns.forEach((col) => {
        if (col.dflt_value !== null && col.dflt_value !== undefined) {
          initial[col.name] = col.dflt_value;
          nulls[col.name] = false;
        } else if (col.pk > 0 && col.type.toUpperCase().includes('INT')) {
          // Auto-increment PK: leave empty / null by default
          initial[col.name] = '';
          nulls[col.name] = true;
        } else if (col.notnull) {
          const typeUpper = col.type.toUpperCase();
          if (typeUpper.includes('INT') || typeUpper.includes('REAL') || typeUpper.includes('NUM')) {
            initial[col.name] = 0;
          } else if (typeUpper.includes('BOOL')) {
            initial[col.name] = 1;
          } else {
            initial[col.name] = '';
          }
          nulls[col.name] = false;
        } else {
          initial[col.name] = '';
          nulls[col.name] = true;
        }
      });

      setFormValues(initial);
      setNullFlags(nulls);
    }
  }, [isOpen, columns]);

  if (!isOpen) return null;

  const handleInputChange = (colName: string, val: any) => {
    setFormValues((prev) => ({ ...prev, [colName]: val }));
    setNullFlags((prev) => ({ ...prev, [colName]: false }));
  };

  const handleToggleNull = (colName: string) => {
    setNullFlags((prev) => {
      const current = !!prev[colName];
      return { ...prev, [colName]: !current };
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const finalRow: Record<string, any> = {};

    columns.forEach((col) => {
      if (nullFlags[col.name]) {
        // If it's a primary key with integer type and left null, skip to allow AUTOINCREMENT
        if (col.pk > 0 && col.type.toUpperCase().includes('INT')) {
          finalRow[col.name] = null;
        } else {
          finalRow[col.name] = null;
        }
      } else {
        const raw = formValues[col.name];
        const typeUpper = col.type.toUpperCase();
        if (typeUpper.includes('INT')) {
          const parsed = parseInt(raw, 10);
          finalRow[col.name] = isNaN(parsed) ? (col.notnull ? 0 : null) : parsed;
        } else if (typeUpper.includes('REAL') || typeUpper.includes('FLOA') || typeUpper.includes('DOUB')) {
          const parsed = parseFloat(raw);
          finalRow[col.name] = isNaN(parsed) ? (col.notnull ? 0.0 : null) : parsed;
        } else if (typeUpper.includes('BOOL')) {
          finalRow[col.name] = raw ? 1 : 0;
        } else {
          finalRow[col.name] = raw;
        }
      }
    });

    onAdd(finalRow);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 select-none">
      <div className="bg-vscode-bg border border-vscode-border rounded-xl shadow-2xl w-full max-w-xl max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-vscode-header border-b border-vscode-border flex-shrink-0">
          <div className="flex items-center gap-2">
            <span className="codicon codicon-add text-vscode-info text-base"></span>
            <span className="font-semibold text-sm text-vscode-fg">Add New Row</span>
            <span className="text-xs px-2 py-0.5 rounded bg-vscode-badge text-vscode-badgeFg font-mono">
              {tableName}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-vscode-hover text-vscode-fg/70 hover:text-vscode-fg transition-colors"
          >
            <span className="codicon codicon-close text-xs"></span>
          </button>
        </div>

        {/* Column Fields Form */}
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-4 space-y-3.5 text-xs">
            <div className="text-vscode-fg/60 text-[11px] pb-1 border-b border-vscode-border/50">
              Enter values for the new record. Columns with <span className="text-amber-400 font-semibold">PK</span> will auto-generate if left NULL.
            </div>

            {columns.map((col) => {
              const isPk = col.pk > 0;
              const isNull = !!nullFlags[col.name];
              const value = formValues[col.name] ?? '';
              const typeUpper = col.type.toUpperCase();

              return (
                <div
                  key={col.name}
                  className={`p-2.5 rounded-lg border transition-colors ${
                    isNull
                      ? 'bg-vscode-inputBg/30 border-vscode-border/50'
                      : 'bg-vscode-inputBg/80 border-vscode-border'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-1.5 truncate">
                      {isPk && (
                        <span
                          className="codicon codicon-key text-amber-400 text-xs flex-shrink-0"
                          title="Primary Key"
                        ></span>
                      )}
                      <span className="font-semibold text-vscode-fg truncate">{col.name}</span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-vscode-badge text-vscode-badgeFg font-mono opacity-80">
                        {col.type || 'TEXT'}
                      </span>
                      {col.notnull && (
                        <span className="text-[9px] text-rose-400 font-medium">NOT NULL</span>
                      )}
                    </div>

                    {/* NULL Toggle Button */}
                    {!col.notnull && (
                      <button
                        type="button"
                        onClick={() => handleToggleNull(col.name)}
                        className={`text-[10px] px-2 py-0.5 rounded font-mono transition-colors ${
                          isNull
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 font-semibold'
                            : 'bg-vscode-secondaryBtn text-vscode-secondaryBtnFg hover:bg-vscode-secondaryBtnHover'
                        }`}
                        title={isNull ? 'Value is set to NULL' : 'Set value to NULL'}
                      >
                        {isNull ? 'NULL (Active)' : 'Set NULL'}
                      </button>
                    )}
                  </div>

                  {/* Input Element */}
                  {isNull ? (
                    <div className="italic text-vscode-fg/40 py-1 px-2 font-mono text-[11px] bg-vscode-bg/50 rounded border border-dashed border-vscode-border/50">
                      {isPk ? 'Auto-increment on insert' : 'NULL'}
                    </div>
                  ) : typeUpper.includes('BOOL') ? (
                    <div className="flex items-center gap-4 py-1">
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="radio"
                          name={`bool_${col.name}`}
                          checked={value === 1 || value === true}
                          onChange={() => handleInputChange(col.name, 1)}
                          className="accent-vscode-button"
                        />
                        <span>True (1)</span>
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="radio"
                          name={`bool_${col.name}`}
                          checked={value === 0 || value === false}
                          onChange={() => handleInputChange(col.name, 0)}
                          className="accent-vscode-button"
                        />
                        <span>False (0)</span>
                      </label>
                    </div>
                  ) : (
                    <input
                      type={
                        typeUpper.includes('INT') || typeUpper.includes('REAL') || typeUpper.includes('NUM')
                          ? 'number'
                          : 'text'
                      }
                      step={typeUpper.includes('REAL') || typeUpper.includes('FLOA') ? 'any' : undefined}
                      value={value}
                      placeholder={col.dflt_value !== null ? `Default: ${col.dflt_value}` : `Enter ${col.name}...`}
                      onChange={(e) => handleInputChange(col.name, e.target.value)}
                      className="w-full bg-vscode-inputBg text-vscode-inputFg border border-vscode-inputBorder rounded px-2.5 py-1.5 text-xs font-mono outline-none focus:border-vscode-focusBorder"
                    />
                  )}
                </div>
              );
            })}
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-vscode-border bg-vscode-header flex-shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 rounded bg-vscode-secondaryBtn text-vscode-secondaryBtnFg hover:bg-vscode-secondaryBtnHover text-xs font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex items-center gap-1.5 px-4 py-1.5 rounded bg-vscode-button text-vscode-buttonFg hover:bg-vscode-buttonHover text-xs font-semibold shadow-sm transition-colors"
            >
              <span className="codicon codicon-plus text-xs"></span>
              <span>Add Row</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
