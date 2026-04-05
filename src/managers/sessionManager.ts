import * as path from 'path';
import * as vscode from 'vscode';
import type { Session, MessageWithParts, SessionStatus } from '../types/opencode';
import type { OpenCodeClient } from '../services/openCodeClient';
import type { EventBus } from '../services/eventBus';
import type { SessionTreeProvider } from '../providers/sessionTreeProvider';
import type { GlobalSessionTreeProvider } from '../providers/globalSessionTreeProvider';
import type { ChatViewProvider } from '../providers/chatViewProvider';
import type { Logger } from '../services/logger';

/** Ensure session.time exists with defaults to prevent runtime errors. */
function normalizeSessionTime(session: Session): Session {
  if (session.time?.updated != null && session.time?.created != null) {
    return session;
  }
  const now = Date.now();
  return {
    ...session,
    time: {
      created: session.time?.created ?? now,
      updated: session.time?.updated ?? now,
    },
  };
}

const INITIAL_SESSION_MESSAGE_LIMIT = 50;
const SESSION_HISTORY_BATCH_SIZE = 50;

/**
 * Coordinates session state between the REST API client, the session tree
 * provider and the chat webview.
 *
 * All mutations go through this manager so that every consumer stays in sync.
 */
export class SessionManager implements vscode.Disposable {
  private activeSessionId?: string;
  private sessions: Map<string, Session> = new Map();
  private globalSessions: Map<string, Session> = new Map();
  private currentDirectory?: string;
  private activeSessionLoadNonce = 0;

  /** EventBus unsubscribe callbacks */
  private unsubscribers: Array<() => void> = [];

  constructor(
    private client: OpenCodeClient,
    private eventBus: EventBus,
    private sessionProvider: SessionTreeProvider,
    private globalSessionProvider: GlobalSessionTreeProvider,
    private chatProvider: ChatViewProvider,
    private logger: Logger,
  ) {
    // Keep local cache up-to-date when EventBus fires
    this.unsubscribers.push(
      eventBus.on('session:created', (session) => {
        this.globalSessions.set(session.id, session);
        if (this.isCurrentProjectSession(session)) {
          this.sessions.set(session.id, session);
          this.sessionProvider.setSessions(this.getSessions());
        }
        this.globalSessionProvider.setSessions(this.getGlobalSessions());
        this.logger.debug(`SessionManager: session created ${session.id}`);
      }),
      eventBus.on('session:updated', (session) => {
        this.globalSessions.set(session.id, session);
        if (this.isCurrentProjectSession(session)) {
          this.sessions.set(session.id, session);
          this.sessionProvider.setSessions(this.getSessions());
        }
        this.globalSessionProvider.setSessions(this.getGlobalSessions());
        this.logger.debug(`SessionManager: session updated ${session.id}`);
      }),
      eventBus.on('session:deleted', ({ id }) => {
        const deletedCurrentSession = this.sessions.delete(id);
        const deletedGlobalSession = this.globalSessions.delete(id);
        if (deletedCurrentSession) {
          this.sessionProvider.setSessions(this.getSessions());
        }
        if (deletedGlobalSession) {
          this.globalSessionProvider.setSessions(this.getGlobalSessions());
        }
        this.logger.debug(`SessionManager: session deleted ${id}`);

        // If the deleted session was active, clear active state
        if (this.activeSessionId === id) {
          this.clearActiveSession();
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
    return this.sessions.get(this.activeSessionId) ?? this.globalSessions.get(this.activeSessionId);
  }

  /**
   * Switch to a session: fetch a recent message batch first, update the tree
   * highlighting and push the session to the webview immediately.
   */
  async setActiveSession(id: string): Promise<void> {
    const nonce = ++this.activeSessionLoadNonce;
    this.activeSessionId = id;
    this.sessionProvider.setActiveSession(id);
    this.globalSessionProvider.setActiveSession(id);
    this.logger.info(`SessionManager: switching to session ${id}`);

    try {
      // Ensure we have the session object
      let session = this.sessions.get(id) ?? this.globalSessions.get(id);
      if (!session) {
        session = await this.client.getSession(id);
        this.globalSessions.set(id, session);
        if (this.isCurrentProjectSession(session)) {
          this.sessions.set(id, session);
          this.sessionProvider.setSessions(this.getSessions());
        }
        this.globalSessionProvider.setSessions(this.getGlobalSessions());
      }

      const hasRevert = Boolean(session.revert?.messageID);

      // Fetch only the newest messages first so the webview can paint quickly.
      // Reverted sessions are the exception: the visible conversation is the
      // prefix before `session.revert.messageID`, so we need the full message
      // list up front to avoid briefly rendering reverted turns.
      const messages: MessageWithParts[] = await this.client.listMessages(
        id,
        hasRevert ? undefined : INITIAL_SESSION_MESSAGE_LIMIT,
      );

      // Prevent stale loads from overwriting the current session
      if (!this.isCurrentSessionLoad(id, nonce)) {
        this.logger.debug(`SessionManager: ignoring stale session load for ${id}`);
        return;
      }

      // Update the chat webview
      this.chatProvider.setSession(id, messages);
      this.chatProvider.postMessage({
        type: 'session:loaded',
        data: { session, messages },
      });

      if (!hasRevert) {
        void this.hydrateOlderMessages(id, messages, nonce);
      }
    } catch (err) {
      if (!this.isCurrentSessionLoad(id, nonce)) {
        // User switched sessions while this request was in-flight.
        this.logger.debug(
          `SessionManager: ignoring error from stale session load for ${id}`,
          err instanceof Error ? err.message : String(err),
        );
        return;
      }
      this.logger.error(
        'SessionManager: failed to load session',
        err instanceof Error ? err.message : String(err),
      );
      vscode.window.showErrorMessage(`Failed to load session: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private isCurrentSessionLoad(id: string, nonce: number): boolean {
    return nonce === this.activeSessionLoadNonce && this.activeSessionId === id;
  }

  private async hydrateOlderMessages(
    id: string,
    recentMessages: MessageWithParts[],
    nonce: number,
  ): Promise<void> {
    if (recentMessages.length < INITIAL_SESSION_MESSAGE_LIMIT) {
      return;
    }

    try {
      const fullMessages = await this.client.listMessages(id);

      if (!this.isCurrentSessionLoad(id, nonce)) {
        this.logger.debug(`SessionManager: ignoring stale history hydration for ${id}`);
        return;
      }

      const olderMessages = extractOlderMessages(fullMessages, recentMessages);
      if (olderMessages.length === 0) {
        return;
      }

      this.logger.debug(
        `SessionManager: hydrating ${olderMessages.length} older message(s) for ${id} in batches of ${SESSION_HISTORY_BATCH_SIZE}`,
      );

      for (let end = olderMessages.length; end > 0; end -= SESSION_HISTORY_BATCH_SIZE) {
        if (!this.isCurrentSessionLoad(id, nonce)) {
          this.logger.debug(`SessionManager: stopping stale history hydration for ${id}`);
          return;
        }

        const start = Math.max(0, end - SESSION_HISTORY_BATCH_SIZE);
        const batch = olderMessages.slice(start, end);

        this.chatProvider.postMessage({
          type: 'session:historyPrepended',
          data: { sessionID: id, messages: batch },
        });

        if (start > 0) {
          await waitForNextTick();
        }
      }
    } catch (err) {
      if (!this.isCurrentSessionLoad(id, nonce)) {
        this.logger.debug(
          `SessionManager: ignoring stale history hydration error for ${id}`,
          err instanceof Error ? err.message : String(err),
        );
        return;
      }

      this.logger.warn(
        'SessionManager: failed to hydrate older session messages',
        err instanceof Error ? err.message : String(err),
      );
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
    this.globalSessions.set(session.id, session);
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
    this.globalSessions.delete(id);
    this.logger.info(`SessionManager: deleted session ${id}`);
    this.eventBus.emit('session:deleted', { id });

    // If the active session was deleted, clear
    if (this.activeSessionId === id) {
      this.clearActiveSession();
    }

    this.sessionProvider.setSessions(this.getSessions());
    this.globalSessionProvider.setSessions(this.getGlobalSessions());
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
    this.globalSessions.set(forked.id, forked);
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

  getGlobalSessions(): Session[] {
    return Array.from(this.globalSessions.values());
  }

  getSession(id: string): Session | undefined {
    return this.sessions.get(id) ?? this.globalSessions.get(id);
  }

  setSessions(sessions: Session[], statuses?: Record<string, SessionStatus>): void {
    if (!this.currentDirectory && sessions[0]?.directory) {
      this.setCurrentDirectory(sessions[0].directory);
    }

    for (const id of this.sessions.keys()) {
      this.globalSessions.delete(id);
    }

    this.sessions.clear();
    for (const session of sessions) {
      const normalized = normalizeSessionTime(session);
      this.sessions.set(normalized.id, normalized);
      this.globalSessions.set(normalized.id, normalized);
    }

    if (this.activeSessionId && !this.sessions.has(this.activeSessionId) && !this.globalSessions.has(this.activeSessionId)) {
      this.clearActiveSession();
    }

    this.sessionProvider.setSessions(this.getSessions(), statuses);
    this.globalSessionProvider.setSessions(this.getGlobalSessions(), statuses);
  }

  setGlobalSessions(sessions: Session[], statuses?: Record<string, SessionStatus>): void {
    const currentSessions = this.getSessions();

    this.globalSessions.clear();
    for (const session of sessions) {
      const normalized = normalizeSessionTime(session);
      this.globalSessions.set(normalized.id, normalized);
    }
    for (const session of currentSessions) {
      this.globalSessions.set(session.id, session);
    }

    if (this.activeSessionId && !this.sessions.has(this.activeSessionId) && !this.globalSessions.has(this.activeSessionId)) {
      this.clearActiveSession();
    }

    this.globalSessionProvider.setSessions(this.getGlobalSessions(), statuses);
  }

  setCurrentDirectory(directory?: string): void {
    this.currentDirectory = directory ? normalizeDirectory(directory) : undefined;
  }

  isCurrentProjectDirectory(directory?: string): boolean {
    if (!this.currentDirectory || !directory) {
      return false;
    }

    return normalizeDirectory(directory) === this.currentDirectory;
  }

  isCurrentProjectSession(session?: Pick<Session, 'directory'>): boolean {
    return session?.directory ? this.isCurrentProjectDirectory(session.directory) : false;
  }

  getLatestSessionId(): string | undefined {
    let latestSession: Session | undefined;

    for (const session of this.sessions.values()) {
      if (!latestSession || session.time.updated > latestSession.time.updated) {
        latestSession = session;
      }
    }

    return latestSession?.id;
  }

  /**
   * Refresh the full session list from the server.
   */
  async refreshSessions(): Promise<void> {
    try {
      const [list, statuses] = await Promise.all([
        this.client.listSessions(),
        this.client.getSessionStatus(),
      ]);
      this.setSessions(list, statuses);
      this.logger.debug(`SessionManager: refreshed ${list.length} session(s)`);
    } catch (err) {
      this.logger.error(
        'SessionManager: failed to refresh sessions',
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  async refreshGlobalSessions(): Promise<void> {
    try {
      const [list, statuses] = await Promise.all([
        this.client.listAllSessions(),
        this.client.getSessionStatus(),
      ]);
      this.setGlobalSessions(list, statuses);
      this.logger.debug(`SessionManager: refreshed ${list.length} global session(s)`);
    } catch (err) {
      this.logger.error(
        'SessionManager: failed to refresh global sessions',
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

  private clearActiveSession(): void {
    const previousActiveSessionId = this.activeSessionId;
    if (!previousActiveSessionId) {
      return;
    }

    this.activeSessionId = undefined;
    this.activeSessionLoadNonce++;
    this.sessionProvider.setActiveSession(undefined);
    this.globalSessionProvider.setActiveSession(undefined);
    this.chatProvider.postMessage({
      type: 'session:cleared',
      data: undefined,
    });
    this.logger.debug(`SessionManager: cleared missing active session ${previousActiveSessionId}`);
  }
}

function extractOlderMessages(
  fullMessages: MessageWithParts[],
  recentMessages: MessageWithParts[],
): MessageWithParts[] {
  if (recentMessages.length === 0 || fullMessages.length <= recentMessages.length) {
    return [];
  }

  const firstRecentMessageId = recentMessages[0]?.info.id;
  if (firstRecentMessageId) {
    const recentStartIndex = fullMessages.findIndex(
      (message) => message.info.id === firstRecentMessageId,
    );

    if (recentStartIndex >= 0) {
      return fullMessages.slice(0, recentStartIndex);
    }
  }

  return fullMessages.slice(0, Math.max(0, fullMessages.length - recentMessages.length));
}

function waitForNextTick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function normalizeDirectory(directory: string): string {
  const normalized = path.normalize(directory);
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}
