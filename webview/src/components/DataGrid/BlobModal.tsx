import React, { useState } from 'react';
import { insertTimestamp } from '../../utils/timestamp';

interface BlobModalProps {
  isOpen: boolean;
  onClose: () => void;
  columnName: string;
  blobData: { size: number; base64: string };
}

export const BlobModal: React.FC<BlobModalProps> = ({
  isOpen,
  onClose,
  columnName,
  blobData,
}) => {
  const [activeTab, setActiveTab] = useState<'preview' | 'hex'>('preview');

  if (!isOpen || !blobData) {return null;}

  // Detect image format from base64 signature
  const isImage = (b64: string): boolean => {
    if (b64.startsWith('iVBORw0KGgo')) {return true;} // PNG
    if (b64.startsWith('/9j/')) {return true;} // JPEG
    if (b64.startsWith('R0lGOD')) {return true;} // GIF
    if (b64.startsWith('UklGR')) {return true;} // WEBP
    return false;
  };

  const hasImage = isImage(blobData.base64);

  // Generate hex dump (first 1024 bytes)
  const renderHexDump = () => {
    try {
      const binaryString = atob(blobData.base64.slice(0, 4096));
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const rows: string[] = [];
      for (let i = 0; i < Math.min(bytes.length, 512); i += 16) {
        const slice = bytes.slice(i, i + 16);
        const offset = i.toString(16).padStart(8, '0');
        const hex = Array.from(slice)
          .map((b) => b.toString(16).padStart(2, '0'))
          .join(' ')
          .padEnd(48, ' ');
        const ascii = Array.from(slice)
          .map((b) => (b >= 32 && b <= 126 ? String.fromCharCode(b) : '.'))
          .join('');
        rows.push(`${offset}  ${hex}  |${ascii}|`);
      }
      return rows.join('\n');
    } catch {
      return 'Unable to generate hex dump.';
    }
  };

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = `data:application/octet-stream;base64,${blobData.base64}`;
    const baseName = `${columnName || 'blob'}.bin`;
    link.download = insertTimestamp(baseName);
    link.click();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-vscode-bg border border-vscode-border rounded shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-vscode-header border-b border-vscode-border">
          <div className="flex items-center gap-2">
            <span className="codicon codicon-file-binary text-purple-400"></span>
            <span className="font-semibold text-sm">
              BLOB Inspector: <span className="text-vscode-info">{columnName}</span>
            </span>
            <span className="text-xs px-2 py-0.5 rounded bg-vscode-badge text-vscode-badgeFg">
              {blobData.size.toLocaleString()} bytes
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownload}
              className="flex items-center gap-1 text-xs px-2.5 py-1 rounded bg-vscode-secondaryBtn text-vscode-secondaryBtnFg hover:bg-vscode-secondaryBtnHover transition-colors"
            >
              <span className="codicon codicon-cloud-download"></span>
              <span>Download</span>
            </button>
            <button
              onClick={onClose}
              className="p-1 rounded hover:bg-vscode-hover text-vscode-fg transition-colors"
            >
              <span className="codicon codicon-close"></span>
            </button>
          </div>
        </div>

        {/* Tab navigation */}
        <div className="flex border-b border-vscode-border bg-vscode-bg px-4 pt-1 gap-2">
          {hasImage && (
            <button
              onClick={() => setActiveTab('preview')}
              className={`text-xs px-3 py-1.5 border-b-2 font-medium transition-colors ${
                activeTab === 'preview'
                  ? 'border-vscode-focusBorder text-vscode-fg'
                  : 'border-transparent text-vscode-fg/60 hover:text-vscode-fg'
              }`}
            >
              Image Preview
            </button>
          )}
          <button
            onClick={() => setActiveTab('hex')}
            className={`text-xs px-3 py-1.5 border-b-2 font-medium transition-colors ${
              activeTab === 'hex' || !hasImage
                ? 'border-vscode-focusBorder text-vscode-fg'
                : 'border-transparent text-vscode-fg/60 hover:text-vscode-fg'
            }`}
          >
            Hex Dump
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 p-4 overflow-auto bg-vscode-inputBg flex items-center justify-center">
          {hasImage && activeTab === 'preview' ? (
            <div className="max-w-full max-h-full p-2 border border-vscode-border rounded bg-vscode-bg shadow-sm">
              <img
                src={`data:image/png;base64,${blobData.base64}`}
                alt="BLOB Preview"
                className="max-w-full max-h-[60vh] object-contain rounded"
              />
            </div>
          ) : (
            <pre className="font-mono-code text-xs leading-relaxed select-text whitespace-pre overflow-x-auto w-full">
              {renderHexDump()}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
};
