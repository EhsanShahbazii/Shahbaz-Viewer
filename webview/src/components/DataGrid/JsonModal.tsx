import React, { useState } from 'react';

interface JsonModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  data: any;
}

export const JsonModal: React.FC<JsonModalProps> = ({ isOpen, onClose, title, data }) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen) {return null;}

  let formatted = '';
  try {
    const parsed = typeof data === 'string' ? JSON.parse(data) : data;
    formatted = JSON.stringify(parsed, null, 2);
  } catch {
    formatted = String(data);
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(formatted);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-vscode-bg border border-vscode-border rounded shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-vscode-header border-b border-vscode-border">
          <div className="flex items-center gap-2">
            <span className="codicon codicon-json text-amber-400"></span>
            <span className="font-semibold text-sm">{title}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1 text-xs px-2.5 py-1 rounded bg-vscode-secondaryBtn text-vscode-secondaryBtnFg hover:bg-vscode-secondaryBtnHover transition-colors"
            >
              <span className={`codicon ${copied ? 'codicon-check text-green-400' : 'codicon-copy'}`}></span>
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>
            <button
              onClick={onClose}
              className="p-1 rounded hover:bg-vscode-hover text-vscode-fg transition-colors"
            >
              <span className="codicon codicon-close"></span>
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 p-4 overflow-auto bg-vscode-inputBg">
          <pre className="font-mono-code text-xs leading-relaxed select-text whitespace-pre-wrap">
            {formatted}
          </pre>
        </div>
      </div>
    </div>
  );
};
