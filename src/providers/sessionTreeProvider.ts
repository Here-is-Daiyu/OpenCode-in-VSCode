import * as vscode from 'vscode';
import type { Session } from '../types/opencode';

/**
 * Provides the session list TreeView
 */
export class SessionTreeProvider implements vscode.TreeDataProvider<SessionTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<SessionTreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private sessions: Session[] = [];

  refresh(sessions?: Session[]): void {
    if (sessions) {
      this.sessions = sessions;
    }
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: SessionTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: SessionTreeItem): Thenable<SessionTreeItem[]> {
    if (element) {
      return Promise.resolve([]);
    }
    return Promise.resolve(
      this.sessions.map(session => new SessionTreeItem(session))
    );
  }
}

class SessionTreeItem extends vscode.TreeItem {
  constructor(public readonly session: Session) {
    super(session.title || 'Untitled Session', vscode.TreeItemCollapsibleState.None);
    this.id = session.id;
    this.tooltip = `Session: ${session.title}\nCreated: ${new Date(session.time.created).toLocaleString()}`;
    this.command = {
      command: 'opencode.switchSession',
      title: 'Switch to Session',
      arguments: [session.id],
    };
    this.contextValue = 'session';
  }
}
