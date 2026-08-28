import React, { useState } from 'react';

export interface CellSelection {
  rowIndex: number;
  columnName: string;
  value: any;
}

interface AggregateFooterProps {
  selectedCells: CellSelection[];
  totalRows: number;
}

export const AggregateFooter: React.FC<AggregateFooterProps> = ({
  selectedCells,
}) => {
  const [copiedLabel, setCopiedLabel] = useState<string | null>(null);

  // Single-pass computation for optimal performance and zero stack overflow risk
  let sum = 0;
  let min = Infinity;
  let max = -Infinity;
  let numCount = 0;

  for (let i = 0; i < selectedCells.length; i++) {
    const val = selectedCells[i].value;
    let num: number | null = null;
    if (typeof val === 'number' && !isNaN(val)) {
      num = val;
    } else if (typeof val === 'string' && val.trim() !== '') {
      const parsed = Number(val);
      if (!isNaN(parsed)) {
        num = parsed;
      }
    }
    if (num !== null) {
      sum += num;
      if (num < min) min = num;
      if (num > max) max = num;
      numCount++;
    }
  }

  const count = selectedCells.length;
  if (count === 0) {return null;}

  const hasNumbers = numCount > 0;
  const avg = hasNumbers ? sum / numCount : 0;
  const finalMin = hasNumbers ? min : 0;
  const finalMax = hasNumbers ? max : 0;

  const formatNumber = (num: number): string => {
    return num.toLocaleString(undefined, {
      minimumFractionDigits: num % 1 === 0 ? 0 : 2,
      maximumFractionDigits: 2,
    });
  };

  const copyToClipboard = (label: string, val: string | number) => {
    navigator.clipboard.writeText(String(val));
    setCopiedLabel(label);
    setTimeout(() => setCopiedLabel(null), 1200);
  };

  return (
    <div className="flex items-center gap-2 text-xs select-none">
      <div className="h-4 w-px bg-vscode-border mx-1" />

      {/* Count pill */}
      <button
        onClick={() => copyToClipboard('COUNT', count)}
        className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-vscode-badge text-vscode-badgeFg hover:bg-vscode-hover font-mono-code transition-colors"
        title="Click to copy count"
      >
        <span className="opacity-60 text-[10px]">COUNT:</span>
        <span className="font-semibold">{copiedLabel === 'COUNT' ? 'Copied!' : count}</span>
      </button>

      {/* Numeric Aggregates */}
      {hasNumbers && (
        <>
          {/* SUM */}
          <button
            onClick={() => copyToClipboard('SUM', sum)}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/25 font-mono-code transition-colors"
            title="Click to copy sum"
          >
            <span className="opacity-75 text-[10px]">SUM:</span>
            <span className="font-semibold">
              {copiedLabel === 'SUM' ? 'Copied!' : formatNumber(sum)}
            </span>
          </button>

          {/* AVERAGE */}
          <button
            onClick={() => copyToClipboard('AVG', avg.toFixed(2))}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-300 border border-sky-500/30 hover:bg-sky-500/25 font-mono-code transition-colors"
            title="Click to copy average"
          >
            <span className="opacity-75 text-[10px]">AVG:</span>
            <span className="font-semibold">
              {copiedLabel === 'AVG' ? 'Copied!' : formatNumber(avg)}
            </span>
          </button>

          {/* MIN */}
          <button
            onClick={() => copyToClipboard('MIN', finalMin)}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-vscode-badge text-vscode-badgeFg hover:bg-vscode-hover font-mono-code transition-colors"
            title="Click to copy min"
          >
            <span className="opacity-60 text-[10px]">MIN:</span>
            <span>{copiedLabel === 'MIN' ? 'Copied!' : formatNumber(finalMin)}</span>
          </button>

          {/* MAX */}
          <button
            onClick={() => copyToClipboard('MAX', finalMax)}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-vscode-badge text-vscode-badgeFg hover:bg-vscode-hover font-mono-code transition-colors"
            title="Click to copy max"
          >
            <span className="opacity-60 text-[10px]">MAX:</span>
            <span>{copiedLabel === 'MAX' ? 'Copied!' : formatNumber(finalMax)}</span>
          </button>
        </>
      )}
    </div>
  );
};
