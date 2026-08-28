import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

const BaseTreeItem = (typeof vscode !== 'undefined' && vscode?.TreeItem)
  ? vscode.TreeItem
  : (class {
      label?: string;
      description?: string;
      tooltip?: string;
      iconPath?: any;
      contextValue?: string;
      command?: any;
      collapsibleState?: number;
      constructor(label: string, collapsibleState?: number) {
        this.label = label;
        this.collapsibleState = collapsibleState;
      }
    } as unknown as typeof vscode.TreeItem);

export class DatabaseTreeItem extends BaseTreeItem {
  constructor(
    public readonly uri: vscode.Uri,
    public readonly fileSize: number
  ) {
    const filename = uri?.fsPath ? path.basename(uri.fsPath) : 'database.db';
    super(filename, vscode?.TreeItemCollapsibleState?.None ?? 0);

    const relativeFolder = vscode?.workspace?.asRelativePath
      ? vscode.workspace.asRelativePath(path.dirname(uri.fsPath))
      : '.';
    this.description = relativeFolder === '.' ? this.formatBytes(fileSize) : `${relativeFolder} • ${this.formatBytes(fileSize)}`;
    this.tooltip = `${uri?.fsPath || ''}\nSize: ${this.formatBytes(fileSize)}`;
    this.iconPath = vscode?.ThemeIcon ? new vscode.ThemeIcon('database') : undefined;
    this.contextValue = 'sqliteDatabase';

    this.command = {
      command: 'vscode.openWith',
      title: 'Open in Shahbaz Viewer',
      arguments: [this.uri, 'shahbazViewer.editor'],
    };
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }
}

export class DatabasesTreeDataProvider implements vscode.TreeDataProvider<DatabaseTreeItem> {
  private _onDidChangeTreeData = typeof vscode !== 'undefined' && vscode?.EventEmitter
    ? new vscode.EventEmitter<DatabaseTreeItem | undefined | void>()
    : null;
  readonly onDidChangeTreeData = this._onDidChangeTreeData ? this._onDidChangeTreeData.event : (() => ({ dispose: () => {} })) as any;

  constructor() {
    if (vscode?.workspace?.createFileSystemWatcher) {
      const watcher = vscode.workspace.createFileSystemWatcher('**/*.{db,sqlite,sqlite3,db3,s3db,sl3}');
      watcher.onDidCreate(() => this.refresh());
      watcher.onDidDelete(() => this.refresh());
      watcher.onDidChange(() => this.refresh());
    }
  }

  refresh(): void {
    if (this._onDidChangeTreeData) {
      this._onDidChangeTreeData.fire();
    }
  }

  getTreeItem(element: DatabaseTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(): Promise<DatabaseTreeItem[]> {
    try {
      if (!vscode?.workspace?.findFiles) return [];
      const files = await vscode.workspace.findFiles(
        '**/*.{db,sqlite,sqlite3,db3,s3db,sl3}',
        '**/node_modules/**'
      );

      const items: DatabaseTreeItem[] = [];
      for (const file of files) {
        try {
          const stat = fs.statSync(file.fsPath);
          items.push(new DatabaseTreeItem(file, stat.size));
        } catch {
          items.push(new DatabaseTreeItem(file, 0));
        }
      }

      items.sort((a, b) => ((a.label as string) || '').localeCompare((b.label as string) || ''));
      return items;
    } catch (err) {
      console.error('Error finding database files:', err);
      return [];
    }
  }
}
