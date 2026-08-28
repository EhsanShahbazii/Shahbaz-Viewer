import { ChartDataPoint, ChartType } from '../../types';
import { getExportThemeColors } from '../../utils/theme';

// Color palettes for data visualization
export type ColorPaletteName = 'vscode' | 'cyberpunk' | 'emerald' | 'sunset' | 'ocean';

export interface ColorPalette {
  name: ColorPaletteName;
  label: string;
  colors: string[];
}

export const COLOR_PALETTES: Record<ColorPaletteName, ColorPalette> = {
  vscode: {
    name: 'vscode',
    label: 'VS Code Theme',
    colors: [
      'var(--vscode-charts-blue, #3794ff)',
      'var(--vscode-charts-purple, #b180d7)',
      'var(--vscode-charts-orange, #d18616)',
      'var(--vscode-charts-green, #388a34)',
      'var(--vscode-charts-red, #f14c4c)',
      'var(--vscode-charts-yellow, #cca700)',
      '#4ec9b0',
      '#9cdcfe',
      '#ce9178',
      '#c586c0',
    ],
  },
  cyberpunk: {
    name: 'cyberpunk',
    label: 'Cyberpunk Neon',
    colors: [
      '#00f2fe',
      '#f72585',
      '#7209b7',
      '#fee440',
      '#4cc9f0',
      '#ff007f',
      '#3a0ca3',
      '#4361ee',
      '#06d6a0',
      '#ffb703',
    ],
  },
  emerald: {
    name: 'emerald',
    label: 'Emerald Forest',
    colors: [
      '#10b981',
      '#14b8a6',
      '#059669',
      '#34d399',
      '#0f766e',
      '#2dd4bf',
      '#6ee7b7',
      '#047857',
      '#a7f3d0',
      '#134e4a',
    ],
  },
  sunset: {
    name: 'sunset',
    label: 'Sunset Flare',
    colors: [
      '#f97316',
      '#f43f5e',
      '#fbbf24',
      '#e11d48',
      '#c026d3',
      '#fb923c',
      '#fda4af',
      '#be123c',
      '#d97706',
      '#ec4899',
    ],
  },
  ocean: {
    name: 'ocean',
    label: 'Ocean Breeze',
    colors: [
      '#3b82f6',
      '#0ea5e9',
      '#6366f1',
      '#06b6d4',
      '#2563eb',
      '#38bdf8',
      '#818cf8',
      '#1d4ed8',
      '#67e8f9',
      '#4338ca',
    ],
  },
};

// Formats big numbers cleanly (e.g. 1500 -> 1.5K, 2300000 -> 2.3M)
export function formatMetricNumber(val: number): string {
  if (isNaN(val) || val === null || val === undefined) {return '0';}
  const abs = Math.abs(val);
  if (abs >= 1_000_000_000) {
    return (val / 1_000_000_000).toFixed(1).replace(/\.0$/, '') + 'B';
  }
  if (abs >= 1_000_000) {
    return (val / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  }
  if (abs >= 10_000) {
    return (val / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
  }
  if (Number.isInteger(val)) {
    return val.toLocaleString();
  }
  return val.toFixed(2);
}

// Generates SVG path for a donut slice
export function describeArc(
  cx: number,
  cy: number,
  radius: number,
  innerRadius: number,
  startAngle: number,
  endAngle: number
): string {
  // Clamp full circle
  if (endAngle - startAngle >= 2 * Math.PI - 0.0001) {
    endAngle = startAngle + 2 * Math.PI - 0.0001;
  }

  const startOuterX = cx + radius * Math.cos(startAngle);
  const startOuterY = cy + radius * Math.sin(startAngle);
  const endOuterX = cx + radius * Math.cos(endAngle);
  const endOuterY = cy + radius * Math.sin(endAngle);

  const startInnerX = cx + innerRadius * Math.cos(endAngle);
  const startInnerY = cy + innerRadius * Math.sin(endAngle);
  const endInnerX = cx + innerRadius * Math.cos(startAngle);
  const endInnerY = cy + innerRadius * Math.sin(startAngle);

  const largeArcFlag = endAngle - startAngle <= Math.PI ? '0' : '1';

  if (innerRadius === 0) {
    return [
      `M ${cx} ${cy}`,
      `L ${startOuterX} ${startOuterY}`,
      `A ${radius} ${radius} 0 ${largeArcFlag} 1 ${endOuterX} ${endOuterY}`,
      'Z',
    ].join(' ');
  }

  return [
    `M ${startOuterX} ${startOuterY}`,
    `A ${radius} ${radius} 0 ${largeArcFlag} 1 ${endOuterX} ${endOuterY}`,
    `L ${startInnerX} ${startInnerY}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 0 ${endInnerX} ${endInnerY}`,
    'Z',
  ].join(' ');
}

// Generate smooth cubic bezier curve through points
export function getSmoothCurvePath(points: { x: number; y: number }[]): string {
  if (points.length === 0) {return '';}
  if (points.length === 1) {return `M ${points[0].x} ${points[0].y}`;}

  let d = `M ${points[0].x},${points[0].y}`;

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i === 0 ? 0 : i - 1];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || p2;

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    d += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
  }

  return d;
}

// Export SVG element to standalone file
export function exportSvgToFile(svgElement: SVGSVGElement, filename: string = 'chart.svg') {
  const serializer = new XMLSerializer();
  let source = serializer.serializeToString(svgElement);

  // Ensure XML namespace
  if (!source.match(/^<svg[^>]+xmlns="http:\/\/www\.w3\.org\/2000\/svg"/)) {
    source = source.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
  }

  const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(source);
  const downloadLink = document.createElement('a');
  downloadLink.href = url;
  downloadLink.download = filename;
  document.body.appendChild(downloadLink);
  downloadLink.click();
  document.body.removeChild(downloadLink);
}

// Export SVG element to high-res transparent PNG image
export function exportSvgToPng(svgElement: SVGSVGElement, filename: string = 'chart.png', scale: number = 2) {
  const clone = svgElement.cloneNode(true) as SVGSVGElement;
  const origElements = svgElement.querySelectorAll('*');
  const cloneElements = clone.querySelectorAll('*');
  origElements.forEach((origEl, i) => {
    const cloneEl = cloneElements[i] as HTMLElement;
    if (!cloneEl) return;
    const comp = window.getComputedStyle(origEl);
    if (comp.fill && comp.fill !== 'none') {
      cloneEl.setAttribute('fill', comp.fill);
    }
    if (comp.stroke && comp.stroke !== 'none') {
      cloneEl.setAttribute('stroke', comp.stroke);
    }
    cloneEl.style.fontFamily = comp.fontFamily || 'system-ui, -apple-system, sans-serif';
    cloneEl.style.fontSize = comp.fontSize;
    cloneEl.style.fontWeight = comp.fontWeight;
  });

  const serializer = new XMLSerializer();
  let source = serializer.serializeToString(clone);
  if (!source.match(/^<svg[^>]+xmlns="http:\/\/www\.w3\.org\/2000\/svg"/)) {
    source = source.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
  }

  const svgBlob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);

  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement('canvas');
    const width = svgElement.clientWidth || 800;
    const height = svgElement.clientHeight || 450;
    canvas.width = width * scale;
    canvas.height = height * scale;

    const ctx = canvas.getContext('2d');
    if (ctx) {
      const colors = getExportThemeColors();
      ctx.scale(scale, scale);
      ctx.fillStyle = colors.canvasBg;
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob((blob) => {
        if (!blob) {return;}
        const pngUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = pngUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(pngUrl);
      }, 'image/png');
    }
    URL.revokeObjectURL(url);
  };
  img.src = url;
}
