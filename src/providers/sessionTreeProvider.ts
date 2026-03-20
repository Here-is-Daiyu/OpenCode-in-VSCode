import * as vscode from 'vscode';
import type { Session, SessionStatus } from '../types/opencode';
import type { EventBus } from '../services/eventBus';
import type { OpenCodeClient } from '../services/openCodeClient';

// ---------------------------------------------------------------------------
//  Tree item
// ---------------------------------------------------------------------------

export class SessionTreeItem extends vscode.TreeItem {
  constructor(
    public readonly session: Session,
    public readonly hasChildren: boolean,
    public readonly isActive: boolean,
    public readonly status?: SessionStatus,
  ) {
    super(
      session.title || `Untitled Session`,
      hasChildren
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None,
    );

    this.id = session.id;
    this.description = buildDescription(session);
    this.tooltip = buildTooltip(session, status);
    this.iconPath = buildIcon(isActive, status);
    this.contextValue = isActive ? 'activeSession' : 'session';

    this.command = {
      command: 'opencode.switchSession',
      title: 'Switch to Session',
      arguments: [session.id],
    };
  }
}

// ---------------------------------------------------------------------------
//  Provider
// ---------------------------------------------------------------------------

/**
 * Provides a hierarchical session list TreeView.
 *
 * Sessions that have a `parentID` are displayed as children of their parent.
 * The provider subscribes to EventBus session events so the tree refreshes
 * automatically when sessions are created, updated or deleted.
 */
export class SessionTreeProvider implements vscode.TreeDataProvider<SessionTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<SessionTreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private sessions: Session[] = [];
  private sessionStatuses: Record<string, SessionStatus> = {};
  private activeSessionId?: string;
  private client?: OpenCodeClient;
  private filterText = '';

  /** EventBus unsubscribe callbacks */
  private unsubscribers: Array<() => void> = [];

  /** Debounce timer for batching rapid tree refreshes. */
  private refreshTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(private eventBus: EventBus) {
    // Session created/updated/deleted are already handled by
    // refreshSessionsQuietly() in extension.ts which calls setSessions().
    // We only need to react to session:status (lightweight, no server fetch).
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

  /**
   * Attach the REST client used to fetch sessions.
   */
  setClient(client: OpenCodeClient): void {
    this.client = client;
  }

  /**
   * Mark a session as the currently active one.
   */
  setActiveSession(id: string): void {
    this.activeSessionId = id;
    this._onDidChangeTreeData.fire(undefined);
  }

  /**
   * Get the current active session id.
   */
  getActiveSessionId(): string | undefined {
    return this.activeSessionId;
  }

  /**
   * Apply a text filter to sessions. Pass an empty string to clear.
   */
  setFilter(text: string): void {
    this.filterText = text.toLowerCase();
    this._onDidChangeTreeData.fire(undefined);
  }

  /**
   * Fetch sessions from the server and refresh the tree.
   */
  async refresh(): Promise<void> {
    if (this.client) {
      try {
        const [sessions, statuses] = await Promise.all([
          this.client.listSessions(),
          this.client.getSessionStatus(),
        ]);
        this.sessions = sessions;
        this.sessionStatuses = statuses;
      } catch {
        // Keep existing data on error — the tree simply won't update
      }
    }
    this._onDidChangeTreeData.fire(undefined);
  }

  /**
   * Manually update the sessions list (without fetching from server).
   * Optionally update statuses as well.
   */
  setSessions(sessions: Session[], statuses?: Record<string, SessionStatus>): void {
    this.sessions = sessions;
    if (statuses) {
      this.sessionStatuses = statuses;
    }
    this._onDidChangeTreeData.fire(undefined);
  }

  // -------------------------------------------------------------------------
  //  TreeDataProvider
  // -------------------------------------------------------------------------

  getTreeItem(element: SessionTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: SessionTreeItem): Promise<SessionTreeItem[]> {
    if (element) {
      // Return children of the given parent session
      return this.buildItems(element.session.id);
    }
    // Top-level: sessions without a parentID (root sessions)
    return this.buildItems(undefined);
  }

  getParent(element: SessionTreeItem): SessionTreeItem | undefined {
    if (!element.session.parentID) {
      return undefined;
    }
    const parent = this.sessions.find(s => s.id === element.session.parentID);
    if (!parent) {
      return undefined;
    }
    const hasChildren = this.sessions.some(s => s.parentID === parent.id);
    return new SessionTreeItem(
      parent,
      hasChildren,
      parent.id === this.activeSessionId,
      this.sessionStatuses[parent.id],
    );
  }

  // -------------------------------------------------------------------------
  //  Cleanup
  // -------------------------------------------------------------------------

  dispose(): void {
    for (const unsub of this.unsubscribers) {
      unsub();
    }
    this.unsubscribers = [];
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }
    this._onDidChangeTreeData.dispose();
  }

  // -------------------------------------------------------------------------
  //  Internal helpers
  // -------------------------------------------------------------------------

  /**
   * Build tree items for children of `parentId` (or root items when
   * `parentId` is `undefined`).
   */
  private buildItems(parentId: string | undefined): SessionTreeItem[] {
    let filtered = this.sessions.filter(s => s.parentID === parentId);

    // Apply text filter (only at root level to keep subtrees visible)
    if (!parentId && this.filterText) {
      filtered = filtered.filter(s =>
        (s.title || '').toLowerCase().includes(this.filterText),
      );
    }

    // Sort by most recently updated first
    filtered.sort((a, b) => b.time.updated - a.time.updated);

    return filtered.map(session => {
      const hasChildren = this.sessions.some(s => s.parentID === session.id);
      const isActive = session.id === this.activeSessionId;
      const status = this.sessionStatuses[session.id];
      return new SessionTreeItem(session, hasChildren, isActive, status);
    });
  }
}

// ---------------------------------------------------------------------------
//  Helper functions
// ---------------------------------------------------------------------------

/**
 * Build the short description shown next to the session title.
 * e.g. "anthropic/claude-3.5 · 2 min ago"
 */
function buildDescription(session: Session): string {
  const parts: string[] = [];

  // Relative time based on last update
  parts.push(relativeTime(session.time.updated));

  return parts.join(' · ');
}

/**
 * Build a rich multi-line tooltip for the tree item.
 */
function buildTooltip(session: Session, status?: SessionStatus): vscode.MarkdownString {
  const md = new vscode.MarkdownString('', true);
  md.isTrusted = true;

  md.appendMarkdown(`### ${session.title || 'Untitled Session'}\n\n`);

  md.appendMarkdown(`**ID:** \`${session.id}\`\n\n`);
  md.appendMarkdown(`**Created:** ${new Date(session.time.created).toLocaleString()}\n\n`);
  md.appendMarkdown(`**Updated:** ${new Date(session.time.updated).toLocaleString()}\n\n`);

  if (status) {
    md.appendMarkdown(`**Status:** ${status.status}\n\n`);
    if (status.error) {
      md.appendMarkdown(`**Error:** ${status.error}\n\n`);
    }
  }

  if (session.summary) {
    md.appendMarkdown(`---\n\n`);
    md.appendMarkdown(
      `**Files changed:** ${session.summary.files}  ` +
      `**(+${session.summary.additions} / -${session.summary.deletions})**\n\n`,
    );
  }

  if (session.parentID) {
    md.appendMarkdown(`**Parent:** \`${session.parentID}\`\n\n`);
  }

  if (session.share?.url) {
    md.appendMarkdown(`**Shared:** [link](${session.share.url})\n\n`);
  }

  return md;
}

/**
 * Choose an icon based on session state.
 */
function buildIcon(
  isActive: boolean,
  status?: SessionStatus,
): vscode.ThemeIcon {
  if (isActive) {
    // Active session shows a status-aware icon
    switch (status?.status) {
      case 'active':
        return new vscode.ThemeIcon('loading~spin', new vscode.ThemeColor('charts.green'));
      case 'error':
        return new vscode.ThemeIcon('error', new vscode.ThemeColor('errorForeground'));
      case 'compacting':
        return new vscode.ThemeIcon('sync~spin', new vscode.ThemeColor('charts.yellow'));
      default:
        // idle or unknown
        return new vscode.ThemeIcon('comment-discussion', new vscode.ThemeColor('charts.blue'));
    }
  }

  // Non-active session
  switch (status?.status) {
    case 'active':
      return new vscode.ThemeIcon('loading~spin');
    case 'error':
      return new vscode.ThemeIcon('error', new vscode.ThemeColor('errorForeground'));
    case 'compacting':
      return new vscode.ThemeIcon('sync~spin');
    default:
      return new vscode.ThemeIcon('circle-outline');
  }
}

/**
 * Return a human-readable relative time string.
 */
function relativeTime(epochMs: number): string {
  const now = Date.now();
  const diff = now - epochMs;

  if (diff < 0) { return 'just now'; }

  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) { return 'just now'; }

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) { return `${minutes} min ago`; }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) { return `${hours}h ago`; }

  const days = Math.floor(hours / 24);
  if (days < 30) { return `${days}d ago`; }

  const months = Math.floor(days / 30);
  if (months < 12) { return `${months}mo ago`; }

  const years = Math.floor(months / 12);
  return `${years}y ago`;
}
