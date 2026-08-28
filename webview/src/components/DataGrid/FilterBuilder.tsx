import React from 'react';
import { ColumnInfo, FilterRule, FilterOperator } from '../../../../src/common/messages';

interface FilterBuilderProps {
  isOpen: boolean;
  onClose: () => void;
  columns: ColumnInfo[];
  rules: FilterRule[];
  conjunction: 'AND' | 'OR';
  onChangeRules: (rules: FilterRule[]) => void;
  onChangeConjunction: (conjunction: 'AND' | 'OR') => void;
  onApply: () => void;
  onClear: () => void;
}

const OPERATORS: { label: string; value: FilterOperator }[] = [
  { label: 'equals (=)', value: '=' },
  { label: 'not equals (!=)', value: '!=' },
  { label: 'contains', value: 'contains' },
  { label: 'starts with', value: 'starts_with' },
  { label: 'ends with', value: 'ends_with' },
  { label: 'greater than (>)', value: '>' },
  { label: 'greater or equal (>=)', value: '>=' },
  { label: 'less than (<)', value: '<' },
  { label: 'less or equal (<=)', value: '<=' },
  { label: 'is null', value: 'is_null' },
  { label: 'is not null', value: 'is_not_null' },
  { label: 'in list (comma-separated)', value: 'in' },
];

export const FilterBuilder: React.FC<FilterBuilderProps> = ({
  isOpen,
  onClose,
  columns,
  rules,
  conjunction,
  onChangeRules,
  onChangeConjunction,
  onApply,
  onClear,
}) => {
  if (!isOpen) {return null;}

  const handleAddRule = () => {
    const firstCol = columns[0]?.name || 'id';
    const newRule: FilterRule = {
      id: Math.random().toString(36).substring(2, 9),
      column: firstCol,
      operator: 'contains',
      value: '',
    };
    onChangeRules([...rules, newRule]);
  };

  const handleUpdateRule = (id: string, updates: Partial<FilterRule>) => {
    onChangeRules(
      rules.map((r) => (r.id === id ? { ...r, ...updates } : r))
    );
  };

  const handleRemoveRule = (id: string) => {
    onChangeRules(rules.filter((r) => r.id !== id));
  };

  return (
    <div className="border-b border-vscode-border bg-vscode-header p-3 text-xs flex flex-col gap-2.5 select-none animate-in fade-in slide-in-from-top-2 duration-150">
      {/* Top Controls Bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="codicon codicon-filter text-vscode-info text-xs"></span>
          <span className="font-semibold text-vscode-fg">Filter Rules:</span>
          <span className="text-vscode-fg/70">Match</span>
          <select
            value={conjunction}
            onChange={(e) => onChangeConjunction(e.target.value as 'AND' | 'OR')}
            className="bg-vscode-inputBg text-vscode-inputFg border border-vscode-inputBorder rounded px-2 py-0.5 font-medium outline-none text-xs"
          >
            <option value="AND">ALL conditions (AND)</option>
            <option value="OR">ANY condition (OR)</option>
          </select>
          <span className="text-vscode-fg/70">of the following</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleAddRule}
            className="flex items-center gap-1 px-2 py-0.5 rounded bg-vscode-secondaryBtn text-vscode-secondaryBtnFg hover:bg-vscode-secondaryBtnHover transition-colors"
          >
            <span className="codicon codicon-plus text-xs"></span>
            <span>Add Condition</span>
          </button>

          {rules.length > 0 && (
            <button
              onClick={onClear}
              className="px-2 py-0.5 rounded hover:bg-vscode-hover text-vscode-fg/70 hover:text-vscode-fg transition-colors"
            >
              Clear All
            </button>
          )}

          <button
            onClick={onApply}
            className="flex items-center gap-1 px-2.5 py-0.5 rounded bg-vscode-button text-vscode-buttonFg hover:bg-vscode-buttonHover font-medium transition-colors shadow-sm"
          >
            <span className="codicon codicon-check text-xs"></span>
            <span>Apply</span>
          </button>

          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-vscode-hover text-vscode-fg/70 hover:text-vscode-fg"
            title="Close filter builder"
          >
            <span className="codicon codicon-close text-xs"></span>
          </button>
        </div>
      </div>

      {/* Rules List */}
      <div className="space-y-2">
        {rules.length === 0 ? (
          <div className="p-3 border border-dashed border-vscode-border rounded text-center text-vscode-fg/50 text-xs">
            No active filter conditions. Click "Add Condition" to filter by column values.
          </div>
        ) : (
          rules.map((rule) => {
            const isNullOp = rule.operator === 'is_null' || rule.operator === 'is_not_null';

            return (
              <div
                key={rule.id}
                className="flex items-center gap-2 p-1.5 rounded bg-vscode-bg border border-vscode-border group"
              >
                {/* Column Dropdown */}
                <select
                  value={rule.column}
                  onChange={(e) => handleUpdateRule(rule.id, { column: e.target.value })}
                  className="bg-vscode-inputBg text-vscode-inputFg border border-vscode-inputBorder rounded px-2 py-1 outline-none text-xs min-w-[140px] font-mono-code"
                >
                  {columns.map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.name} ({c.type})
                    </option>
                  ))}
                </select>

                {/* Operator Dropdown */}
                <select
                  value={rule.operator}
                  onChange={(e) =>
                    handleUpdateRule(rule.id, { operator: e.target.value as FilterOperator })
                  }
                  className="bg-vscode-inputBg text-vscode-inputFg border border-vscode-inputBorder rounded px-2 py-1 outline-none text-xs min-w-[130px]"
                >
                  {OPERATORS.map((op) => (
                    <option key={op.value} value={op.value}>
                      {op.label}
                    </option>
                  ))}
                </select>

                {/* Value Input */}
                {!isNullOp ? (
                  <input
                    type="text"
                    value={rule.value || ''}
                    placeholder={
                      rule.operator === 'in' ? 'value1, value2, value3...' : 'Enter filter value...'
                    }
                    onChange={(e) => handleUpdateRule(rule.id, { value: e.target.value })}
                    onKeyDown={(e) => e.key === 'Enter' && onApply()}
                    className="flex-1 bg-vscode-inputBg text-vscode-inputFg border border-vscode-inputBorder rounded px-2 py-1 outline-none text-xs font-mono-code"
                  />
                ) : (
                  <div className="flex-1 text-vscode-fg/40 italic px-2 py-1 text-xs">
                    (No value required)
                  </div>
                )}

                {/* Remove Button */}
                <button
                  onClick={() => handleRemoveRule(rule.id)}
                  className="p-1 rounded text-vscode-fg/50 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                  title="Remove condition"
                >
                  <span className="codicon codicon-trash text-xs"></span>
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
