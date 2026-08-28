/**
 * Theme detection utilities for VS Code webviews.
 * Determines whether the active theme is dark or light to style exports (PNG, SVG, PDF) properly.
 */

export function isDarkTheme(): boolean {
  if (typeof document === 'undefined') return true;

  // VS Code adds body classes 'vscode-dark', 'vscode-light', 'vscode-high-contrast', 'vscode-high-contrast-light'
  if (
    document.body.classList.contains('vscode-dark') ||
    document.body.classList.contains('vscode-high-contrast')
  ) {
    return true;
  }
  if (
    document.body.classList.contains('vscode-light') ||
    document.body.classList.contains('vscode-high-contrast-light')
  ) {
    return false;
  }

  // Fallback: analyze computed background color luminance
  try {
    const bg = window.getComputedStyle(document.body).backgroundColor;
    const match = bg.match(/\d+/g);
    if (match && match.length >= 3) {
      const r = parseInt(match[0], 10);
      const g = parseInt(match[1], 10);
      const b = parseInt(match[2], 10);
      const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
      return luminance < 128;
    }
  } catch {
    // ignore
  }

  return true;
}

export interface ExportThemeColors {
  isDark: boolean;
  canvasBg: string;
  cardBg: string;
  headerBg: string;
  borderColor: string;
  textColor: string;
  mutedColor: string;
  accentColor: string;
  colNameColor: string;
  colTypeColor: string;
  pkColor: string;
  fkColor: string;
  relStroke: string;
}

export function getExportThemeColors(): ExportThemeColors {
  const isDark = isDarkTheme();

  if (isDark) {
    return {
      isDark: true,
      canvasBg: '#1e1e1e',
      cardBg: '#252526',
      headerBg: '#2d2d2d',
      borderColor: '#3e3e42',
      textColor: '#f4f4f5',
      mutedColor: '#a1a1aa',
      accentColor: '#38bdf8',
      colNameColor: '#e4e4e7',
      colTypeColor: '#71717a',
      pkColor: '#fbbf24',
      fkColor: '#38bdf8',
      relStroke: '#64748b',
    };
  }

  return {
    isDark: false,
    canvasBg: '#f8fafc',
    cardBg: '#ffffff',
    headerBg: '#f1f5f9',
    borderColor: '#cbd5e1',
    textColor: '#0f172a',
    mutedColor: '#64748b',
    accentColor: '#0284c7',
    colNameColor: '#1e293b',
    colTypeColor: '#64748b',
    pkColor: '#d97706',
    fkColor: '#0284c7',
    relStroke: '#94a3b8',
  };
}
