import React, { useState, useMemo } from 'react';
import {
  ColorPaletteName,
  COLOR_PALETTES,
  formatMetricNumber,
  describeArc,
  getSmoothCurvePath,
} from './chartUtils';

export type ChartType = 'bar' | 'horizontalBar' | 'line' | 'area' | 'donut' | 'scatter';

export interface ChartDataItem {
  label: string;
  value: number;
  secondaryValue?: number; // for scatter plot
  raw?: any;
}

interface ChartRendererProps {
  chartType: ChartType;
  data: ChartDataItem[];
  paletteName: ColorPaletteName;
  showDataLabels?: boolean;
  showGridLines?: boolean;
  smoothCurve?: boolean;
  xAxisLabel?: string;
  yAxisLabel?: string;
  svgRef: React.RefObject<SVGSVGElement>;
}

export const ChartRenderer: React.FC<ChartRendererProps> = ({
  chartType,
  data,
  paletteName,
  showDataLabels = true,
  showGridLines = true,
  smoothCurve = true,
  xAxisLabel,
  yAxisLabel,
  svgRef,
}) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);

  const palette = COLOR_PALETTES[paletteName] || COLOR_PALETTES.vscode;
  const colors = palette.colors;

  // Compute overall statistics
  const { totalSum, maxVal, minVal } = useMemo(() => {
    let sum = 0;
    let max = -Infinity;
    let min = Infinity;
    data.forEach((d) => {
      const v = Number(d.value) || 0;
      sum += v;
      if (v > max) {max = v;}
      if (v < min) {min = v;}
    });
    if (data.length === 0) {
      max = 100;
      min = 0;
    } else {
      if (min > 0) {min = 0;} // anchor at 0 for bars/areas
      if (max === min) {max = min + 1;}
    }
    return { totalSum: sum, maxVal: max, minVal: min };
  }, [data]);

  // Width and Height constants for responsive SVG
  const width = 800;
  const height = 480;

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * width;
    const y = ((e.clientY - rect.top) / rect.height) * height;
    setMousePos({ x, y });
  };

  const handleMouseLeave = () => {
    setHoveredIdx(null);
    setMousePos(null);
  };

  if (!data || data.length === 0) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center text-vscode-fg/50 p-8">
        <span className="codicon codicon-graph text-4xl mb-3 opacity-40"></span>
        <p className="text-sm font-medium">No data available to plot</p>
        <p className="text-xs text-vscode-fg/40 mt-1">
          Select columns or run an aggregation to generate chart visualizations.
        </p>
      </div>
    );
  }

  // --- RENDER 1: VERTICAL BAR CHART ---
  if (chartType === 'bar') {
    const shouldRotate = data.length > 5 || data.some((d) => (d.label || '').length > 6);
    const bottomMargin = shouldRotate ? 115 : 55;
    const leftMargin = Math.max(65, Math.ceil(Math.log10(Math.max(1, maxVal))) * 7.5 + 40);
    const margin = { top: 35, right: 30, bottom: bottomMargin, left: leftMargin };
    const chartW = width - margin.left - margin.right;
    const chartH = height - margin.top - margin.bottom;

    const barWidth = Math.max(10, Math.min(60, (chartW / data.length) * 0.7));
    const step = chartW / data.length;

    // Y ticks (5 intervals)
    const yTicks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => {
      const val = minVal + ratio * (maxVal - minVal);
      const y = margin.top + chartH - ratio * chartH;
      return { val, y };
    });

    const skipInterval = data.length > 22 ? Math.ceil(data.length / 16) : 1;

    return (
      <div className="relative w-full h-full flex items-center justify-center p-2">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-full max-h-[500px] select-none"
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          {/* Grid lines & Y Axis */}
          {yTicks.map((tick, i) => (
            <g key={i}>
              {showGridLines && (
                <line
                  x1={margin.left}
                  y1={tick.y}
                  x2={width - margin.right}
                  y2={tick.y}
                  stroke="var(--vscode-charts-lines, rgba(255,255,255,0.08))"
                  strokeDasharray="3 3"
                />
              )}
              <text
                x={margin.left - 10}
                y={tick.y + 4}
                textAnchor="end"
                className="text-[11px] fill-vscode-fg/60 font-mono"
              >
                {formatMetricNumber(tick.val)}
              </text>
            </g>
          ))}

          {/* X Baseline */}
          <line
            x1={margin.left}
            y1={margin.top + chartH}
            x2={width - margin.right}
            y2={margin.top + chartH}
            stroke="var(--vscode-border, #454545)"
            strokeWidth="1.5"
          />

          {/* Bars */}
          {data.map((d, i) => {
            const barH = ((d.value - minVal) / (maxVal - minVal)) * chartH;
            const x = margin.left + i * step + (step - barWidth) / 2;
            const y = margin.top + chartH - barH;
            const color = colors[i % colors.length];
            const isHovered = hoveredIdx === i;

            return (
              <g
                key={i}
                onMouseEnter={() => setHoveredIdx(i)}
                className="cursor-pointer transition-opacity"
                opacity={hoveredIdx === null || isHovered ? 1 : 0.4}
              >
                <rect
                  x={x}
                  y={y}
                  width={barWidth}
                  height={Math.max(2, barH)}
                  rx={4}
                  fill={color}
                  stroke={isHovered ? '#ffffff' : 'none'}
                  strokeWidth={isHovered ? 1.5 : 0}
                  className="transition-all duration-150"
                />

                {/* Data Value Label on top */}
                {showDataLabels && barWidth >= 20 && (
                  <text
                    x={x + barWidth / 2}
                    y={y - 6}
                    textAnchor="middle"
                    className="text-[10px] font-mono fill-vscode-fg font-semibold"
                  >
                    {formatMetricNumber(d.value)}
                  </text>
                )}

                {/* Category X Label */}
                {(i % skipInterval === 0 || i === data.length - 1) && (
                  <text
                    x={shouldRotate ? x + barWidth / 2 - 4 : x + barWidth / 2}
                    y={shouldRotate ? margin.top + chartH + 12 : margin.top + chartH + 18}
                    textAnchor={shouldRotate ? 'end' : 'middle'}
                    className="text-[11px] fill-vscode-fg/80 select-none font-medium"
                    transform={
                      shouldRotate
                        ? `rotate(-40, ${x + barWidth / 2 - 4}, ${margin.top + chartH + 12})`
                        : undefined
                    }
                  >
                    <title>{d.label}</title>
                    {d.label.length > 18 ? d.label.substring(0, 16) + '…' : d.label}
                  </text>
                )}
              </g>
            );
          })}

          {/* Axis Titles */}
          {yAxisLabel && (
            <text
              x={-height / 2}
              y={18}
              transform="rotate(-90)"
              textAnchor="middle"
              className="text-xs fill-vscode-fg/70 font-medium"
            >
              {yAxisLabel}
            </text>
          )}
          {xAxisLabel && (
            <text
              x={margin.left + chartW / 2}
              y={height - 10}
              textAnchor="middle"
              className="text-xs fill-vscode-fg/70 font-semibold"
            >
              {xAxisLabel}
            </text>
          )}
        </svg>

        {/* Hover Tooltip Overlay */}
        {hoveredIdx !== null && mousePos && (
          <TooltipOverlay
            mousePos={mousePos}
            item={data[hoveredIdx]}
            totalSum={totalSum}
            color={colors[hoveredIdx % colors.length]}
          />
        )}
      </div>
    );
  }

  // --- RENDER 2: HORIZONTAL BAR CHART ---
  if (chartType === 'horizontalBar') {
    const maxLabelLen = Math.max(0, ...data.map((d) => (d.label || '').length));
    const leftMargin = Math.min(240, Math.max(120, maxLabelLen * 7.5 + 25));
    const margin = { top: 35, right: 60, bottom: 50, left: leftMargin };
    const chartW = width - margin.left - margin.right;
    const chartH = height - margin.top - margin.bottom;

    const rowHeight = chartH / data.length;
    const barHeight = Math.max(10, Math.min(32, rowHeight * 0.7));

    // X ticks
    const xTicks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => {
      const val = minVal + ratio * (maxVal - minVal);
      const x = margin.left + ratio * chartW;
      return { val, x };
    });

    return (
      <div className="relative w-full h-full flex items-center justify-center p-2">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-full max-h-[500px] select-none"
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          {/* Vertical Grid Lines */}
          {xTicks.map((tick, i) => (
            <g key={i}>
              {showGridLines && (
                <line
                  x1={tick.x}
                  y1={margin.top}
                  x2={tick.x}
                  y2={height - margin.bottom}
                  stroke="var(--vscode-charts-lines, rgba(255,255,255,0.08))"
                  strokeDasharray="3 3"
                />
              )}
              <text
                x={tick.x}
                y={height - margin.bottom + 16}
                textAnchor="middle"
                className="text-[11px] fill-vscode-fg/60 font-mono"
              >
                {formatMetricNumber(tick.val)}
              </text>
            </g>
          ))}

          {/* Y Baseline */}
          <line
            x1={margin.left}
            y1={margin.top}
            x2={margin.left}
            y2={height - margin.bottom}
            stroke="var(--vscode-border, #454545)"
            strokeWidth="1.5"
          />

          {/* Horizontal Bars */}
          {data.map((d, i) => {
            const barW = ((d.value - minVal) / (maxVal - minVal)) * chartW;
            const y = margin.top + i * rowHeight + (rowHeight - barHeight) / 2;
            const color = colors[i % colors.length];
            const isHovered = hoveredIdx === i;

            return (
              <g
                key={i}
                onMouseEnter={() => setHoveredIdx(i)}
                className="cursor-pointer transition-opacity"
                opacity={hoveredIdx === null || isHovered ? 1 : 0.4}
              >
                {/* Category Y Label */}
                <text
                  x={margin.left - 10}
                  y={y + barHeight / 2 + 4}
                  textAnchor="end"
                  className="text-[11px] fill-vscode-fg/80 font-medium"
                >
                  <title>{d.label}</title>
                  {d.label.length > 24 ? d.label.substring(0, 22) + '…' : d.label}
                </text>

                <rect
                  x={margin.left}
                  y={y}
                  width={Math.max(2, barW)}
                  height={barHeight}
                  rx={4}
                  fill={color}
                  stroke={isHovered ? '#ffffff' : 'none'}
                  strokeWidth={isHovered ? 1.5 : 0}
                  className="transition-all duration-150"
                />

                {/* Data Value Label on right */}
                {showDataLabels && (
                  <text
                    x={margin.left + barW + 8}
                    y={y + barHeight / 2 + 4}
                    textAnchor="start"
                    className="text-[11px] font-mono fill-vscode-fg font-semibold"
                  >
                    {formatMetricNumber(d.value)}
                  </text>
                )}
              </g>
            );
          })}

          {/* Axis Titles */}
          {yAxisLabel && (
            <text
              x={-height / 2}
              y={18}
              transform="rotate(-90)"
              textAnchor="middle"
              className="text-xs fill-vscode-fg/70 font-medium"
            >
              {yAxisLabel}
            </text>
          )}
          {xAxisLabel && (
            <text
              x={margin.left + chartW / 2}
              y={height - 8}
              textAnchor="middle"
              className="text-xs fill-vscode-fg/70 font-semibold"
            >
              {xAxisLabel}
            </text>
          )}
        </svg>

        {hoveredIdx !== null && mousePos && (
          <TooltipOverlay
            mousePos={mousePos}
            item={data[hoveredIdx]}
            totalSum={totalSum}
            color={colors[hoveredIdx % colors.length]}
          />
        )}
      </div>
    );
  }

  // --- RENDER 3 & 4: LINE & AREA CHARTS ---
  if (chartType === 'line' || chartType === 'area') {
    const shouldRotate = data.length > 5 || data.some((d) => (d.label || '').length > 6);
    const bottomMargin = shouldRotate ? 115 : 55;
    const margin = { top: 35, right: 30, bottom: bottomMargin, left: 65 };
    const chartW = width - margin.left - margin.right;
    const chartH = height - margin.top - margin.bottom;

    const step = chartW / Math.max(1, data.length - 1);

    const points = data.map((d, i) => {
      const ratio = (d.value - minVal) / (maxVal - minVal);
      return {
        x: margin.left + i * step,
        y: margin.top + chartH - ratio * chartH,
        d,
      };
    });

    const pathD = smoothCurve
      ? getSmoothCurvePath(points)
      : points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

    const areaD = `${pathD} L ${margin.left + (data.length - 1) * step} ${
      margin.top + chartH
    } L ${margin.left} ${margin.top + chartH} Z`;

    const primaryColor = colors[0];

    // Y ticks
    const yTicks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => {
      const val = minVal + ratio * (maxVal - minVal);
      const y = margin.top + chartH - ratio * chartH;
      return { val, y };
    });

    const skipInterval = data.length > 22 ? Math.ceil(data.length / 20) : 1;

    return (
      <div className="relative w-full h-full flex items-center justify-center p-2">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-full max-h-[500px] select-none"
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          <defs>
            <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={primaryColor} stopOpacity="0.35" />
              <stop offset="100%" stopColor={primaryColor} stopOpacity="0.02" />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          {yTicks.map((tick, i) => (
            <g key={i}>
              {showGridLines && (
                <line
                  x1={margin.left}
                  y1={tick.y}
                  x2={width - margin.right}
                  y2={tick.y}
                  stroke="var(--vscode-charts-lines, rgba(255,255,255,0.08))"
                  strokeDasharray="3 3"
                />
              )}
              <text
                x={margin.left - 10}
                y={tick.y + 4}
                textAnchor="end"
                className="text-[11px] fill-vscode-fg/60 font-mono"
              >
                {formatMetricNumber(tick.val)}
              </text>
            </g>
          ))}

          {/* X Baseline */}
          <line
            x1={margin.left}
            y1={margin.top + chartH}
            x2={width - margin.right}
            y2={margin.top + chartH}
            stroke="var(--vscode-border, #454545)"
            strokeWidth="1.5"
          />

          {/* Area Fill if Area chart */}
          {chartType === 'area' && (
            <path d={areaD} fill="url(#areaGradient)" className="transition-all duration-200" />
          )}

          {/* Line Path */}
          <path
            d={pathD}
            fill="none"
            stroke={primaryColor}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Data Points */}
          {points.map((p, i) => {
            const isHovered = hoveredIdx === i;
            return (
              <g
                key={i}
                onMouseEnter={() => setHoveredIdx(i)}
                className="cursor-pointer"
              >
                {/* Vertical hover guide */}
                {isHovered && (
                  <line
                    x1={p.x}
                    y1={margin.top}
                    x2={p.x}
                    y2={margin.top + chartH}
                    stroke="rgba(255,255,255,0.3)"
                    strokeDasharray="2 2"
                  />
                )}

                <circle
                  cx={p.x}
                  cy={p.y}
                  r={isHovered ? 6.5 : 4}
                  fill={isHovered ? '#ffffff' : primaryColor}
                  stroke="var(--vscode-editor-background, #1e1e1e)"
                  strokeWidth="2"
                  className="transition-all duration-150"
                />

                {/* Data Value Label */}
                {showDataLabels && (
                  <text
                    x={p.x}
                    y={p.y - 9}
                    textAnchor="middle"
                    className="text-[10px] font-mono fill-vscode-fg font-semibold"
                  >
                    {formatMetricNumber(p.d.value)}
                  </text>
                )}

                {/* Category X Label */}
                {i % skipInterval === 0 && (
                  <text
                    x={shouldRotate ? p.x - 4 : p.x}
                    y={shouldRotate ? margin.top + chartH + 12 : margin.top + chartH + 18}
                    textAnchor={shouldRotate ? 'end' : 'middle'}
                    className="text-[11px] fill-vscode-fg/80"
                    transform={
                      shouldRotate
                        ? `rotate(-40, ${p.x - 4}, ${margin.top + chartH + 12})`
                        : undefined
                    }
                  >
                    <title>{p.d.label}</title>
                    {p.d.label.length > 15 ? p.d.label.substring(0, 13) + '…' : p.d.label}
                  </text>
                )}
              </g>
            );
          })}

          {/* Axis Labels */}
          {yAxisLabel && (
            <text
              x={14}
              y={margin.top + chartH / 2}
              textAnchor="middle"
              transform={`rotate(-90, 14, ${margin.top + chartH / 2})`}
              className="text-xs fill-vscode-fg/70 font-semibold"
            >
              {yAxisLabel}
            </text>
          )}
          {xAxisLabel && (
            <text
              x={margin.left + chartW / 2}
              y={height - 10}
              textAnchor="middle"
              className="text-xs fill-vscode-fg/70 font-semibold"
            >
              {xAxisLabel}
            </text>
          )}
        </svg>

        {hoveredIdx !== null && mousePos && (
          <TooltipOverlay
            mousePos={mousePos}
            item={data[hoveredIdx]}
            totalSum={totalSum}
            color={primaryColor}
          />
        )}
      </div>
    );
  }

  // --- RENDER 5: DONUT / PIE CHART ---
  if (chartType === 'donut') {
    const cx = 250;
    const cy = height / 2;
    const outerRadius = 140;
    const innerRadius = 75; // Donut hole

    // Calculate slice angles
    let currentAngle = -Math.PI / 2;
    const slices = data.map((d, i) => {
      const sliceAngle = totalSum > 0 ? (d.value / totalSum) * 2 * Math.PI : 0;
      const start = currentAngle;
      const end = currentAngle + sliceAngle;
      currentAngle = end;

      const path = describeArc(cx, cy, outerRadius, innerRadius, start, end);
      const color = colors[i % colors.length];
      const pct = totalSum > 0 ? ((d.value / totalSum) * 100).toFixed(1) : '0';

      return {
        item: d,
        path,
        color,
        pct,
        index: i,
      };
    });

    return (
      <div className="relative w-full h-full flex items-center justify-center p-2">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-full max-h-[500px] select-none"
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          {/* Donut Slices */}
          <g>
            {slices.map((slice) => {
              const isHovered = hoveredIdx === slice.index;
              return (
                <path
                  key={slice.index}
                  d={slice.path}
                  fill={slice.color}
                  stroke="var(--vscode-editor-background, #1e1e1e)"
                  strokeWidth="2"
                  className="cursor-pointer transition-all duration-200"
                  opacity={hoveredIdx === null || isHovered ? 1 : 0.45}
                  transform={isHovered ? 'scale(1.03) translate(-7.5, -6.5)' : undefined}
                  onMouseEnter={() => setHoveredIdx(slice.index)}
                />
              );
            })}

            {/* Donut Center Hole Summary */}
            <text
              x={cx}
              y={cy - 6}
              textAnchor="middle"
              className="text-xl font-bold font-mono fill-vscode-fg"
            >
              {formatMetricNumber(totalSum)}
            </text>
            <text
              x={cx}
              y={cy + 16}
              textAnchor="middle"
              className="text-xs fill-vscode-fg/60 font-medium uppercase tracking-wider"
            >
              Total
            </text>
          </g>

          {/* Right-hand side legend */}
          <g transform="translate(450, 40)">
            <text x="0" y="0" className="text-xs font-semibold fill-vscode-fg/70 uppercase tracking-wide">
              Distribution & Percentages
            </text>
            {data.slice(0, 10).map((d, i) => {
              const color = colors[i % colors.length];
              const pct = totalSum > 0 ? ((d.value / totalSum) * 100).toFixed(1) : '0';
              const isHovered = hoveredIdx === i;

              return (
                <g
                  key={i}
                  transform={`translate(0, ${25 + i * 28})`}
                  className="cursor-pointer transition-opacity"
                  opacity={hoveredIdx === null || isHovered ? 1 : 0.4}
                  onMouseEnter={() => setHoveredIdx(i)}
                >
                  <rect x="0" y="0" width="12" height="12" rx="3" fill={color} />
                  <text x="20" y="10" className="text-xs fill-vscode-fg font-medium">
                    <title>{d.label}</title>
                    {d.label.length > 18 ? d.label.substring(0, 16) + '…' : d.label}
                  </text>
                  <text x="220" y="10" textAnchor="end" className="text-xs font-mono fill-vscode-fg/80">
                    {formatMetricNumber(d.value)}
                  </text>
                  <text x="280" y="10" textAnchor="end" className="text-xs font-mono font-semibold fill-vscode-info">
                    {pct}%
                  </text>
                </g>
              );
            })}
          </g>
        </svg>

        {hoveredIdx !== null && mousePos && (
          <TooltipOverlay
            mousePos={mousePos}
            item={data[hoveredIdx]}
            totalSum={totalSum}
            color={colors[hoveredIdx % colors.length]}
          />
        )}
      </div>
    );
  }

  // --- RENDER 6: SCATTER PLOT ---
  if (chartType === 'scatter') {
    const margin = { top: 35, right: 40, bottom: 70, left: 75 };
    const chartW = width - margin.left - margin.right;
    const chartH = height - margin.top - margin.bottom;

    // X scale (from secondaryValue or row index)
    let minX = Infinity;
    let maxX = -Infinity;
    data.forEach((d, idx) => {
      const xVal = d.secondaryValue !== undefined ? d.secondaryValue : idx + 1;
      if (xVal < minX) {minX = xVal;}
      if (xVal > maxX) {maxX = xVal;}
    });
    if (minX === maxX) {maxX = minX + 1;}

    return (
      <div className="relative w-full h-full flex items-center justify-center p-2">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-full max-h-[500px] select-none"
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          {/* Horizontal Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => {
            const y = margin.top + chartH - ratio * chartH;
            const val = minVal + ratio * (maxVal - minVal);
            return (
              <g key={i}>
                {showGridLines && (
                  <line
                    x1={margin.left}
                    y1={y}
                    x2={width - margin.right}
                    y2={y}
                    stroke="var(--vscode-charts-lines, rgba(255,255,255,0.08))"
                    strokeDasharray="3 3"
                  />
                )}
                <text
                  x={margin.left - 10}
                  y={y + 4}
                  textAnchor="end"
                  className="text-[11px] fill-vscode-fg/60 font-mono"
                >
                  {formatMetricNumber(val)}
                </text>
              </g>
            );
          })}

          {/* Vertical Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => {
            const x = margin.left + ratio * chartW;
            const val = minX + ratio * (maxX - minX);
            return (
              <g key={i}>
                {showGridLines && (
                  <line
                    x1={x}
                    y1={margin.top}
                    x2={x}
                    y2={margin.top + chartH}
                    stroke="var(--vscode-charts-lines, rgba(255,255,255,0.08))"
                    strokeDasharray="3 3"
                  />
                )}
                <text
                  x={x}
                  y={margin.top + chartH + 18}
                  textAnchor="middle"
                  className="text-[11px] fill-vscode-fg/60 font-mono"
                >
                  {formatMetricNumber(val)}
                </text>
              </g>
            );
          })}

          {/* Scatter Bubbles */}
          {data.map((d, i) => {
            const xVal = d.secondaryValue !== undefined ? d.secondaryValue : i + 1;
            const xRatio = (xVal - minX) / (maxX - minX);
            const yRatio = (d.value - minVal) / (maxVal - minVal);

            const cx = margin.left + xRatio * chartW;
            const cy = margin.top + chartH - yRatio * chartH;
            const color = colors[i % colors.length];
            const isHovered = hoveredIdx === i;

            return (
              <g
                key={i}
                onMouseEnter={() => setHoveredIdx(i)}
                className="cursor-pointer"
              >
                {isHovered && (
                  <>
                    <line
                      x1={margin.left}
                      y1={cy}
                      x2={width - margin.right}
                      y2={cy}
                      stroke="rgba(255,255,255,0.2)"
                      strokeDasharray="2 2"
                    />
                    <line
                      x1={cx}
                      y1={margin.top}
                      x2={cx}
                      y2={margin.top + chartH}
                      stroke="rgba(255,255,255,0.2)"
                      strokeDasharray="2 2"
                    />
                  </>
                )}

                <circle
                  cx={cx}
                  cy={cy}
                  r={isHovered ? 8 : 5}
                  fill={color}
                  fillOpacity="0.75"
                  stroke={isHovered ? '#ffffff' : color}
                  strokeWidth="2"
                  className="transition-all duration-150"
                />
              </g>
            );
          })}

          {/* Axis Labels */}
          {yAxisLabel && (
            <text
              x={14}
              y={margin.top + chartH / 2}
              textAnchor="middle"
              transform={`rotate(-90, 14, ${margin.top + chartH / 2})`}
              className="text-xs fill-vscode-fg/70 font-semibold"
            >
              {yAxisLabel}
            </text>
          )}
          {xAxisLabel && (
            <text
              x={margin.left + chartW / 2}
              y={height - 12}
              textAnchor="middle"
              className="text-xs fill-vscode-fg/70 font-semibold"
            >
              {xAxisLabel}
            </text>
          )}
        </svg>

        {hoveredIdx !== null && mousePos && (
          <TooltipOverlay
            mousePos={mousePos}
            item={data[hoveredIdx]}
            totalSum={totalSum}
            color={colors[hoveredIdx % colors.length]}
          />
        )}
      </div>
    );
  }

  return null;
};

// Reusable hover tooltip overlay
const TooltipOverlay: React.FC<{
  mousePos: { x: number; y: number };
  item: ChartDataItem;
  totalSum: number;
  color: string;
  viewHeight?: number;
}> = ({ mousePos, item, totalSum, color, viewHeight = 480 }) => {
  const pct = totalSum > 0 ? ((item.value / totalSum) * 100).toFixed(1) : null;

  return (
    <div
      style={{
        left: `${(mousePos.x / 800) * 100}%`,
        top: `${(mousePos.y / viewHeight) * 100}%`,
        transform: 'translate(-50%, -125%)',
      }}
      className="absolute pointer-events-none z-30 bg-vscode-tooltipBg border border-vscode-border rounded-lg shadow-xl px-3 py-2 text-xs backdrop-blur-md transition-all duration-75 whitespace-nowrap min-w-[140px]"
    >
      <div className="flex items-center gap-2 mb-1 border-b border-vscode-border/50 pb-1">
        <span
          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
          style={{ backgroundColor: color }}
        ></span>
        <span className="font-semibold text-vscode-fg truncate max-w-[180px]">
          {item.label}
        </span>
      </div>
      <div className="flex items-center justify-between gap-4 text-vscode-fg/80">
        <span>Value:</span>
        <span className="font-mono font-bold text-vscode-fg">
          {item.value.toLocaleString()}
        </span>
      </div>
      {pct && (
        <div className="flex items-center justify-between gap-4 text-vscode-fg/70 mt-0.5">
          <span>Share:</span>
          <span className="font-mono text-vscode-info font-semibold">{pct}%</span>
        </div>
      )}
      {item.secondaryValue !== undefined && (
        <div className="flex items-center justify-between gap-4 text-vscode-fg/70 mt-0.5">
          <span>X Value:</span>
          <span className="font-mono text-vscode-fg">
            {item.secondaryValue.toLocaleString()}
          </span>
        </div>
      )}
    </div>
  );
};
