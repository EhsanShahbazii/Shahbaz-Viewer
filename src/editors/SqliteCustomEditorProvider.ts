import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { SqliteEngine } from '../database/engine';
import { DataExporter } from '../database/export';
import { WebviewToHostMessage } from '../common/messages';
import { getExportTimestamp, insertTimestamp } from '../common/timestamp';

export class SqliteCustomEditorProvider implements vscode.CustomReadonlyEditorProvider {
  public static readonly viewType = 'shahbazViewer.editor';

  constructor(private readonly context: vscode.ExtensionContext) {}

  public static register(context: vscode.ExtensionContext): vscode.Disposable {
    const provider = new SqliteCustomEditorProvider(context);
    return vscode.window.registerCustomEditorProvider(
      SqliteCustomEditorProvider.viewType,
      provider,
      {
        webviewOptions: {
          retainContextWhenHidden: true,
        },
        supportsMultipleEditorsPerDocument: false,
      }
    );
  }

  public async openCustomDocument(
    uri: vscode.Uri,
    _openContext: vscode.CustomDocumentOpenContext,
    _token: vscode.CancellationToken
  ): Promise<vscode.CustomDocument> {
    return { uri, dispose: () => {} };
  }

  public async resolveCustomEditor(
    document: vscode.CustomDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): Promise<void> {
    const engine = new SqliteEngine();

    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.file(path.join(this.context.extensionPath, 'dist')),
      ],
    };

    // Set webview HTML
    webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview);

    // Initialize engine with wasm
    const wasmDir = path.join(this.context.extensionPath, 'dist');
    await SqliteEngine.init(wasmDir);

    let currentActiveTable: string | undefined;

    // Read and load database
    const loadDb = async (preferredTable?: string) => {
      try {
        let fileData: Uint8Array;
        if (document.uri.scheme === 'file') {
          fileData = fs.readFileSync(document.uri.fsPath);
        } else {
          fileData = await vscode.workspace.fs.readFile(document.uri);
        }

        engine.load(fileData, document.uri.fsPath);
        const metadata = engine.getMetadata();
        webviewPanel.webview.postMessage({
          type: 'init',
          payload: metadata,
        });

        // Determine which table to load:
        // 1. Preferred table (if passed and valid)
        // 2. Currently active table (if valid in new metadata)
        // 3. First table in metadata
        const targetTable =
          preferredTable && metadata.tables.some((t) => t.name === preferredTable)
            ? preferredTable
            : currentActiveTable && metadata.tables.some((t) => t.name === currentActiveTable)
            ? currentActiveTable
            : metadata.tables.length > 0
            ? metadata.tables[0].name
            : undefined;

        if (targetTable) {
          currentActiveTable = targetTable;
          const tableData = engine.getTableData(targetTable, 0, 50);
          webviewPanel.webview.postMessage({
            type: 'tableData',
            payload: {
              tableName: targetTable,
              ...tableData,
              page: 0,
              pageSize: 50,
            },
          });
        }
      } catch (err: any) {
        const isAllocFail = String(err?.message || '').toLowerCase().includes('allocation failed');
        const errorMsg = isAllocFail
          ? `Failed to open SQLite database: The database file may be too large to allocate in WebAssembly memory. (${err.message})`
          : `Failed to open SQLite database: ${err.message}`;
        vscode.window.showErrorMessage(errorMsg);
        webviewPanel.webview.postMessage({
          type: 'error',
          payload: { message: errorMsg },
        });
      }
    };

    // Listen for file changes on the database
    const fileWatcher = vscode.workspace.createFileSystemWatcher(document.uri.fsPath);
    fileWatcher.onDidChange(() => {
      // Reload metadata and preserve the active table
      loadDb(currentActiveTable);
    });

    webviewPanel.onDidDispose(() => {
      fileWatcher.dispose();
      engine.close();
    });

    // Handle messages from Webview
    webviewPanel.webview.onDidReceiveMessage(async (message: WebviewToHostMessage) => {
      try {
        switch (message.type) {
          case 'ready': {
            await loadDb(currentActiveTable);
            break;
          }

          case 'refresh': {
            const target = message.payload?.tableName || currentActiveTable;
            await loadDb(target);
            break;
          }

          case 'selectTable': {
            currentActiveTable = message.payload.tableName;
            const {
              tableName,
              page,
              pageSize,
              sortColumn,
              sortDirection,
              filterText,
              filterRules,
              filterConjunction,
            } = message.payload;
            const data = engine.getTableData(
              tableName,
              page,
              pageSize,
              sortColumn,
              sortDirection,
              filterText,
              filterRules,
              filterConjunction
            );
            webviewPanel.webview.postMessage({
              type: 'tableData',
              payload: {
                tableName,
                ...data,
                page,
                pageSize,
              },
            });
            break;
          }

          case 'executeQuery': {
            const { query } = message.payload;
            const result = engine.executeQuery(query);
            webviewPanel.webview.postMessage({
              type: 'queryResult',
              payload: {
                query,
                ...result,
              },
            });
            break;
          }

          case 'executeChartQuery': {
            const { query, chartId } = message.payload;
            const result = engine.executeQuery(query);
            webviewPanel.webview.postMessage({
              type: 'chartQueryResult',
              payload: {
                query,
                ...result,
                chartId,
              },
            });
            break;
          }

          case 'openImportFileDialog': {
            const uris = await vscode.window.showOpenDialog({
              canSelectMany: false,
              filters: {
                'Data Files (CSV, TSV, JSON)': ['csv', 'tsv', 'json', 'jsonl', 'ndjson', 'txt'],
              },
              openLabel: 'Select File to Import',
            });
            if (uris && uris.length > 0) {
              const fileUri = uris[0];
              const fileBytes = await vscode.workspace.fs.readFile(fileUri);
              const content = Buffer.from(fileBytes).toString('utf-8');
              const filename = path.basename(fileUri.fsPath);
              webviewPanel.webview.postMessage({
                type: 'importFileSelected',
                payload: {
                  filename,
                  content,
                },
              });
            }
            break;
          }

          case 'executeImport': {
            const options = message.payload;
            const res = engine.importData(options);
            webviewPanel.webview.postMessage({
              type: 'importResult',
              payload: res,
            });

            if (res.success) {
              vscode.window.showInformationMessage(
                `Successfully imported ${res.count.toLocaleString()} rows into "${res.tableName}".`
              );
              // Send refreshed database metadata
              const refreshedMeta = engine.getMetadata();
              webviewPanel.webview.postMessage({
                type: 'init',
                payload: refreshedMeta,
              });
              // Send refreshed table data for the imported table
              const refreshedData = engine.getTableData(res.tableName, 0, 50);
              webviewPanel.webview.postMessage({
                type: 'tableData',
                payload: {
                  tableName: res.tableName,
                  ...refreshedData,
                  page: 0,
                  pageSize: 50,
                },
              });
            } else {
              vscode.window.showErrorMessage(
                `Import failed: ${res.error || 'Unknown error'}`
              );
            }
            break;
          }

          case 'explainQuery': {
            const { query } = message.payload;
            const result = engine.explainQuery(query);
            webviewPanel.webview.postMessage({
              type: 'explainResult',
              payload: {
                query,
                ...result,
              },
            });
            break;
          }

          case 'commitChanges': {
            const { tableName, changes } = message.payload;
            const res = engine.commitChanges(tableName, changes);
            webviewPanel.webview.postMessage({
              type: 'commitResult',
              payload: res,
            });

            if (res.success) {
              vscode.window.showInformationMessage(
                res.message || 'Changes saved successfully.'
              );
              // Refresh table data
              const refreshed = engine.getTableData(tableName, 0, 50);
              webviewPanel.webview.postMessage({
                type: 'tableData',
                payload: {
                  tableName,
                  ...refreshed,
                  page: 0,
                  pageSize: 50,
                },
              });
            } else {
              vscode.window.showErrorMessage(`Failed to commit: ${res.error}`);
            }
            break;
          }

          case 'exportData': {
            const { tableName, format } = message.payload;
            // Fetch all rows for export
            const allData = engine.getTableData(tableName, 0, 100000);
            let content = '';
            let fileExt = format;
            if (format === 'markdown') {fileExt = 'md';}
            if (format === 'ts') {fileExt = 'ts';}

            switch (format) {
              case 'csv':
                content = DataExporter.toCsv(allData.rows, allData.columns);
                break;
              case 'json':
                content = DataExporter.toJson(allData.rows);
                break;
              case 'markdown':
                content = DataExporter.toMarkdown(allData.rows, allData.columns);
                break;
              case 'sql':
                content = DataExporter.toSqlInsert(tableName, allData.rows, allData.columns);
                break;
              case 'ts':
                content = DataExporter.toTypeScriptInterface(tableName, allData.columns);
                break;
            }

            // Determine project folder
            const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
            const projectDir = workspaceFolder
              ? workspaceFolder.uri
              : vscode.Uri.file(path.dirname(document.uri.fsPath));
            const defaultFileName = `${tableName}_export_${getExportTimestamp()}.${fileExt}`;
            const targetUri = vscode.Uri.joinPath(projectDir, defaultFileName);

            // Copy to clipboard, save to project folder, or open in editor
            const action = await vscode.window.showQuickPick(
              [
                {
                  label: `$(cloud-download) Save to Project Folder (${defaultFileName})`,
                  detail: `Save directly to ${projectDir.fsPath}`,
                  value: 'saveDirect',
                },
                {
                  label: '$(save-as) Save to Custom File...',
                  detail: 'Choose specific file location and name',
                  value: 'saveCustom',
                },
                {
                  label: '$(file-code) Open in New Editor Tab',
                  detail: 'Open in a new untitled editor beside database viewer',
                  value: 'open',
                },
                {
                  label: '$(clippy) Copy to Clipboard',
                  detail: 'Copy full exported data to system clipboard',
                  value: 'copy',
                },
              ],
              { placeHolder: `Export ${tableName} (${format.toUpperCase()})` }
            );

            if (action?.value === 'saveDirect') {
              await vscode.workspace.fs.writeFile(
                targetUri,
                Buffer.from(content, 'utf-8')
              );
              const choice = await vscode.window.showInformationMessage(
                `Exported ${defaultFileName} to: ${targetUri.fsPath}`,
                'Open File',
                'Reveal in File Explorer'
              );
              if (choice === 'Open File') {
                await vscode.commands.executeCommand('vscode.open', targetUri);
              } else if (choice === 'Reveal in File Explorer') {
                await vscode.commands.executeCommand('revealFileInOS', targetUri);
              }
            } else if (action?.value === 'saveCustom') {
              const saveUri = await vscode.window.showSaveDialog({
                defaultUri: targetUri,
                filters: {
                  [`${format.toUpperCase()} Files`]: [fileExt],
                },
              });
              if (saveUri) {
                await vscode.workspace.fs.writeFile(
                  saveUri,
                  Buffer.from(content, 'utf-8')
                );
                const choice = await vscode.window.showInformationMessage(
                  `Exported to: ${saveUri.fsPath}`,
                  'Open File',
                  'Reveal in File Explorer'
                );
                if (choice === 'Open File') {
                  await vscode.commands.executeCommand('vscode.open', saveUri);
                } else if (choice === 'Reveal in File Explorer') {
                  await vscode.commands.executeCommand('revealFileInOS', saveUri);
                }
              }
            } else if (action?.value === 'open') {
              const lang =
                format === 'ts'
                  ? 'typescript'
                  : format === 'sql'
                  ? 'sql'
                  : format === 'json'
                  ? 'json'
                  : 'markdown';
              const doc = await vscode.workspace.openTextDocument({
                content,
                language: lang,
              });
              await vscode.window.showTextDocument(doc);
            } else if (action?.value === 'copy') {
              await vscode.env.clipboard.writeText(content);
              vscode.window.showInformationMessage(
                `Copied ${format.toUpperCase()} to clipboard!`
              );
            }
            break;
          }

          case 'exportImage': {
            const { fileName, format, base64Data, svgString } = message.payload;
            try {
              const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
              const projectDir = workspaceFolder
                ? workspaceFolder.uri
                : vscode.Uri.file(path.dirname(document.uri.fsPath));
              const finalFileName = fileName.includes('_202') ? fileName : insertTimestamp(fileName);
              const targetUri = vscode.Uri.joinPath(projectDir, finalFileName);

              let fileBuffer: Buffer;
              if ((format === 'png' || format === 'pdf') && base64Data) {
                const cleanBase64 = base64Data.replace(/^data:[^;]+;base64,/, '');
                fileBuffer = Buffer.from(cleanBase64, 'base64');
              } else {
                fileBuffer = Buffer.from(svgString || '', 'utf-8');
              }

              await vscode.workspace.fs.writeFile(targetUri, fileBuffer);
              const choice = await vscode.window.showInformationMessage(
                `Exported ${format.toUpperCase()} to: ${targetUri.fsPath}`,
                'Open File',
                'Reveal in File Explorer'
              );
              if (choice === 'Open File') {
                await vscode.commands.executeCommand('vscode.open', targetUri);
              } else if (choice === 'Reveal in File Explorer') {
                await vscode.commands.executeCommand('revealFileInOS', targetUri);
              }
            } catch (err: any) {
              vscode.window.showErrorMessage(`Failed to export image: ${err.message}`);
            }
            break;
          }

          case 'fetchForeignKeyRecord': {
            const { requestId, targetTable, targetColumn, value } = message.payload;
            try {
              const record = engine.getForeignKeyRecord(targetTable, targetColumn, value);
              webviewPanel.webview.postMessage({
                type: 'foreignKeyRecordResult',
                payload: { requestId, record },
              });
            } catch (err: any) {
              webviewPanel.webview.postMessage({
                type: 'foreignKeyRecordResult',
                payload: { requestId, record: null, error: err.message },
              });
            }
            break;
          }

          case 'generateMockData': {
            const { tableName, count, insertDirectly } = message.payload;
            try {
              const generatedRows = engine.generateMockData(tableName, count);

              if (insertDirectly) {
                const insertRes = engine.insertMockData(tableName, generatedRows);
                if (insertRes.success) {
                  vscode.window.showInformationMessage(
                    `Successfully inserted ${insertRes.count} mock rows into "${tableName}".`
                  );
                  // Refresh table data
                  const refreshed = engine.getTableData(tableName, 0, 50);
                  webviewPanel.webview.postMessage({
                    type: 'tableData',
                    payload: {
                      tableName,
                      ...refreshed,
                      page: 0,
                      pageSize: 50,
                    },
                  });
                } else {
                  vscode.window.showErrorMessage(`Failed to insert mock data: ${insertRes.error}`);
                }
                webviewPanel.webview.postMessage({
                  type: 'mockDataGenerated',
                  payload: {
                    tableName,
                    count: insertRes.count,
                    inserted: insertRes.success,
                    error: insertRes.error,
                  },
                });
              } else {
                webviewPanel.webview.postMessage({
                  type: 'mockDataGenerated',
                  payload: {
                    tableName,
                    count: generatedRows.length,
                    rows: generatedRows,
                    inserted: false,
                  },
                });
              }
            } catch (err: any) {
              vscode.window.showErrorMessage(`Mock data generation failed: ${err.message}`);
              webviewPanel.webview.postMessage({
                type: 'mockDataGenerated',
                payload: {
                  tableName,
                  count: 0,
                  inserted: false,
                  error: err.message,
                },
              });
            }
            break;
          }

          case 'openInEditor': {
            const { content, language } = message.payload;
            const doc = await vscode.workspace.openTextDocument({
              content,
              language,
            });
            await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
            break;
          }
        }
      } catch (err: any) {
        webviewPanel.webview.postMessage({
          type: 'error',
          payload: { message: err.message || String(err) },
        });
      }
    });
  }

  private getHtmlForWebview(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.file(path.join(this.context.extensionPath, 'dist/webview', 'index.js'))
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.file(path.join(this.context.extensionPath, 'dist/webview/assets', 'index.css'))
    );
    const codiconsUri = webview.asWebviewUri(
      vscode.Uri.file(
        path.join(this.context.extensionPath, 'dist/codicons/codicon.css')
      )
    );

    const nonce = getNonce();

    return /* html */ `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; font-src ${webview.cspSource} data: blob:; img-src ${webview.cspSource} https: data: blob:; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <link rel="stylesheet" href="${codiconsUri}">
        <link rel="stylesheet" href="${styleUri}">
        <title>SQLite Super Viewer</title>
      </head>
      <body class="bg-vscode-bg text-vscode-fg overflow-hidden select-none font-sans text-vscode">
        <div id="root" class="h-screen w-screen flex flex-col"></div>
        <script nonce="${nonce}" src="${scriptUri}"></script>
      </body>
      </html>
    `;
  }
}

function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
