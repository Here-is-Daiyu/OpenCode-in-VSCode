import * as path from 'path';
import * as vscode from 'vscode';
import type { Session, SessionStatus } from '../types/opencode';
import type { EventBus } from '../services/eventBus';
import type { OpenCodeClient } from '../services/openCodeClient';
import { SessionTreeItem } from './sessionTreeProvider';

// ---------------------------------------------------------------------------
//  Tree items
// ---------------------------------------------------------------------------

export class SessionDirectoryTreeItem extends vscode.TreeItem {
  readonly kind = 'directory' as const;

  constructor(
    public readonly directory: string,
    sessionCount: number,
  ) {
    super(getDirectoryLabel(directory), vscode.TreeItemCollapsibleState.Expanded);
    this.id = `directory:${normalizeDirectory(directory)}`;
    this.description = `${sessionCount} session${sessionCount === 1 ? '' : 's'}`;
    this.tooltip = directory;
    this.contextValue = 'sessionDirectory';
    this.iconPath = new vscode.ThemeIcon('folder-library');
  }
}

type GlobalSessionTreeElement = SessionDirectoryTreeItem | SessionTreeItem;

// ---------------------------------------------------------------------------
//  Provider
// ---------------------------------------------------------------------------

export class GlobalSessionTreeProvider
  implements vscode.TreeDataProvider<GlobalSessionTreeElement>, vscode.Disposable
{
  private _onDidChangeTreeData = new vscode.EventEmitter<GlobalSessionTreeElement | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private sessions: Session[] = [];
  private sessionStatuses: Record<string, SessionStatus> = {};
  private activeSessionId?: string;
  private client?: OpenCodeClient;

  /** EventBus unsubscribe callbacks */
  private unsubscribers: Array<() => void> = [];

  constructor(private eventBus: EventBus) {
    this.unsubscribers.push(
      eventBus.on('session:status', (payload) => {
        this.sessionStatuses[payload.sessionID] = payload.status;
        this._onDidChangeTreeData.fire(undefined);
      }),
    );
  }

  // -------------------------------------------------------------------------
  //  Public API
  // -------------------------------------------------------------------------

  setClient(client: OpenCodeClient): void {
    this.client = client;
  }

  setActiveSession(id?: string): void {
    this.activeSessionId = id;
    this._onDidChangeTreeData.fire(undefined);
  }

  async refresh(): Promise<void> {
    if (this.client) {
      try {
        const [sessions, statuses] = await Promise.all([
          this.client.listAllSessions(),
          this.client.getSessionStatus(),
        ]);
        this.setSessions(sessions, statuses);
        return;
      } catch {
        // Keep existing data on error — the tree simply won't update
      }
    }

    this._onDidChangeTreeData.fire(undefined);
  }

  setSessions(sessions: Session[], statuses?: Record<string, SessionStatus>): void {
    this.sessions = sessions;

    const nextStatuses: Record<string, SessionStatus> = {};
    for (const session of sessions) {
      const status = statuses?.[session.id] ?? this.sessionStatuses[session.id];
      if (status) {
        nextStatuses[session.id] = status;
      }
    }

    this.sessionStatuses = nextStatuses;
    this._onDidChangeTreeData.fire(undefined);
  }

  // -------------------------------------------------------------------------
  //  TreeDataProvider
  // -------------------------------------------------------------------------

  getTreeItem(element: GlobalSessionTreeElement): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: GlobalSessionTreeElement): Promise<GlobalSessionTreeElement[]> {
    if (!element) {
      return this.buildDirectoryItems();
    }

    if (element instanceof SessionDirectoryTreeItem) {
      return this.buildRootSessionItems(element.directory);
    }

    if (element instanceof SessionTreeItem) {
      return this.buildChildSessionItems(element.session.id, element.session.directory);
    }

    return [];
  }

  getParent(element: GlobalSessionTreeElement): GlobalSessionTreeElement | undefined {
    if (element instanceof SessionDirectoryTreeItem) {
      return undefined;
    }

    const session = element.session;
    if (session.parentID) {
      const parent = this.sessions.find(
        (candidate) => candidate.id === session.parentID && sameDirectory(candidate.directory, session.directory),
      );
      if (!parent) {
        return undefined;
      }

      return this.createSessionItem(parent);
    }

    return new SessionDirectoryTreeItem(session.directory, this.getDirectorySessionCount(session.directory));
  }

  // -------------------------------------------------------------------------
  //  Cleanup
  // -------------------------------------------------------------------------

  dispose(): void {
    for (const unsub of this.unsubscribers) {
      unsub();
    }
    this.unsubscribers = [];
    this._onDidChangeTreeData.dispose();
  }

  // -------------------------------------------------------------------------
  //  Internal helpers
  // -------------------------------------------------------------------------

  private buildDirectoryItems(): SessionDirectoryTreeItem[] {
    const sessionsByDirectory = new Map<string, Session[]>();

    for (const session of this.sessions) {
      const bucket = sessionsByDirectory.get(session.directory);
      if (bucket) {
        bucket.push(session);
      } else {
        sessionsByDirectory.set(session.directory, [session]);
      }
    }

    return Array.from(sessionsByDirectory.entries())
      .sort((a, b) => {
        const latestA = Math.max(...a[1].map((session) => session.time.updated));
        const latestB = Math.max(...b[1].map((session) => session.time.updated));
        if (latestA !== latestB) {
          return latestB - latestA;
        }
        return a[0].localeCompare(b[0]);
      })
      .map(([directory, sessions]) => new SessionDirectoryTreeItem(directory, sessions.length));
  }

  private buildRootSessionItems(directory: string): SessionTreeItem[] {
    return this.buildSessionItems((session) => !session.parentID && sameDirectory(session.directory, directory));
  }

  private buildChildSessionItems(parentID: string, directory: string): SessionTreeItem[] {
    return this.buildSessionItems(
      (session) => session.parentID === parentID && sameDirectory(session.directory, directory),
    );
  }

  private buildSessionItems(predicate: (session: Session) => boolean): SessionTreeItem[] {
    return this.sessions
      .filter(predicate)
      .sort((a, b) => b.time.updated - a.time.updated)
      .map((session) => this.createSessionItem(session));
  }

  private createSessionItem(session: Session): SessionTreeItem {
    const hasChildren = this.sessions.some(
      (candidate) => candidate.parentID === session.id && sameDirectory(candidate.directory, session.directory),
    );

    return new SessionTreeItem(
      session,
      hasChildren,
      session.id === this.activeSessionId,
      this.sessionStatuses[session.id],
    );
  }

  private getDirectorySessionCount(directory: string): number {
    return this.sessions.filter((session) => sameDirectory(session.directory, directory)).length;
  }
}

function sameDirectory(left: string, right: string): boolean {
  return normalizeDirectory(left) === normalizeDirectory(right);
}

function normalizeDirectory(directory: string): string {
  const normalized = path.normalize(directory);
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function getDirectoryLabel(directory: string): string {
  const base = path.basename(directory);
  if (base) {
    return base;
  }

  const parsed = path.parse(directory);
  return parsed.root || directory;
}
