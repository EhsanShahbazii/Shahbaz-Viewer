import React, { useState, useEffect, useRef } from 'react';
import { getVsCodeApi } from '../../hooks/useVsCode';

export interface MediaModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  mediaType: 'image' | 'video';
  url: string;
  onPrev?: () => void;
  onNext?: () => void;
  hasPrev?: boolean;
  hasNext?: boolean;
  itemIndex?: number;
  totalItems?: number;
}

export const MediaModal: React.FC<MediaModalProps> = ({
  isOpen,
  onClose,
  title,
  mediaType,
  url,
  onPrev,
  onNext,
  hasPrev = false,
  hasNext = false,
  itemIndex,
  totalItems,
}) => {
  const [copied, setCopied] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);

  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Reset zoom & pan when image/url changes or modal reopens
  useEffect(() => {
    if (isOpen) {
      setZoom(1);
      setPosition({ x: 0, y: 0 });
      setIsDragging(false);
      setHasError(false);
      setDimensions(null);
      setCopied(false);
    }
  }, [isOpen, url]);

  // Handle keyboard shortcuts (Esc, ArrowLeft, ArrowRight, F for fullscreen)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      if (e.key === 'Escape') {
        if (isFullscreen) {
          setIsFullscreen(false);
        } else {
          onClose();
        }
      } else if (e.key === 'ArrowLeft' && hasPrev && onPrev) {
        e.preventDefault();
        onPrev();
      } else if (e.key === 'ArrowRight' && hasNext && onNext) {
        e.preventDefault();
        onNext();
      } else if ((e.key === 'f' || e.key === 'F') && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setIsFullscreen((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isFullscreen, hasPrev, hasNext, onPrev, onNext, onClose]);

  // Global mouse up to reliably stop dragging even outside the image
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      window.addEventListener('mouseup', handleGlobalMouseUp);
      return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
    }
  }, [isDragging]);

  if (!isOpen) {
    return null;
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleOpenExternal = () => {
    try {
      getVsCodeApi().postMessage({
        type: 'openExternal',
        payload: { url },
      });
    } catch {
      // Fallback in non-webview environments
    }

    try {
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      // Ignore pop-up blocker error
    }
  };

  // Mouse wheel zoom
  const handleWheel = (e: React.WheelEvent) => {
    if (mediaType !== 'image') return;
    e.preventDefault();
    e.stopPropagation();

    const zoomStep = e.deltaY < 0 ? 1.18 : 0.85;
    setZoom((prev) => {
      const next = prev * zoomStep;
      return Math.min(Math.max(next, 0.2), 10);
    });
  };

  // Mouse drag / pan
  const handleMouseDown = (e: React.MouseEvent) => {
    if (mediaType !== 'image' || e.button !== 0) return;
    e.preventDefault();
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    e.preventDefault();
    setPosition({
      x: e.clientX - dragStartRef.current.x,
      y: e.clientY - dragStartRef.current.y,
    });
  };

  const handleResetZoomAndPan = () => {
    setZoom(1);
    setPosition({ x: 0, y: 0 });
  };

  const handleZoomIn = () => {
    setZoom((prev) => Math.min(prev + 0.25, 10));
  };

  const handleZoomOut = () => {
    setZoom((prev) => Math.max(prev - 0.25, 0.2));
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md select-none transition-all duration-150 ${
        isFullscreen ? 'p-0' : 'p-3 md:p-6'
      }`}
      onClick={isFullscreen ? undefined : onClose}
    >
      <div
        className={`bg-vscode-bg border border-vscode-border shadow-2xl flex flex-col overflow-hidden transition-all duration-150 ${
          isFullscreen
            ? 'w-screen h-screen rounded-none border-none max-w-none max-h-none'
            : 'rounded-lg w-full max-w-4xl max-h-[92vh]'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-vscode-header border-b border-vscode-border flex-shrink-0 gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className={`codicon ${
                mediaType === 'video'
                  ? 'codicon-play text-rose-400'
                  : 'codicon-file-media text-blue-400'
              } text-base flex-shrink-0`}
            ></span>
            <span className="font-semibold text-sm truncate max-w-[200px] sm:max-w-xs md:max-w-md">
              {title}
            </span>
            <span
              className={`text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded border flex-shrink-0 ${
                mediaType === 'video'
                  ? 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                  : 'bg-blue-500/20 text-blue-300 border-blue-500/30'
              }`}
            >
              {mediaType}
            </span>

            {/* Item counter (e.g. 3 of 12) */}
            {totalItems !== undefined && totalItems > 0 && (
              <span className="text-[11px] text-vscode-fg/70 bg-vscode-badge px-2 py-0.5 rounded font-mono-code flex-shrink-0">
                {(itemIndex ?? 0) + 1} / {totalItems}
              </span>
            )}

            {dimensions && (
              <span className="text-[11px] text-vscode-fg/60 font-mono-code hidden lg:inline flex-shrink-0">
                {dimensions.width} &times; {dimensions.height}px
              </span>
            )}
          </div>

          {/* Header Controls */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {/* Prev / Next Header Buttons */}
            {(onPrev || onNext) && (
              <div className="flex items-center border border-vscode-border rounded bg-vscode-inputBg mr-1">
                <button
                  type="button"
                  onClick={onPrev}
                  disabled={!hasPrev}
                  className="p-1 px-1.5 hover:bg-vscode-hover text-vscode-fg disabled:opacity-25 transition-colors"
                  title="Previous Row Image (Left Arrow)"
                >
                  <span className="codicon codicon-arrow-left text-xs"></span>
                </button>
                <button
                  type="button"
                  onClick={onNext}
                  disabled={!hasNext}
                  className="p-1 px-1.5 hover:bg-vscode-hover text-vscode-fg disabled:opacity-25 transition-colors border-l border-vscode-border"
                  title="Next Row Image (Right Arrow)"
                >
                  <span className="codicon codicon-arrow-right text-xs"></span>
                </button>
              </div>
            )}

            {/* Zoom Controls */}
            {mediaType === 'image' && !hasError && (
              <div className="flex items-center border border-vscode-border rounded mr-1 bg-vscode-inputBg">
                <button
                  type="button"
                  onClick={handleZoomOut}
                  disabled={zoom <= 0.2}
                  className="p-1 hover:bg-vscode-hover text-vscode-fg disabled:opacity-30 transition-colors"
                  title="Zoom Out (Mouse Wheel Down)"
                >
                  <span className="codicon codicon-zoom-out text-xs"></span>
                </button>
                <button
                  type="button"
                  onClick={handleResetZoomAndPan}
                  className="px-1.5 text-[11px] font-mono-code hover:bg-vscode-hover text-vscode-fg transition-colors"
                  title="Reset Zoom & Pan (Double Click Image)"
                >
                  {Math.round(zoom * 100)}%
                </button>
                <button
                  type="button"
                  onClick={handleZoomIn}
                  disabled={zoom >= 10}
                  className="p-1 hover:bg-vscode-hover text-vscode-fg disabled:opacity-30 transition-colors"
                  title="Zoom In (Mouse Wheel Up)"
                >
                  <span className="codicon codicon-zoom-in text-xs"></span>
                </button>
              </div>
            )}

            {/* Fullscreen Button */}
            <button
              type="button"
              onClick={() => setIsFullscreen((prev) => !prev)}
              className={`p-1.5 rounded transition-colors ${
                isFullscreen
                  ? 'bg-vscode-button text-vscode-buttonFg hover:bg-vscode-buttonHover'
                  : 'hover:bg-vscode-hover text-vscode-fg'
              }`}
              title={isFullscreen ? 'Exit Fullscreen (F / Esc)' : 'Fullscreen View (F)'}
            >
              <span
                className={`codicon ${
                  isFullscreen ? 'codicon-screen-normal' : 'codicon-screen-full'
                } text-sm`}
              ></span>
            </button>

            {/* Copy Button */}
            <button
              type="button"
              onClick={handleCopy}
              className="flex items-center gap-1 text-xs px-2.5 py-1 rounded bg-vscode-secondaryBtn text-vscode-secondaryBtnFg hover:bg-vscode-secondaryBtnHover transition-colors"
              title="Copy URL to clipboard"
            >
              <span
                className={`codicon ${copied ? 'codicon-check text-green-400' : 'codicon-copy'}`}
              ></span>
              <span className="hidden md:inline">{copied ? 'Copied' : 'Copy'}</span>
            </button>

            {/* Open in Browser Button */}
            <button
              type="button"
              onClick={handleOpenExternal}
              className="flex items-center gap-1 text-xs px-2.5 py-1 rounded bg-vscode-secondaryBtn text-vscode-secondaryBtnFg hover:bg-vscode-secondaryBtnHover transition-colors"
              title="Open link in default browser"
            >
              <span className="codicon codicon-link-external"></span>
              <span className="hidden md:inline">Open</span>
            </button>

            {/* Close Button */}
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

        {/* Modal Body / Viewer Viewport */}
        <div
          className={`flex-1 relative overflow-hidden bg-vscode-inputBg flex items-center justify-center select-none ${
            isFullscreen ? 'h-[calc(100vh-80px)] w-full' : 'h-[68vh] min-h-[380px] w-full'
          }`}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onDoubleClick={handleResetZoomAndPan}
          style={{
            cursor: mediaType === 'image' && !hasError ? (isDragging ? 'grabbing' : 'grab') : 'default',
          }}
        >
          {/* Floating Previous Button */}
          {onPrev && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onPrev();
              }}
              disabled={!hasPrev}
              className="absolute left-3 top-1/2 -translate-y-1/2 z-30 w-10 h-10 rounded-full flex items-center justify-center bg-black/60 hover:bg-black/85 text-white border border-white/20 shadow-xl disabled:opacity-15 disabled:pointer-events-none transition-all hover:scale-105 active:scale-95"
              title="Previous Row Image (Left Arrow)"
            >
              <span className="codicon codicon-chevron-left text-xl"></span>
            </button>
          )}

          {/* Floating Next Button */}
          {onNext && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onNext();
              }}
              disabled={!hasNext}
              className="absolute right-3 top-1/2 -translate-y-1/2 z-30 w-10 h-10 rounded-full flex items-center justify-center bg-black/60 hover:bg-black/85 text-white border border-white/20 shadow-xl disabled:opacity-15 disabled:pointer-events-none transition-all hover:scale-105 active:scale-95"
              title="Next Row Image (Right Arrow)"
            >
              <span className="codicon codicon-chevron-right text-xl"></span>
            </button>
          )}

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
              className="w-full h-full flex items-center justify-center p-3 sm:p-5 overflow-hidden relative"
              style={{
                backgroundImage:
                  'radial-gradient(rgba(128, 128, 128, 0.25) 1px, transparent 0)',
                backgroundSize: '16px 16px',
              }}
            >
              <img
                src={url}
                alt="Preview"
                draggable={false}
                style={{
                  transform: `translate(${position.x}px, ${position.y}px) scale(${zoom})`,
                  transformOrigin: 'center center',
                  transition: isDragging ? 'none' : 'transform 0.12s ease-out',
                  userSelect: 'none',
                  WebkitUserDrag: 'none',
                  maxWidth: '100%',
                  maxHeight: '100%',
                  objectFit: 'contain',
                }}
                className="rounded shadow-lg pointer-events-none"
                onLoad={(e) => {
                  const img = e.currentTarget;
                  setDimensions({ width: img.naturalWidth, height: img.naturalHeight });
                }}
                onError={() => setHasError(true)}
              />
            </div>
          ) : (
            <div className="w-full h-full flex items-center justify-center p-4">
              <video
                src={url}
                controls
                autoPlay
                className={`max-w-full rounded shadow-xl bg-black ${
                  isFullscreen ? 'max-h-[85vh]' : 'max-h-[65vh]'
                }`}
                onError={() => setHasError(true)}
              >
                Your environment does not support video playback.
              </video>
            </div>
          )}

          {/* Quick instructions pill when zoomed */}
          {mediaType === 'image' && !hasError && (zoom !== 1 || position.x !== 0 || position.y !== 0) && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-black/70 backdrop-blur-md text-white text-[11px] px-3 py-1 rounded-full border border-white/10 shadow-md flex items-center gap-2 pointer-events-none z-20 animate-fade-in">
              <span>Drag to pan</span>
              <span>•</span>
              <span>Scroll to zoom</span>
              <span>•</span>
              <span className="font-mono-code">{Math.round(zoom * 100)}%</span>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-4 py-2 bg-vscode-header border-t border-vscode-border flex items-center justify-between text-xs text-vscode-fg/70 gap-2 flex-shrink-0">
          <div className="flex items-center gap-1.5 truncate font-mono-code min-w-0">
            <span className="codicon codicon-link text-xs flex-shrink-0 text-vscode-fg/50"></span>
            <span className="truncate select-text">{url}</span>
          </div>
          <div className="flex items-center gap-3 text-[11px] text-vscode-fg/50 flex-shrink-0 hidden sm:flex">
            <span>
              <kbd className="px-1 py-0.5 rounded bg-vscode-bg border border-vscode-border">←</kbd> / <kbd className="px-1 py-0.5 rounded bg-vscode-bg border border-vscode-border">→</kbd> Next/Prev
            </span>
            <span>
              <kbd className="px-1 py-0.5 rounded bg-vscode-bg border border-vscode-border">F</kbd> Fullscreen
            </span>
            <span>
              <kbd className="px-1 py-0.5 rounded bg-vscode-bg border border-vscode-border">Esc</kbd> Close
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
