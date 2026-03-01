import * as vscode from 'vscode';

/**
 * Provides the status TreeView showing server/provider/MCP status
 */
export class StatusTreeProvider implements vscode.TreeDataProvider<StatusTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<StatusTreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: StatusTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: StatusTreeItem): Thenable<StatusTreeItem[]> {
    if (!element) {
      return Promise.resolve([
        new StatusTreeItem('Server', 'Disconnected', vscode.TreeItemCollapsibleState.Collapsed),
        new StatusTreeItem('Providers', '', vscode.TreeItemCollapsibleState.Collapsed),
        new StatusTreeItem('MCP Servers', '', vscode.TreeItemCollapsibleState.Collapsed),
      ]);
    }
    // TODO: Return children based on parent
    return Promise.resolve([]);
  }
}

class StatusTreeItem extends vscode.TreeItem {
  constructor(
    label: string,
    description: string,
    collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    super(label, collapsibleState);
    this.description = description;
  }
}
