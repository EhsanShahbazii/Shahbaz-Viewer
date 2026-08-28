/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./webview/index.html",
    "./webview/src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        vscode: {
          bg: 'var(--vscode-editor-background)',
          fg: 'var(--vscode-editor-foreground)',
          border: 'var(--vscode-editorWidget-border, var(--vscode-widget-border, #333))',
          hover: 'var(--vscode-list-hoverBackground)',
          active: 'var(--vscode-list-activeSelectionBackground)',
          activeFg: 'var(--vscode-list-activeSelectionForeground)',
          header: 'var(--vscode-editorGroupHeader-tabsBackground)',
          badge: 'var(--vscode-badge-background)',
          badgeFg: 'var(--vscode-badge-foreground)',
          button: 'var(--vscode-button-background)',
          buttonFg: 'var(--vscode-button-foreground)',
          buttonHover: 'var(--vscode-button-hoverBackground)',
          secondaryBtn: 'var(--vscode-button-secondaryBackground)',
          secondaryBtnFg: 'var(--vscode-button-secondaryForeground)',
          secondaryBtnHover: 'var(--vscode-button-secondaryHoverBackground)',
          inputBg: 'var(--vscode-input-background)',
          inputFg: 'var(--vscode-input-foreground)',
          inputBorder: 'var(--vscode-input-border)',
          focusBorder: 'var(--vscode-focusBorder)',
          sidebar: 'var(--vscode-sideBar-background)',
          statusBg: 'var(--vscode-statusBar-background)',
          error: 'var(--vscode-errorForeground, #f43f5e)',
          warning: 'var(--vscode-editorWarning-foreground, #f59e0b)',
          info: 'var(--vscode-editorInfo-foreground, #38bdf8)',
          menuBg: 'var(--vscode-menu-background, var(--vscode-editorWidget-background, #252526))',
          menuFg: 'var(--vscode-menu-foreground, var(--vscode-editorWidget-foreground, #cccccc))',
          menuBorder: 'var(--vscode-menu-border, var(--vscode-editorWidget-border, #454545))',
          menuHoverBg: 'var(--vscode-menu-selectionBackground, var(--vscode-list-hoverBackground, #37373d))',
          menuHoverFg: 'var(--vscode-menu-selectionForeground, var(--vscode-list-hoverForeground, #ffffff))',
        }
      },
      fontFamily: {
        mono: ['var(--vscode-editor-font-family)', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
        sans: ['var(--vscode-font-family)', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      fontSize: {
        'vscode': 'var(--vscode-font-size, 13px)',
      }
    },
  },
  plugins: [],
}
