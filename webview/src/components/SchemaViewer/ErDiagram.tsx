import React, { useState, useRef, useEffect } from 'react';
import { TableInfo } from '../../../src/common/messages';
import { getVsCodeApi } from '../../hooks/useVsCode';
import { createPdfFromJpeg, uint8ArrayToBase64 } from './pdfExport';
import { getExportThemeColors } from '../../utils/theme';
import { insertTimestamp } from '../../utils/timestamp';

interface ErDiagramProps {
  tables: TableInfo[];
  onSelectTable?: (tableName: string) => void;
}

interface NodePosition {
  x: number;
  y: number;
}

const CARD_WIDTH = 260;

export const ErDiagram: React.FC<ErDiagramProps> = ({ tables, onSelectTable }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 40, y: 40 });
  const [isPanning, setIsPanning] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Compute clean, spacious grid layout
  const computeDefaultPositions = (): Record<string, NodePosition> => {
    const pos: Record<string, NodePosition> = {};
    const cols = Math.ceil(Math.sqrt(tables.length)) || 1;
    tables.forEach((t, i) => {
      const colIdx = i % cols;
      const rowIdx = Math.floor(i / cols);
      pos[t.name] = {
        x: colIdx * 380 + 60,
        y: rowIdx * 340 + 60,
      };
    });
    return pos;
  };

  // Restore saved positions from localStorage or compute default
  const [positions, setPositions] = useState<Record<string, NodePosition>>(() => {
    try {
      const saved = localStorage.getItem('sqlite_er_diagram_layout');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (tables.length > 0 && tables.every((t) => parsed[t.name])) {
          return parsed;
        }
      }
    } catch {}
    return computeDefaultPositions();
  });

  const [draggingNode, setDraggingNode] = useState<{
    name: string;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);

  // Reset to default layout
  const handleResetLayout = () => {
    try {
      localStorage.removeItem('sqlite_er_diagram_layout');
    } catch {}
    setPositions(computeDefaultPositions());
    setZoom(1);
    setPan({ x: 40, y: 40 });
  };

  // Save layout explicitly
  const handleSaveLayout = () => {
    try {
      localStorage.setItem('sqlite_er_diagram_layout', JSON.stringify(positions));
    } catch {}
  };

  // Mouse wheel zoom in/out handler
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.08 : 0.92;
    setZoom((z) => Math.min(2.5, Math.max(0.25, z * zoomFactor)));
  };

  // Robust window mouse listeners for panning and node dragging (with requestAnimationFrame for 60fps smoothness)
  useEffect(() => {
    if (!isPanning && !draggingNode) return;

    let rafId: number | null = null;

    const onMouseMove = (e: MouseEvent) => {
      if (rafId !== null) return;

      rafId = requestAnimationFrame(() => {
        rafId = null;
        if (isPanning) {
          setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
        } else if (draggingNode) {
          const dx = (e.clientX - draggingNode.startX) / zoom;
          const dy = (e.clientY - draggingNode.startY) / zoom;
          setPositions((prev) => ({
            ...prev,
            [draggingNode.name]: {
              x: Math.round(draggingNode.origX + dx),
              y: Math.round(draggingNode.origY + dy),
            },
          }));
        }
      });
    };

    const onMouseUp = () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      if (isPanning) {
        setIsPanning(false);
      }
      if (draggingNode) {
        setDraggingNode(null);
        setPositions((latest) => {
          try {
            localStorage.setItem('sqlite_er_diagram_layout', JSON.stringify(latest));
          } catch {}
          return latest;
        });
      }
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [isPanning, draggingNode, dragStart, zoom]);

  // Pan canvas controls (only triggers when clicking empty canvas)
  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0 || draggingNode) return;
    if ((e.target as HTMLElement).closest('.er-node-card') || (e.target as HTMLElement).closest('button')) {
      return;
    }
    setIsPanning(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  // Node drag handler
  const startDragNode = (e: React.MouseEvent, tableName: string) => {
    e.stopPropagation();
    e.preventDefault();
    const current = positions[tableName] || { x: 0, y: 0 };
    setDraggingNode({
      name: tableName,
      startX: e.clientX,
      startY: e.clientY,
      origX: current.x,
      origY: current.y,
    });
  };

  // Extract all foreign key relations
  const relations = React.useMemo(() => {
    const rels: Array<{
      fromTable: string;
      fromCol: string;
      toTable: string;
      toCol: string;
    }> = [];

    tables.forEach((t) => {
      t.foreignKeys.forEach((fk) => {
        rels.push({
          fromTable: t.name,
          fromCol: fk.from,
          toTable: fk.table,
          toCol: fk.to,
        });
      });
    });
    return rels;
  }, [tables]);

  // Close export menu on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setIsExportMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Generate standalone SVG of the complete ER diagram
  const generateErSvg = () => {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    tables.forEach((t) => {
      const pos = positions[t.name] || { x: 0, y: 0 };
      const colCount = t.columns.length;
      const cardH = 36 + colCount * 23 + 8;
      if (pos.x < minX) minX = pos.x;
      if (pos.y < minY) minY = pos.y;
      if (pos.x + CARD_WIDTH > maxX) maxX = pos.x + CARD_WIDTH;
      if (pos.y + cardH > maxY) maxY = pos.y + cardH;
    });

    if (!isFinite(minX)) {
      minX = 0;
      minY = 0;
      maxX = 800;
      maxY = 600;
    }

    const pad = 60;
    const exportX = minX - pad;
    const exportY = minY - pad;
    const exportW = maxX - minX + pad * 2;
    const exportH = maxY - minY + pad * 2;

    const colors = getExportThemeColors();

    const relPaths = relations
      .map((rel) => {
        const fromPos = positions[rel.fromTable];
        const toPos = positions[rel.toTable];
        if (!fromPos || !toPos) return '';

        const fromTableObj = tables.find((t) => t.name === rel.fromTable);
        const toTableObj = tables.find((t) => t.name === rel.toTable);

        const fromColIdx = Math.max(0, fromTableObj?.columns.findIndex((c) => c.name === rel.fromCol) ?? 0);
        const toColIdx = Math.max(0, toTableObj?.columns.findIndex((c) => c.name === rel.toCol) ?? 0);

        const fromColY = fromPos.y + 36 + fromColIdx * 23 + 11;
        const toColY = toPos.y + 36 + toColIdx * 23 + 11;

        let x1: number, y1: number, x2: number, y2: number, d: string;
        if (toPos.x >= fromPos.x + CARD_WIDTH) {
          x1 = fromPos.x + CARD_WIDTH;
          y1 = fromColY;
          x2 = toPos.x;
          y2 = toColY;
          const dx = Math.max(50, (x2 - x1) * 0.5);
          d = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
        } else if (toPos.x + CARD_WIDTH <= fromPos.x) {
          x1 = fromPos.x;
          y1 = fromColY;
          x2 = toPos.x + CARD_WIDTH;
          y2 = toColY;
          const dx = Math.max(50, (x1 - x2) * 0.5);
          d = `M ${x1} ${y1} C ${x1 - dx} ${y1}, ${x2 + dx} ${y2}, ${x2} ${y2}`;
        } else {
          if (toPos.y > fromPos.y) {
            x1 = fromPos.x + CARD_WIDTH;
            y1 = fromColY;
            x2 = toPos.x + CARD_WIDTH;
            y2 = toColY;
            const loopOut = 40;
            d = `M ${x1} ${y1} C ${x1 + loopOut} ${y1}, ${x2 + loopOut} ${y2}, ${x2} ${y2}`;
          } else {
            x1 = fromPos.x;
            y1 = fromColY;
            x2 = toPos.x;
            y2 = toColY;
            const loopOut = 40;
            d = `M ${x1} ${y1} C ${x1 - loopOut} ${y1}, ${x2 - loopOut} ${y2}, ${x2} ${y2}`;
          }
        }
        return `<path d="${d}" fill="none" stroke="${colors.accentColor}" stroke-width="2" stroke-dasharray="4 3" marker-end="url(#er-arrow)"/>`;
      })
      .join('\n');

    const tableCards = tables
      .map((t) => {
        const pos = positions[t.name] || { x: 0, y: 0 };
        const colCount = t.columns.length;
        const cardH = 36 + colCount * 23 + 8;

        const colsSvg = t.columns
          .map((col, idx) => {
            const colY = pos.y + 36 + idx * 23;
            const isPk = col.pk > 0;
            const isFk = t.foreignKeys.some((f) => f.from === col.name);
            const prefix = isPk ? 'PK ' : isFk ? 'FK ' : '   ';
            const nameColor = isPk ? colors.pkColor : isFk ? colors.fkColor : colors.colNameColor;
            return `
              <text x="${pos.x + 12}" y="${colY + 16}" fill="${nameColor}" font-family="monospace" font-size="11" font-weight="${
              isPk ? 'bold' : 'normal'
            }">${prefix}${col.name}</text>
              <text x="${pos.x + CARD_WIDTH - 12}" y="${colY + 16}" fill="${colors.colTypeColor}" font-family="monospace" font-size="10" text-anchor="end">${
              col.type || 'ANY'
            }</text>
            `;
          })
          .join('\n');

        return `
          <g>
            <rect x="${pos.x}" y="${pos.y}" width="${CARD_WIDTH}" height="${cardH}" rx="10" fill="${colors.cardBg}" stroke="${colors.borderColor}" stroke-width="1.5"/>
            <path d="M ${pos.x} ${pos.y + 10} A 10 10 0 0 1 ${pos.x + 10} ${pos.y} L ${pos.x + CARD_WIDTH - 10} ${pos.y} A 10 10 0 0 1 ${
          pos.x + CARD_WIDTH
        } ${pos.y + 10} L ${pos.x + CARD_WIDTH} ${pos.y + 34} L ${pos.x} ${pos.y + 34} Z" fill="${colors.headerBg}"/>
            <line x1="${pos.x}" y1="${pos.y + 34}" x2="${pos.x + CARD_WIDTH}" y2="${pos.y + 34}" stroke="${colors.borderColor}" stroke-width="1"/>
            <text x="${pos.x + 12}" y="${pos.y + 22}" fill="${colors.textColor}" font-family="system-ui, sans-serif" font-size="12" font-weight="600">${
          t.name
        }</text>
            <text x="${pos.x + CARD_WIDTH - 12}" y="${pos.y + 22}" fill="${colors.mutedColor}" font-family="monospace" font-size="10" text-anchor="end">${t.rowCount.toLocaleString()} rows</text>
            ${colsSvg}
          </g>
        `;
      })
      .join('\n');

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${exportX} ${exportY} ${exportW} ${exportH}" width="${exportW}" height="${exportH}">
      <defs>
        <marker id="er-arrow" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="${colors.accentColor}" />
        </marker>
      </defs>
      <rect x="${exportX}" y="${exportY}" width="${exportW}" height="${exportH}" fill="${colors.canvasBg}" />
      ${relPaths}
      ${tableCards}
    </svg>`;

    return { svgString: svg, width: exportW, height: exportH, colors };
  };

  const handleExport = (format: 'png' | 'svg' | 'pdf' | 'json') => {
    if (format === 'json') {
      const schemaData = JSON.stringify({ tables, relations }, null, 2);
      const blob = new Blob([schemaData], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = insertTimestamp('database_er_schema.json');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      showToast('Downloaded Schema JSON!');
      return;
    }

    const { svgString, width, height, colors } = generateErSvg();

    if (format === 'svg') {
      getVsCodeApi().postMessage({
        type: 'exportImage',
        payload: {
          fileName: insertTimestamp('database_er_diagram.svg'),
          format: 'svg',
          svgString,
        },
      });
      showToast('Saved ER Diagram SVG to project!');
      return;
    }

    const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      try {
        const scale = 2;
        const canvas = document.createElement('canvas');
        canvas.width = width * scale;
        canvas.height = height * scale;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.scale(scale, scale);
        // Theme-synced background
        ctx.fillStyle = colors.canvasBg;
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        if (format === 'png') {
          const base64Data = canvas.toDataURL('image/png');
          getVsCodeApi().postMessage({
            type: 'exportImage',
            payload: {
              fileName: insertTimestamp('database_er_diagram.png'),
              format: 'png',
              base64Data,
            },
          });
          showToast('Saved ER Diagram PNG to project!');
        } else if (format === 'pdf') {
          const jpegDataUrl = canvas.toDataURL('image/jpeg', 0.95);
          const cleanJpeg = jpegDataUrl.replace(/^data:image\/jpeg;base64,/, '');
          const binaryStr = window.atob(cleanJpeg);
          const bytes = new Uint8Array(binaryStr.length);
          for (let i = 0; i < binaryStr.length; i++) {
            bytes[i] = binaryStr.charCodeAt(i);
          }

          const pdfBytes = createPdfFromJpeg(bytes, width, height);
          const pdfBase64 = uint8ArrayToBase64(pdfBytes);

          getVsCodeApi().postMessage({
            type: 'exportImage',
            payload: {
              fileName: insertTimestamp('database_er_diagram.pdf'),
              format: 'pdf',
              base64Data: `data:application/pdf;base64,${pdfBase64}`,
            },
          });
          showToast('Saved ER Diagram PDF to project!');
        }
      } catch (err) {
        console.error('ER diagram export error:', err);
        showToast('Export failed');
      } finally {
        URL.revokeObjectURL(url);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      showToast('Failed to load diagram SVG for conversion');
    };
    img.src = url;
  };

  return (
    <div
      ref={containerRef}
      onMouseDown={handleCanvasMouseDown}
      onWheel={handleWheel}
      className={`relative flex-1 w-full h-full overflow-hidden bg-vscode-bg select-none ${
        draggingNode ? 'cursor-grabbing' : isPanning ? 'cursor-grabbing' : 'cursor-grab'
      }`}
      style={{
        backgroundImage: `radial-gradient(circle, var(--vscode-editorWidget-border, #333) 1px, transparent 1px)`,
        backgroundSize: '24px 24px',
      }}
    >
      {/* Zoom & Layout Action Controls Bar */}
      <div className="absolute top-4 right-4 z-30 flex items-center gap-1 bg-vscode-header border border-vscode-border rounded-lg shadow-xl p-1 text-xs">
        <button
          onClick={() => setZoom((z) => Math.min(2.5, z + 0.15))}
          className="p-1 rounded hover:bg-vscode-hover text-vscode-fg"
          title="Zoom In (or use mouse wheel)"
        >
          <span className="codicon codicon-zoom-in text-xs"></span>
        </button>
        <span className="text-xs px-1.5 font-mono text-vscode-fg/70">
          {Math.round(zoom * 100)}%
        </span>
        <button
          onClick={() => setZoom((z) => Math.max(0.25, z - 0.15))}
          className="p-1 rounded hover:bg-vscode-hover text-vscode-fg"
          title="Zoom Out (or use mouse wheel)"
        >
          <span className="codicon codicon-zoom-out text-xs"></span>
        </button>

        <div className="h-4 w-px bg-vscode-border mx-1"></div>

        <button
          onClick={handleResetLayout}
          className="flex items-center gap-1 px-1.5 sm:px-2 py-1 rounded hover:bg-vscode-hover text-vscode-fg"
          title="Reset to default spacious arrangement"
        >
          <span className="codicon codicon-refresh text-xs"></span>
          <span className="hidden sm:inline">Reset Layout</span>
        </button>

        <button
          onClick={() => {
            setZoom(1);
            setPan({ x: 40, y: 40 });
          }}
          className="p-1 rounded hover:bg-vscode-hover text-vscode-fg"
          title="Reset View Pan"
        >
          <span className="codicon codicon-screen-normal text-xs"></span>
        </button>

        <div className="h-4 w-px bg-vscode-border mx-1"></div>

        {/* Export Dropdown */}
        <div className="relative" ref={exportMenuRef}>
          <button
            onClick={() => setIsExportMenuOpen((prev) => !prev)}
            className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1 rounded bg-vscode-button text-vscode-buttonFg hover:bg-vscode-buttonHover text-xs font-semibold shadow-sm transition-colors"
            title="Export ER Diagram in various formats"
          >
            <span className="codicon codicon-cloud-download text-xs"></span>
            <span className="hidden sm:inline">Export</span>
            <span className="codicon codicon-chevron-down text-[10px]"></span>
          </button>

          {isExportMenuOpen && (
            <div
              className="absolute right-0 top-full mt-1.5 w-48 border border-vscode-menuBorder rounded-lg shadow-2xl py-1 text-xs z-[100] animate-in fade-in zoom-in-95 duration-100"
              style={{ backgroundColor: 'var(--vscode-menu-background, var(--vscode-editorWidget-background, #252526))' }}
            >
              <button
                onClick={() => {
                  setIsExportMenuOpen(false);
                  handleExport('png');
                }}
                className="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-vscode-menuHoverBg hover:text-vscode-menuHoverFg text-left text-vscode-fg transition-colors"
              >
                <span className="codicon codicon-file-media text-vscode-info text-xs"></span>
                <span>PNG Image (.png)</span>
              </button>
              <button
                onClick={() => {
                  setIsExportMenuOpen(false);
                  handleExport('svg');
                }}
                className="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-vscode-menuHoverBg hover:text-vscode-menuHoverFg text-left text-vscode-fg transition-colors"
              >
                <span className="codicon codicon-file-code text-purple-400 text-xs"></span>
                <span>Vector SVG (.svg)</span>
              </button>
              <button
                onClick={() => {
                  setIsExportMenuOpen(false);
                  handleExport('pdf');
                }}
                className="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-vscode-menuHoverBg hover:text-vscode-menuHoverFg text-left text-vscode-fg transition-colors"
              >
                <span className="codicon codicon-file-pdf text-rose-400 text-xs"></span>
                <span>PDF Document (.pdf)</span>
              </button>
              <div className="my-1 border-t border-vscode-border/50"></div>
              <button
                onClick={() => {
                  setIsExportMenuOpen(false);
                  handleExport('json');
                }}
                className="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-vscode-menuHoverBg hover:text-vscode-menuHoverFg text-left text-vscode-fg transition-colors"
              >
                <span className="codicon codicon-json text-emerald-400 text-xs"></span>
                <span>Schema JSON (.json)</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* SVG Container for Foreign Key Relationship Lines (Layered BEHIND table cards) */}
      <svg
        className="absolute top-0 left-0 w-full h-full pointer-events-none z-0 overflow-visible"
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: '0 0',
        }}
      >
        <defs>
          <marker
            id="fk-arrow"
            viewBox="0 0 10 10"
            refX="7"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="var(--vscode-editorInfo-foreground, #38bdf8)" />
          </marker>
        </defs>

        {relations.map((rel, idx) => {
          const fromPos = positions[rel.fromTable];
          const toPos = positions[rel.toTable];
          if (!fromPos || !toPos) {return null;}

          const fromTableObj = tables.find((t) => t.name === rel.fromTable);
          const toTableObj = tables.find((t) => t.name === rel.toTable);

          // Calculate precise vertical offset for the referenced columns
          const fromColIdx = Math.max(
            0,
            fromTableObj?.columns.findIndex((c) => c.name === rel.fromCol) ?? 0
          );
          const toColIdx = Math.max(
            0,
            toTableObj?.columns.findIndex((c) => c.name === rel.toCol) ?? 0
          );

          const fromColY = fromPos.y + 36 + fromColIdx * 23 + 11;
          const toColY = toPos.y + 36 + toColIdx * 23 + 11;

          // Pretty Smart routing: connect to outer left or right edge cleanly
          let x1: number;
          let y1: number;
          let x2: number;
          let y2: number;
          let d: string;

          if (toPos.x >= fromPos.x + CARD_WIDTH) {
            // Target is to the right of source: exit right edge of source, enter left edge of target
            x1 = fromPos.x + CARD_WIDTH;
            y1 = fromColY;
            x2 = toPos.x;
            y2 = toColY;
            const dx = Math.max(50, (x2 - x1) * 0.5);
            d = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
          } else if (toPos.x + CARD_WIDTH <= fromPos.x) {
            // Target is to the left of source: exit left edge of source, enter right edge of target
            x1 = fromPos.x;
            y1 = fromColY;
            x2 = toPos.x + CARD_WIDTH;
            y2 = toColY;
            const dx = Math.max(50, (x1 - x2) * 0.5);
            d = `M ${x1} ${y1} C ${x1 - dx} ${y1}, ${x2 + dx} ${y2}, ${x2} ${y2}`;
          } else {
            // Vertically stacked: route around the cards
            if (toPos.y > fromPos.y) {
              x1 = fromPos.x + CARD_WIDTH;
              y1 = fromColY;
              x2 = toPos.x + CARD_WIDTH;
              y2 = toColY;
              const loopOut = 40;
              d = `M ${x1} ${y1} C ${x1 + loopOut} ${y1}, ${x2 + loopOut} ${y2}, ${x2} ${y2}`;
            } else {
              x1 = fromPos.x;
              y1 = fromColY;
              x2 = toPos.x;
              y2 = toColY;
              const loopOut = 40;
              d = `M ${x1} ${y1} C ${x1 - loopOut} ${y1}, ${x2 - loopOut} ${y2}, ${x2} ${y2}`;
            }
          }

          const isHighlighted =
            selectedTable === rel.fromTable || selectedTable === rel.toTable;

          return (
            <g key={idx}>
              {/* Outer shadow glow when highlighted */}
              {isHighlighted && (
                <path
                  d={d}
                  fill="none"
                  stroke="#38bdf8"
                  strokeWidth="4"
                  strokeOpacity="0.35"
                />
              )}
              {/* Main connector line */}
              <path
                d={d}
                fill="none"
                stroke={isHighlighted ? '#38bdf8' : '#64748b'}
                strokeWidth={isHighlighted ? 2.5 : 1.5}
                strokeDasharray={rel.isManual ? '4 4' : undefined}
                markerEnd="url(#fk-arrow)"
                className="transition-colors duration-200"
              />
            </g>
          );
        })}
      </svg>

      {/* Tables Nodes (Layered IN FRONT of lines and arrows) */}
      <div
        className="absolute origin-top-left pointer-events-none z-10"
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
        }}
      >
        {tables.map((table) => {
          const pos = positions[table.name] || { x: 40, y: 40 };
          const isSelected = selectedTable === table.name;

          return (
            <div
              key={table.name}
              style={{
                left: `${pos.x}px`,
                top: `${pos.y}px`,
                width: `${CARD_WIDTH}px`,
                pointerEvents: 'auto',
              }}
              onClick={(e) => {
                e.stopPropagation();
                onSelectTable?.(table.name);
              }}
              className={`er-node-card absolute border rounded-xl shadow-xl overflow-hidden bg-vscode-header select-none transition-shadow cursor-move ${
                isSelected
                  ? 'border-vscode-focusBorder ring-2 ring-vscode-focusBorder/40 z-20'
                  : 'border-vscode-border hover:border-vscode-fg/50 z-10'
              }`}
            >
              {/* Card Header (Draggable Handle) */}
              <div
                onMouseDown={(e) => startDragNode(e, table.name)}
                className="px-3 py-2 bg-vscode-header border-b border-vscode-border flex items-center justify-between cursor-move group hover:bg-vscode-list-hoverBg transition-colors"
              >
                <div className="flex items-center gap-1.5 truncate">
                  <span className="codicon codicon-table text-vscode-info text-xs"></span>
                  <span className="font-semibold text-xs truncate text-vscode-fg">
                    {table.name}
                  </span>
                </div>
                <div className="flex items-center gap-1 text-[10px] text-vscode-fg/50 font-mono">
                  <span>{table.rowCount.toLocaleString()}</span>
                  <span className="codicon codicon-gripper text-vscode-fg/30 group-hover:text-vscode-fg/70"></span>
                </div>
              </div>

              {/* Columns List (No scrollbar, full height) */}
              <div className="p-2 space-y-0.5 bg-vscode-bg font-mono text-[11px]">
                {table.columns.map((col) => {
                  const isPk = col.pk > 0;
                  const fk = table.foreignKeys.find((f) => f.from === col.name);

                  return (
                    <div
                      key={col.name}
                      className="flex items-center justify-between text-vscode-fg/90 py-0.5 px-1 rounded hover:bg-vscode-hover/50"
                    >
                      <div className="flex items-center gap-1.5 truncate">
                        {isPk && (
                          <span
                            className="codicon codicon-key text-amber-400 text-[10px]"
                            title="Primary Key"
                          ></span>
                        )}
                        {fk && (
                          <span
                            className="codicon codicon-link text-sky-400 text-[10px]"
                            title={`References ${fk.table}.${fk.to}`}
                          ></span>
                        )}
                        <span className={`truncate ${isPk ? 'font-semibold text-amber-300' : ''}`}>
                          {col.name}
                        </span>
                      </div>
                      <span className="text-[10px] text-vscode-fg/40 font-normal">
                        {col.type || 'ANY'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Toast Notification */}
      {toastMessage && (
        <div className="absolute bottom-6 right-6 z-50 bg-vscode-header border border-vscode-border px-3.5 py-2 rounded-lg shadow-xl text-xs text-vscode-fg flex items-center gap-2">
          <span className="codicon codicon-check text-green-400"></span>
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
};
