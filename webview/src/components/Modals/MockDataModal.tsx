import React, { useState } from 'react';

interface MockDataModalProps {
  isOpen: boolean;
  onClose: () => void;
  tableName: string;
  onGenerate: (count: number, insertDirectly: boolean) => void;
  isLoading?: boolean;
}

export const MockDataModal: React.FC<MockDataModalProps> = ({
  isOpen,
  onClose,
  tableName,
  onGenerate,
  isLoading = false,
}) => {
  const [count, setCount] = useState<number>(25);
  const [insertDirectly, setInsertDirectly] = useState<boolean>(true);

  if (!isOpen) {return null;}

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onGenerate(count, insertDirectly);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 select-none">
      <div className="bg-vscode-bg border border-vscode-border rounded shadow-2xl w-full max-w-md flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-vscode-header border-b border-vscode-border">
          <div className="flex items-center gap-2">
            <span className="codicon codicon-sparkle text-amber-400 text-base"></span>
            <span className="font-semibold text-sm">Generate Mock Data</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-vscode-hover text-vscode-fg/70 hover:text-vscode-fg transition-colors"
          >
            <span className="codicon codicon-close"></span>
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4 text-xs">
          <div>
            <label className="block text-vscode-fg/70 mb-1">Target Table</label>
            <div className="flex items-center gap-2 p-2 bg-vscode-inputBg border border-vscode-border rounded font-mono-code text-vscode-info font-semibold">
              <span className="codicon codicon-table"></span>
              <span>{tableName}</span>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-vscode-fg/70 font-medium">Number of Rows</label>
              <span className="text-[10px] text-vscode-fg/50 font-mono">Max: 1,048,576 (2²⁰)</span>
            </div>

            <div className="grid grid-cols-4 gap-2">
              {[10, 50, 250, 1000].map((num) => (
                <button
                  type="button"
                  key={num}
                  onClick={() => setCount(num)}
                  className={`py-1.5 px-3 rounded border text-center font-medium transition-colors ${
                    count === num
                      ? 'border-vscode-focusBorder bg-vscode-button text-vscode-buttonFg'
                      : 'border-vscode-border bg-vscode-inputBg text-vscode-fg hover:bg-vscode-hover'
                  }`}
                >
                  {num.toLocaleString()}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 pt-1">
              <span className="text-vscode-fg/60 text-[11px] whitespace-nowrap">Custom count:</span>
              <div className="relative flex-1">
                <input
                  type="number"
                  min="1"
                  max="1048576"
                  value={count}
                  onChange={(e) => {
                    const raw = parseInt(e.target.value, 10);
                    if (isNaN(raw)) {
                      setCount(1);
                    } else {
                      setCount(Math.min(1048576, Math.max(1, raw)));
                    }
                  }}
                  className="w-full bg-vscode-inputBg text-vscode-inputFg border border-vscode-inputBorder rounded px-3 py-1.5 text-xs font-mono outline-none focus:border-vscode-focusBorder"
                  placeholder="Enter count up to 1,048,576..."
                />
              </div>
            </div>
          </div>

          {/* Action Destination Option */}
          <div className="space-y-2 pt-1 border-t border-vscode-border">
            <label className="block text-vscode-fg/70">Action</label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="insertMode"
                checked={insertDirectly}
                onChange={() => setInsertDirectly(true)}
                className="accent-vscode-button"
              />
              <span className="text-vscode-fg">
                Insert directly into database and commit
              </span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="insertMode"
                checked={!insertDirectly}
                onChange={() => setInsertDirectly(false)}
                className="accent-vscode-button"
              />
              <span className="text-vscode-fg">
                Preview generated records before inserting
              </span>
            </label>
          </div>

          <div className="p-2.5 bg-vscode-inputBg/60 rounded border border-vscode-border/60 text-[11px] text-vscode-fg/60 space-y-1">
            <p className="flex items-center gap-1.5 text-vscode-info font-medium">
              <span className="codicon codicon-shield text-xs"></span>
              <span>Foreign Key Safe</span>
            </p>
            <p>
              Values for foreign key columns will be automatically sampled from parent records to maintain referential integrity.
            </p>
          </div>

          {/* Modal Footer */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-vscode-border">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded bg-vscode-secondaryBtn text-vscode-secondaryBtnFg hover:bg-vscode-secondaryBtnHover transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-vscode-button text-vscode-buttonFg hover:bg-vscode-buttonHover disabled:opacity-50 font-medium transition-colors shadow-sm"
            >
              {isLoading ? (
                <>
                  <span className="codicon codicon-loading codicon-modifier-spin"></span>
                  <span>Generating...</span>
                </>
              ) : (
                <>
                  <span className="codicon codicon-sparkle"></span>
                  <span>Generate {count.toLocaleString()} Rows</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
