import React, { useState, useEffect } from 'react';

export interface MediaModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  mediaType: 'image' | 'video';
  url: string;
}

export const MediaModal: React.FC<MediaModalProps> = ({
  isOpen,
  onClose,
  title,
  mediaType,
  url,
}) => {
  const [copied, setCopied] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [hasError, setHasError] = useState(false);
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);

  // Reset state when opening a new media or URL
  useEffect(() => {
    if (isOpen) {
      setZoom(1);
      setHasError(false);
      setDimensions(null);
      setCopied(false);
    }
  }, [isOpen, url]);

  // Handle ESC key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleOpenExternal = () => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleZoomIn = () => {
    setZoom((prev) => Math.min(prev + 0.25, 4));
  };

  const handleZoomOut = () => {
    setZoom((prev) => Math.max(prev - 0.25, 0.25));
  };

  const handleResetZoom = () => {
    setZoom(1);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 select-none"
      onClick={onClose}
    >
      <div
        className="bg-vscode-bg border border-vscode-border rounded shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-vscode-header border-b border-vscode-border flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className={`codicon ${
                mediaType === 'video'
                  ? 'codicon-play text-rose-400'
                  : 'codicon-file-media text-blue-400'
              } text-base flex-shrink-0`}
            ></span>
            <span className="font-semibold text-sm truncate">{title}</span>
            <span
              className={`text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded border ${
                mediaType === 'video'
                  ? 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                  : 'bg-blue-500/20 text-blue-300 border-blue-500/30'
              }`}
            >
              {mediaType}
            </span>
            {dimensions && (
              <span className="text-[11px] text-vscode-fg/60 font-mono-code hidden sm:inline">
                {dimensions.width} &times; {dimensions.height}px
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 flex-shrink-0">
            {mediaType === 'image' && !hasError && (
              <div className="flex items-center border border-vscode-border rounded mr-1 bg-vscode-inputBg">
                <button
                  type="button"
                  onClick={handleZoomOut}
                  disabled={zoom <= 0.25}
                  className="p-1 hover:bg-vscode-hover text-vscode-fg disabled:opacity-30 transition-colors"
                  title="Zoom Out"
                >
                  <span className="codicon codicon-zoom-out text-xs"></span>
                </button>
                <button
                  type="button"
                  onClick={handleResetZoom}
                  className="px-1.5 text-[11px] font-mono-code hover:bg-vscode-hover text-vscode-fg transition-colors"
                  title="Reset Zoom"
                >
                  {Math.round(zoom * 100)}%
                </button>
                <button
                  type="button"
                  onClick={handleZoomIn}
                  disabled={zoom >= 4}
                  className="p-1 hover:bg-vscode-hover text-vscode-fg disabled:opacity-30 transition-colors"
                  title="Zoom In"
                >
                  <span className="codicon codicon-zoom-in text-xs"></span>
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={handleCopy}
              className="flex items-center gap-1 text-xs px-2.5 py-1 rounded bg-vscode-secondaryBtn text-vscode-secondaryBtnFg hover:bg-vscode-secondaryBtnHover transition-colors"
              title="Copy URL to clipboard"
            >
              <span
                className={`codicon ${copied ? 'codicon-check text-green-400' : 'codicon-copy'}`}
              ></span>
              <span className="hidden sm:inline">{copied ? 'Copied' : 'Copy'}</span>
            </button>

            <button
              type="button"
              onClick={handleOpenExternal}
              className="flex items-center gap-1 text-xs px-2.5 py-1 rounded bg-vscode-secondaryBtn text-vscode-secondaryBtnFg hover:bg-vscode-secondaryBtnHover transition-colors"
              title="Open link in browser"
            >
              <span className="codicon codicon-link-external"></span>
              <span className="hidden sm:inline">Open</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded hover:bg-vscode-hover text-vscode-fg transition-colors"
              title="Close Preview (Esc)"
            >
              <span className="codicon codicon-close text-base"></span>
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 p-4 overflow-auto bg-vscode-inputBg flex items-center justify-center min-h-[300px] relative">
          {hasError ? (
            <div className="flex flex-col items-center justify-center text-center p-6 max-w-md">
              <span className="codicon codicon-warning text-3xl text-amber-400 mb-2"></span>
              <p className="font-medium text-sm text-vscode-fg mb-1">
                Unable to display {mediaType} preview
              </p>
              <p className="text-xs text-vscode-fg/60 mb-3 break-all font-mono-code">
                The link might be broken, inaccessible, or restricted by CORS/network policy.
              </p>
              <button
                type="button"
                onClick={handleOpenExternal}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded bg-vscode-button text-vscode-buttonFg hover:bg-vscode-buttonHover transition-colors"
              >
                <span className="codicon codicon-link-external"></span>
                <span>Open in External Browser</span>
              </button>
            </div>
          ) : mediaType === 'image' ? (
            <div
              className="relative max-w-full max-h-[70vh] overflow-auto flex items-center justify-center p-2 rounded"
              style={{
                backgroundImage:
                  'radial-gradient(rgba(128, 128, 128, 0.2) 1px, transparent 0)',
                backgroundSize: '16px 16px',
              }}
            >
              <img
                src={url}
                alt="Preview"
                style={{
                  transform: `scale(${zoom})`,
                  transformOrigin: 'center center',
                  transition: 'transform 0.15s ease-out',
                }}
                className="max-w-full max-h-[65vh] object-contain rounded shadow-md select-none pointer-events-auto"
                onLoad={(e) => {
                  const img = e.currentTarget;
                  setDimensions({ width: img.naturalWidth, height: img.naturalHeight });
                }}
                onError={() => setHasError(true)}
              />
            </div>
          ) : (
            <div className="w-full flex items-center justify-center">
              <video
                src={url}
                controls
                autoPlay
                className="max-w-full max-h-[70vh] rounded shadow-lg bg-black"
                onError={() => setHasError(true)}
              >
                Your environment does not support video playback.
              </video>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-4 py-2 bg-vscode-header border-t border-vscode-border flex items-center justify-between text-xs text-vscode-fg/70 gap-2">
          <div className="flex items-center gap-1.5 truncate font-mono-code min-w-0">
            <span className="codicon codicon-link text-xs flex-shrink-0 text-vscode-fg/50"></span>
            <span className="truncate select-text">{url}</span>
          </div>
          <span className="text-[11px] text-vscode-fg/40 flex-shrink-0 hidden sm:inline">
            Press <kbd className="px-1 py-0.5 rounded bg-vscode-bg border border-vscode-border">Esc</kbd> to close
          </span>
        </div>
      </div>
    </div>
  );
};
