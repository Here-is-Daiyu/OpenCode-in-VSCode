import * as vscode from 'vscode';
import type { Session, MessageWithParts } from '../types/opencode';
import type { OpenCodeClient } from '../services/openCodeClient';
import type { EventBus } from '../services/eventBus';
import type { SessionTreeProvider } from '../providers/sessionTreeProvider';
import type { ChatViewProvider } from '../providers/chatViewProvider';
import type { Logger } from '../services/logger';

/**
 * Coordinates session state between the REST API client, the session tree
 * provider and the chat webview.
 *
 * All mutations go through this manager so that every consumer stays in sync.
 */
export class SessionManager implements vscode.Disposable {
  private activeSessionId?: string;
  private sessions: Map<string, Session> = new Map();

  /** EventBus unsubscribe callbacks */
  private unsubscribers: Array<() => void> = [];

  constructor(
    private client: OpenCodeClient,
    private eventBus: EventBus,
    private sessionProvider: SessionTreeProvider,
    private chatProvider: ChatViewProvider,
    private logger: Logger,
  ) {
    // Keep local cache up-to-date when EventBus fires
    this.unsubscribers.push(
      eventBus.on('session:created', (session) => {
        this.sessions.set(session.id, session);
        this.logger.debug(`SessionManager: session created ${session.id}`);
      }),
      eventBus.on('session:updated', (session) => {
        this.sessions.set(session.id, session);
        this.logger.debug(`SessionManager: session updated ${session.id}`);
      }),
      eventBus.on('session:deleted', ({ id }) => {
        this.sessions.delete(id);
        this.logger.debug(`SessionManager: session deleted ${id}`);

        // If the deleted session was active, clear active state
        if (this.activeSessionId === id) {
          this.activeSessionId = undefined;
          this.chatProvider.postMessage({
            type: 'session:cleared',
            data: undefined,
          });
        }
      }),
    );
  }

  // -------------------------------------------------------------------------
  //  Active session management
  // -------------------------------------------------------------------------

  getActiveSessionId(): string | undefined {
    return this.activeSessionId;
  }

  getActiveSession(): Session | undefined {
    if (!this.activeSessionId) { return undefined; }
    return this.sessions.get(this.activeSessionId);
  }

  /**
   * Switch to a session: fetch its messages, update the tree highlighting
   * and push the full conversation to the webview.
   */
  async setActiveSession(id: string): Promise<void> {
    this.activeSessionId = id;
    this.sessionProvider.setActiveSession(id);
    this.logger.info(`SessionManager: switching to session ${id}`);

    try {
      // Ensure we have the session object
      let session = this.sessions.get(id);
      if (!session) {
        session = await this.client.getSession(id);
        this.sessions.set(id, session);
      }

      // Fetch messages
      const messages: MessageWithParts[] = await this.client.listMessages(id);

      // Update the chat webview
      this.chatProvider.setSession(id, messages);
      this.chatProvider.postMessage({
        type: 'session:loaded',
        data: { session, messages },
      });
    } catch (err) {
      this.logger.error(
        'SessionManager: failed to load session',
        err instanceof Error ? err.message : String(err),
      );
      vscode.window.showErrorMessage(`Failed to load session: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // -------------------------------------------------------------------------
  //  Session CRUD
  // -------------------------------------------------------------------------

  /**
   * Create a new session and switch to it.
   */
  async createSession(title?: string): Promise<Session> {
    const session = await this.client.createSession({ title });
    this.sessions.set(session.id, session);
    this.logger.info(`SessionManager: created session ${session.id}`);
    this.eventBus.emit('session:created', session);
    await this.setActiveSession(session.id);
    return session;
  }

  /**
   * Delete a session by ID.
   */
  async deleteSession(id: string): Promise<void> {
    await this.client.deleteSession(id);
    this.sessions.delete(id);
    this.logger.info(`SessionManager: deleted session ${id}`);
    this.eventBus.emit('session:deleted', { id });

    // If the active session was deleted, clear
    if (this.activeSessionId === id) {
      this.activeSessionId = undefined;
    }

    // Refresh the tree
    await this.sessionProvider.refresh();
  }

  /**
   * Fork the active session, optionally from a specific message.
   */
  async forkSession(messageID?: string): Promise<Session> {
    if (!this.activeSessionId) {
      throw new Error('No active session to fork');
    }
    const forked = await this.client.forkSession(this.activeSessionId, messageID);
    this.sessions.set(forked.id, forked);
    this.logger.info(`SessionManager: forked session ${this.activeSessionId} → ${forked.id}`);
    this.eventBus.emit('session:created', forked);
    await this.setActiveSession(forked.id);
    return forked;
  }

  // -------------------------------------------------------------------------
  //  Cache / query
  // -------------------------------------------------------------------------

  getSessions(): Session[] {
    return Array.from(this.sessions.values());
  }

  getSession(id: string): Session | undefined {
    return this.sessions.get(id);
  }

  /**
   * Refresh the full session list from the server.
   */
  async refreshSessions(): Promise<void> {
    try {
      const list = await this.client.listSessions();
      this.sessions.clear();
      for (const s of list) {
        this.sessions.set(s.id, s);
      }
      this.sessionProvider.setSessions(list);
      this.logger.debug(`SessionManager: refreshed ${list.length} session(s)`);
    } catch (err) {
      this.logger.error(
        'SessionManager: failed to refresh sessions',
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  // -------------------------------------------------------------------------
  //  Dispose
  // -------------------------------------------------------------------------

  dispose(): void {
    for (const unsub of this.unsubscribers) {
      unsub();
    }
    this.unsubscribers = [];
  }
}
