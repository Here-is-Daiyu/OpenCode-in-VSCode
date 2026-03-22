import * as vscode from 'vscode';
import type {
  ExtensionToWebviewMessage,
  WebviewToExtensionMessage,
} from '../types/messages';
import type { MessageWithParts } from '../types/opencode';
import type {
  OpenCodeClient,
  PromptFilePart,
  SendMessageData,
} from '../services/openCodeClient';
import type { Logger } from '../services/logger';
import { ModelPreferencesService } from '../services/modelPreferences';
import { getWebviewHtml } from '../utils/webviewHtml';

type ServerStatusMessage = Extract<ExtensionToWebviewMessage, { type: 'server:status' }>;
type SessionLoadedMessage = Extract<ExtensionToWebviewMessage, { type: 'session:loaded' }>;
type SessionHistoryPrependedMessage = Extract<ExtensionToWebviewMessage, { type: 'session:historyPrepended' }>;

const DEFAULT_IMAGE_MIME = 'image/png';
const DATA_URL_PREFIX = /^data:/i;
const DATA_URL_MIME_PATTERN = /^data:([^;,]+)(?:;[^,]*)?,/i;
const BASE64_PATTERN = /^[A-Za-z0-9+/=\s]+$/;

/** Counter used to generate unique panel IDs for new session drafts. */
let nextDraftId = 0;

/**
 * Tracks the state of a single editor panel (tab).
 */
interface EditorPanelState {
  panel: vscode.WebviewPanel;
  sessionId: string | null;
  disposables: vscode.Disposable[];
  /** Cached latest server status so we can re-send it on `ready`. */
  lastServerStatus?: ServerStatusMessage['data'];
  /** Cached session data so we can re-send it on `ready`. */
  lastSessionLoaded?: SessionLoadedMessage['data'];
}

/**
 * Manages `vscode.WebviewPanel` instances that show chat sessions as
 * full editor tabs.
 *
 * Each panel is keyed by a "panel ID" (the session ID for existing sessions,
 * or a generated unique ID for new-session drafts).  The provider supports:
 *
 * - Creating / reusing panels by session ID
 * - Routing SSE events to the correct panel(s)
 * - Handling webview messages (same protocol as ChatViewProvider)
 * - Cleaning up panels on disposal
 */
export class SessionEditorPanelProvider {
  private panels = new Map<string, EditorPanelState>();
  private client?: OpenCodeClient;
  private logger?: Logger;
  private modelPrefs?: ModelPreferencesService;
  private modelPrefsBaseUrlLogged = false;

  constructor(private readonly extensionUri: vscode.Uri) {}

  // ---------------------------------------------------------------------------
  //  Dependency injection
  // ---------------------------------------------------------------------------

  setClient(client: OpenCodeClient): void {
    this.client = client;
  }

  setLogger(logger: Logger): void {
    this.logger = logger;
  }

  // ---------------------------------------------------------------------------
  //  Public API
  // ---------------------------------------------------------------------------

  /**
   * Open (or re-focus) an editor tab for the given session ID.
   */
  createOrShow(sessionId: string, title?: string): void {
    const existing = this.panels.get(sessionId);
    if (existing) {
      existing.panel.reveal(undefined, true);
      return;
    }

    this.createPanel(sessionId, title ?? 'OpenCode Chat', sessionId);
  }

  /**
   * Open a new editor tab for a blank "new session" draft.
   */
  createOrShowNewSession(): void {
    const panelId = `__draft_${++nextDraftId}`;
    this.createPanel(panelId, 'New Session', null);
  }

  /**
   * Post a message to the panel that owns a given session ID.
   * No-op if no panel is open for that session.
   */
  postMessageToPanel(sessionId: string, message: ExtensionToWebviewMessage): void {
    const state = this.panels.get(sessionId);
    if (!state) { return; }

    this.cacheMessageForPanel(state, message);
    this.doPostMessage(state, message);
  }

  /**
   * Broadcast a message to every open editor panel.
   */
  broadcastMessage(message: ExtensionToWebviewMessage): void {
    for (const state of this.panels.values()) {
      this.cacheMessageForPanel(state, message);
      this.doPostMessage(state, message);
    }
  }

  /**
   * Route a session-scoped message to all panels whose tracked sessionId
   * matches the given ID.
   *
   * This is the primary entry-point used by extension.ts to forward SSE
   * events that contain a `sessionID` field.
   */
  routeSessionMessage(sessionId: string, message: ExtensionToWebviewMessage): void {
    for (const [, state] of this.panels) {
      if (state.sessionId === sessionId) {
        this.cacheMessageForPanel(state, message);
        this.doPostMessage(state, message);
      }
    }
  }

  /**
   * Return the session IDs of all open panels (excludes drafts with null session).
   */
  getActivePanelSessionIds(): string[] {
    const ids: string[] = [];
    for (const state of this.panels.values()) {
      if (state.sessionId) {
        ids.push(state.sessionId);
      }
    }
    return ids;
  }

  /**
   * Check whether a panel is open for the given session ID.
   */
  hasPanel(sessionId: string): boolean {
    return this.panels.has(sessionId);
  }

  /**
   * Dispose every open editor panel (called during extension deactivation).
   */
  disposeAll(): void {
    for (const panelId of [...this.panels.keys()]) {
      this.disposePanel(panelId);
    }
  }

  // ---------------------------------------------------------------------------
  //  Panel lifecycle
  // ---------------------------------------------------------------------------

  private createPanel(
    panelId: string,
    title: string,
    sessionId: string | null,
  ): void {
    const panel = vscode.window.createWebviewPanel(
      'opencode.sessionEditor',
      title,
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(this.extensionUri, 'out', 'webview'),
        ],
      },
    );

    // Set the panel icon
    const iconUri = vscode.Uri.joinPath(this.extensionUri, 'media', 'icon.svg');
    panel.iconPath = iconUri;

    // Generate HTML
    panel.webview.html = getWebviewHtml({
      webview: panel.webview,
      extensionUri: this.extensionUri,
      viewMode: 'editor',
      initialSessionId: sessionId ?? undefined,
    });

    const disposables: vscode.Disposable[] = [];

    const state: EditorPanelState = {
      panel,
      sessionId,
      disposables,
    };

    this.panels.set(panelId, state);

    // Handle messages from the webview
    disposables.push(
      panel.webview.onDidReceiveMessage(
        (message: WebviewToExtensionMessage) => {
          this.handleWebviewMessage(panelId, message);
        },
      ),
    );

    // Handle panel disposal (user closes the tab).
    // Not added to `disposables` because it's tied to the panel's own lifecycle.
    panel.onDidDispose(() => {
      this.disposePanel(panelId);
    });
  }

  private disposePanel(panelId: string): void {
    const state = this.panels.get(panelId);
    if (!state) { return; }

    this.panels.delete(panelId);

    for (const d of state.disposables) {
      d.dispose();
    }
    state.disposables.length = 0;

    // If the panel hasn't already been disposed (user closing fires onDidDispose
    // before we get here), calling dispose() is safe and idempotent.
    try {
      state.panel.dispose();
    } catch {
      // Already disposed — ignore
    }

    this.logger?.debug(`Editor panel disposed: ${panelId}`);
  }

  // ---------------------------------------------------------------------------
  //  Message handling
  // ---------------------------------------------------------------------------

  /**
   * Handle messages from a specific editor panel.
   *
   * Mirrors the ChatViewProvider message handling so the same React app works
   * in both sidebar and editor tab modes.
   */
  private handleWebviewMessage(
    panelId: string,
    message: WebviewToExtensionMessage,
  ): void {
    switch (message.type) {
      case 'ready':
        this.onWebviewReady(panelId);
        break;

      case 'chat:send':
        this.handleChatSend(panelId, message.data.text, message.data.images);
        break;

      case 'chat:abort':
        vscode.commands.executeCommand('opencode.abortSession');
        break;

      case 'session:create':
        vscode.commands.executeCommand('opencode.newSession', message.data?.title);
        break;

      case 'session:switch':
        this.handleSessionSwitch(panelId, message.data.id);
        break;

      case 'session:delete':
        vscode.commands.executeCommand('opencode.deleteSession', message.data.id);
        break;

      case 'session:fork':
        vscode.commands.executeCommand('opencode.forkSession', message.data.messageID);
        break;

      case 'session:share':
        vscode.commands.executeCommand('opencode.shareSession');
        break;

      case 'session:revert':
        vscode.commands.executeCommand(
          'opencode.revertSession',
          message.data.messageID,
          message.data.partID,
        );
        break;

      case 'session:unrevert':
        vscode.commands.executeCommand('opencode.unrevertSession');
        break;

      case 'permission:respond':
        vscode.commands.executeCommand(
          'opencode.respondPermission',
          message.data.id,
          message.data.response,
          message.data.remember,
        );
        break;

      case 'question:respond':
        vscode.commands.executeCommand(
          'opencode.respondQuestion',
          message.data.id,
          message.data.answer,
        );
        break;

      case 'config:get':
        vscode.commands.executeCommand('opencode.getConfig');
        break;

      case 'config:update':
        vscode.commands.executeCommand('opencode.updateConfig', message.data);
        break;

      case 'model:select':
        vscode.commands.executeCommand(
          'opencode.selectModel',
          message.data.providerID,
          message.data.modelID,
        );
        break;

      case 'agent:select':
        vscode.commands.executeCommand('opencode.selectAgent', message.data.id);
        break;

      case 'file:open':
        this.openFile(message.data.path, message.data.line, message.data.column);
        break;

      case 'diff:show':
        vscode.commands.executeCommand(
          'opencode.showDiff',
          message.data.path,
          message.data.original,
          message.data.modified,
        );
        break;

      case 'command:list':
        this.handleCommandList(panelId);
        break;

      case 'command:execute':
        vscode.commands.executeCommand(message.data.command, message.data.args);
        break;

      case 'model-prefs:get':
        this.sendModelPrefs(panelId);
        break;

      case 'model-prefs:toggle-favorite':
        this.handleModelPrefsToggleFavorite(panelId, message.data);
        break;

      case 'model-prefs:add-recent':
        this.handleModelPrefsAddRecent(panelId, message.data);
        break;

      case 'model-prefs:set-variant':
        this.handleModelPrefsSetVariant(panelId, message.data);
        break;
    }
  }

  // ---------------------------------------------------------------------------
  //  Ready / visibility
  // ---------------------------------------------------------------------------

  private onWebviewReady(panelId: string): void {
    const state = this.panels.get(panelId);
    if (!state) { return; }

    // Send latest known server status (or disconnected fallback)
    this.doPostMessage(state, {
      type: 'server:status',
      data: state.lastServerStatus ?? { connected: false },
    });

    // Re-send the session data if we have it
    if (state.lastSessionLoaded) {
      this.doPostMessage(state, {
        type: 'session:loaded',
        data: state.lastSessionLoaded,
      });
    }

    // Send model preferences
    this.sendModelPrefs(panelId);
  }

  // ---------------------------------------------------------------------------
  //  Session switch tracking
  // ---------------------------------------------------------------------------

  /**
   * When the user switches sessions inside an editor panel, we update the
   * panel's tracked session ID and re-key the map entry so that future
   * SSE routing reaches the correct panel.
   */
  private handleSessionSwitch(panelId: string, newSessionId: string): void {
    const state = this.panels.get(panelId);
    if (!state) { return; }

    const oldSessionId = state.sessionId;

    // Re-key: delete the old entry and re-insert under the new session ID
    // so that postMessageToPanel / routeSessionMessage find it.
    if (panelId !== newSessionId) {
      this.panels.delete(panelId);

      // If there's already a panel for the new session, just reveal it and
      // dispose the current one. The `state` object is intentionally
      // abandoned here — its disposables are cleaned up and its panel is
      // disposed, so no further access occurs.
      if (this.panels.has(newSessionId)) {
        const existingState = this.panels.get(newSessionId)!;
        existingState.panel.reveal(undefined, true);
        for (const d of state.disposables) { d.dispose(); }
        state.disposables.length = 0;
        try { state.panel.dispose(); } catch { /* already disposed */ }
        this.logger?.debug(
          `Editor panel session switch: discarded duplicate panel for ${newSessionId}`,
        );
        return;
      }

      state.sessionId = newSessionId;
      this.panels.set(newSessionId, state);
    } else {
      state.sessionId = newSessionId;
    }

    // Clear stale cached session data so next `ready` doesn't replay old data
    state.lastSessionLoaded = undefined;

    this.logger?.debug(
      `Editor panel session switch: ${oldSessionId ?? panelId} → ${newSessionId}`,
    );

    // Delegate the actual session load to the centralized command
    vscode.commands.executeCommand('opencode.switchSession', newSessionId);
  }

  // ---------------------------------------------------------------------------
  //  Chat send
  // ---------------------------------------------------------------------------

  /**
   * Handle sending a chat message from an editor panel.
   * Mirrors ChatViewProvider.handleChatSend().
   */
  private async handleChatSend(
    panelId: string,
    text: string,
    images?: string[],
  ): Promise<void> {
    const state = this.panels.get(panelId);
    if (!state) { return; }

    if (!this.client) {
      this.logger?.error('Client not available for chat:send');
      this.doPostMessage(state, {
        type: 'chat:sendResult',
        data: { success: false, error: 'Client not available' },
      });
      return;
    }

    const payload = this.buildPromptPayload(text, images);
    if (!payload) {
      this.doPostMessage(state, {
        type: 'chat:sendResult',
        data: {
          success: false,
          error: 'Please enter a message or attach a valid image before sending.',
        },
      });
      return;
    }

    // Ensure we have a session
    let sessionId = state.sessionId;
    if (!sessionId) {
      try {
        const session = await this.client.createSession();
        sessionId = session.id;
        state.sessionId = session.id;

        // Re-key the map so future routing uses the real session ID
        this.panels.delete(panelId);
        this.panels.set(session.id, state);

        // Update the panel title
        state.panel.title = session.title || 'OpenCode Chat';

        this.doPostMessage(state, { type: 'session:created', data: session });
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        this.logger?.error('Failed to create session for editor panel chat:send', err);
        this.doPostMessage(state, {
          type: 'chat:sendResult',
          data: { success: false, error: errMsg },
        });
        return;
      }
    }

    // Fire-and-forget: send the prompt asynchronously
    try {
      await this.client.sendMessageAsync(sessionId, payload);
      this.doPostMessage(state, {
        type: 'chat:sendResult',
        data: { success: true },
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.logger?.error('Failed to send message from editor panel', err);
      this.doPostMessage(state, {
        type: 'chat:sendResult',
        data: { success: false, error: errMsg },
      });
    }
  }

  // ---------------------------------------------------------------------------
  //  Command list
  // ---------------------------------------------------------------------------

  private async handleCommandList(panelId: string): Promise<void> {
    const state = this.panels.get(panelId);
    if (!state) { return; }

    if (!this.client) {
      this.doPostMessage(state, { type: 'command:listed', data: { commands: [] } });
      return;
    }

    try {
      const commands = await this.client.listCommands();
      this.doPostMessage(state, {
        type: 'command:listed',
        data: {
          commands: commands.map((cmd) => ({
            name: cmd.name,
            description: cmd.description,
          })),
        },
      });
    } catch (err) {
      this.logger?.warn('Failed to fetch commands from server', err);
      this.doPostMessage(state, { type: 'command:listed', data: { commands: [] } });
    }
  }

  // ---------------------------------------------------------------------------
  //  Model preferences
  // ---------------------------------------------------------------------------

  private async ensureModelPrefs(): Promise<ModelPreferencesService | undefined> {
    if (this.modelPrefs) { return this.modelPrefs; }
    if (!this.client) { return undefined; }

    const baseUrl = this.client.getBaseUrl().trim();
    if (!baseUrl) {
      if (!this.modelPrefsBaseUrlLogged) {
        this.modelPrefsBaseUrlLogged = true;
        this.logger?.debug('Skipping editor model preferences init until client base URL is ready');
      }
      return undefined;
    }

    try {
      const pathInfo = await this.client.getPathInfo();
      this.modelPrefs = new ModelPreferencesService(pathInfo.state, this.logger);
      this.modelPrefsBaseUrlLogged = false;
      return this.modelPrefs;
    } catch (err) {
      this.logger?.warn(`Failed to initialize editor model preferences from ${baseUrl}/path`, err);
      return undefined;
    }
  }

  private async sendModelPrefs(panelId: string): Promise<void> {
    const state = this.panels.get(panelId);
    if (!state) { return; }
    const service = await this.ensureModelPrefs();
    if (!service) { return; }
    try {
      const prefs = await service.read();
      this.doPostMessage(state, { type: 'model-prefs:loaded', data: prefs });
    } catch (err) {
      this.logger?.warn('Failed to read model preferences', err);
    }
  }

  private async handleModelPrefsToggleFavorite(
    panelId: string,
    data: { providerID: string; modelID: string },
  ): Promise<void> {
    const state = this.panels.get(panelId);
    if (!state) { return; }
    const service = await this.ensureModelPrefs();
    if (!service) { return; }
    try {
      const prefs = await service.toggleFavorite(data);
      this.doPostMessage(state, { type: 'model-prefs:loaded', data: prefs });
    } catch (err) {
      this.logger?.warn('Failed to toggle favorite', err);
    }
  }

  private async handleModelPrefsAddRecent(
    panelId: string,
    data: { providerID: string; modelID: string },
  ): Promise<void> {
    const state = this.panels.get(panelId);
    if (!state) { return; }
    const service = await this.ensureModelPrefs();
    if (!service) { return; }
    try {
      const prefs = await service.addRecent(data);
      this.doPostMessage(state, { type: 'model-prefs:loaded', data: prefs });
    } catch (err) {
      this.logger?.warn('Failed to add recent model', err);
    }
  }

  private async handleModelPrefsSetVariant(
    panelId: string,
    data: { key: string; variant: string | undefined },
  ): Promise<void> {
    const state = this.panels.get(panelId);
    if (!state) { return; }
    const service = await this.ensureModelPrefs();
    if (!service) { return; }
    try {
      const prefs = await service.setVariant(data.key, data.variant);
      this.doPostMessage(state, { type: 'model-prefs:loaded', data: prefs });
    } catch (err) {
      this.logger?.warn('Failed to set variant', err);
    }
  }

  // ---------------------------------------------------------------------------
  //  File opening
  // ---------------------------------------------------------------------------

  private async openFile(
    filePath: string,
    line?: number,
    column?: number,
  ): Promise<void> {
    try {
      const uri = vscode.Uri.file(filePath);
      const doc = await vscode.workspace.openTextDocument(uri);
      const editor = await vscode.window.showTextDocument(doc);

      if (typeof line === 'number' && line > 0) {
        const pos = new vscode.Position(line - 1, (column ?? 1) - 1);
        editor.selection = new vscode.Selection(pos, pos);
        editor.revealRange(
          new vscode.Range(pos, pos),
          vscode.TextEditorRevealType.InCenter,
        );
      }
    } catch {
      vscode.window.showErrorMessage(`Failed to open file: ${filePath}`);
    }
  }

  // ---------------------------------------------------------------------------
  //  Prompt payload
  // ---------------------------------------------------------------------------

  private buildPromptPayload(
    text: string,
    images?: string[],
  ): SendMessageData | undefined {
    const parts: SendMessageData['parts'] = [];
    const normalizedText = text.trim();

    if (normalizedText) {
      parts.push({ type: 'text', text: normalizedText });
    }

    if (images?.length) {
      const imageParts = images
        .map((image, index) => this.normalizeImagePart(image, index))
        .filter((part): part is PromptFilePart => part !== undefined);

      if (imageParts.length !== images.length) {
        this.logger?.warn(
          `Skipped ${images.length - imageParts.length} invalid image attachment(s) while building prompt payload`,
        );
      }

      parts.push(...imageParts);
    }

    if (parts.length === 0) {
      return undefined;
    }

    return { parts };
  }

  private normalizeImagePart(
    image: string,
    index: number,
  ): PromptFilePart | undefined {
    const normalized = stripWrappingQuotes(image);
    if (!normalized) {
      return undefined;
    }

    if (DATA_URL_PREFIX.test(normalized)) {
      const mime = extractMimeFromDataUrl(normalized) ?? DEFAULT_IMAGE_MIME;
      return {
        type: 'file',
        mime,
        filename: `image-${index + 1}.${extensionForMime(mime)}`,
        url: normalized,
      };
    }

    const bareBase64 = normalized.replace(/\s+/g, '');
    if (!looksLikeBase64(bareBase64)) {
      return undefined;
    }

    return {
      type: 'file',
      mime: DEFAULT_IMAGE_MIME,
      filename: `image-${index + 1}.${extensionForMime(DEFAULT_IMAGE_MIME)}`,
      url: `data:${DEFAULT_IMAGE_MIME};base64,${bareBase64}`,
    };
  }

  // ---------------------------------------------------------------------------
  //  Internal helpers
  // ---------------------------------------------------------------------------

  /**
   * Cache important state on the panel so we can replay it on `ready`
   * (same pattern as ChatViewProvider).
   */
  private cacheMessageForPanel(
    state: EditorPanelState,
    message: ExtensionToWebviewMessage,
  ): void {
    switch (message.type) {
      case 'server:status':
        state.lastServerStatus = message.data;
        break;
      case 'session:loaded':
        state.lastSessionLoaded = message.data;
        state.sessionId = message.data.session.id;
        state.panel.title = message.data.session.title || 'OpenCode Chat';
        break;
      case 'session:historyPrepended':
        if (state.lastSessionLoaded?.session.id === message.data.sessionID) {
          state.lastSessionLoaded = {
            ...state.lastSessionLoaded,
            messages: prependUniqueMessages(
              state.lastSessionLoaded.messages,
              message.data.messages,
            ),
          };
        }
        break;
      case 'session:created':
        if (!state.sessionId) {
          // This panel was a draft — adopt the new session
          state.sessionId = message.data.id;
          state.panel.title = message.data.title || 'OpenCode Chat';
        }
        break;
      case 'session:updated':
        if (state.sessionId === message.data.id) {
          state.panel.title = message.data.title || 'OpenCode Chat';
        }
        break;
      case 'session:cleared':
        state.lastSessionLoaded = undefined;
        break;
      case 'session:deleted':
        if (state.sessionId && message.data.id === state.sessionId) {
          state.lastSessionLoaded = undefined;
        }
        break;
    }
  }

  /**
   * Post a message to a panel's webview, handling async errors gracefully.
   */
  private doPostMessage(
    state: EditorPanelState,
    message: ExtensionToWebviewMessage,
  ): void {
    Promise.resolve(state.panel.webview.postMessage(message))
      .then((success) => {
        if (!success) {
          this.logger?.warn(
            `SessionEditorPanel: postMessage returned false (${message.type})`,
          );
        }
      })
      .catch((err) => {
        this.logger?.error(
          `SessionEditorPanel: postMessage failed (${message.type})`,
          err,
        );
      });
  }
}

// ---------------------------------------------------------------------------
//  Pure utility functions (duplicated from chatViewProvider to avoid coupling)
// ---------------------------------------------------------------------------

function prependUniqueMessages(
  existingMessages: MessageWithParts[],
  olderMessages: SessionHistoryPrependedMessage['data']['messages'],
): MessageWithParts[] {
  const existingIds = new Set(existingMessages.map((m) => m.info.id));
  const seenOlderIds = new Set<string>();
  const uniqueOlderMessages = olderMessages.filter((m) => {
    const id = m.info.id;
    if (existingIds.has(id) || seenOlderIds.has(id)) {
      return false;
    }
    seenOlderIds.add(id);
    return true;
  });

  if (uniqueOlderMessages.length === 0) {
    return existingMessages;
  }

  return [...uniqueOlderMessages, ...existingMessages];
}

function stripWrappingQuotes(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length < 2) {
    return trimmed;
  }

  const first = trimmed[0];
  const last = trimmed[trimmed.length - 1];
  if ((first === '"' || first === '\'') && last === first) {
    return trimmed.slice(1, -1).trim();
  }

  return trimmed;
}

function extractMimeFromDataUrl(value: string): string | undefined {
  const mime = DATA_URL_MIME_PATTERN.exec(value)?.[1]?.trim().toLowerCase();
  return mime || undefined;
}

function looksLikeBase64(value: string): boolean {
  return value.length > 0 && value.length % 4 === 0 && BASE64_PATTERN.test(value);
}

function extensionForMime(mime: string): string {
  switch (mime.toLowerCase()) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/svg+xml':
      return 'svg';
    case 'image/x-icon':
    case 'image/vnd.microsoft.icon':
      return 'ico';
    default: {
      const subtype = mime.split('/')[1];
      return subtype ? subtype.split('+')[0].toLowerCase() : 'bin';
    }
  }
}
