import * as vscode from 'vscode';
import { SqliteCustomEditorProvider } from './editors/SqliteCustomEditorProvider';
import { DatabasesTreeDataProvider } from './views/DatabasesTreeDataProvider';

export function activate(context: vscode.ExtensionContext) {
  // Register the custom editor provider for SQLite files
  context.subscriptions.push(SqliteCustomEditorProvider.register(context));

  // Register Activity Bar Tree Data Provider for SQLite Databases
  const databasesProvider = new DatabasesTreeDataProvider();
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('shahbazViewer.databasesView', databasesProvider)
  );

  // Command to refresh databases list
  const refreshHandler = () => databasesProvider.refresh();
  context.subscriptions.push(
    vscode.commands.registerCommand('shahbazViewer.refreshDatabases', refreshHandler),
    vscode.commands.registerCommand('sqliteSuperViewer.refreshDatabases', refreshHandler)
  );

  // Command to open a database file from quick-pick / file dialog
  const openDbHandler = async (uri?: vscode.Uri) => {
    let targetUri = uri;
    if (!targetUri) {
      const fileUris = await vscode.window.showOpenDialog({
        canSelectMany: false,
        openLabel: 'Open in Shahbaz Viewer',
        filters: {
          'SQLite Databases': ['db', 'sqlite', 'sqlite3', 'db3', 's3db', 'sl3'],
          'All Files': ['*'],
        },
      });
      if (fileUris && fileUris.length > 0) {
        targetUri = fileUris[0];
      }
    }

    if (targetUri) {
      await vscode.commands.executeCommand(
        'vscode.openWith',
        targetUri,
        SqliteCustomEditorProvider.viewType
      );
    }
  };

  context.subscriptions.push(
    vscode.commands.registerCommand('shahbazViewer.openDatabase', openDbHandler),
    vscode.commands.registerCommand('sqliteSuperViewer.openDatabase', openDbHandler)
  );
}

export function deactivate() {}

export { SqliteEngine } from './database/engine';
export { DataExporter } from './database/export';
export { OrmGenerator } from './database/ormGenerator';
export { MockDataGenerator } from './database/mockGenerator';
