import type {
  HealthResponse,
  OpenCodeConfig,
  Provider,
  Session,
  SessionStatus,
  Todo,
  MessageWithParts,
  Agent,
  FileDiff,
  MCPStatus,
  MCPServerConfig,
  LSPStatus,
  ProviderInfoResponse,
  FormatterStatus,
  PathInfo,
} from '../types/opencode';
import { Logger } from './logger';

// ---------------------------------------------------------------------------
//  Error types
// ---------------------------------------------------------------------------

/**
 * Error thrown when the OpenCode API returns a non-2xx response.
 */
export class OpenCodeApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly statusText: string,
    public readonly body: unknown,
    public readonly url: string,
  ) {
    super(`OpenCode API error ${status} (${statusText}) for ${url}`);
    this.name = 'OpenCodeApiError';
  }
}

/**
 * Error thrown when a request to the OpenCode API times out.
 */
export class OpenCodeTimeoutError extends Error {
  constructor(
    public readonly url: string,
    public readonly timeoutMs: number,
  ) {
    super(`OpenCode API request timed out after ${timeoutMs}ms for ${url}`);
    this.name = 'OpenCodeTimeoutError';
  }
}

// ---------------------------------------------------------------------------
//  Types used only by the client
// ---------------------------------------------------------------------------

/** Options for creating a new session. */
export interface CreateSessionOptions {
  title?: string;
  agent?: string;
  model?: string;
}

/** Text prompt part accepted by the API. */
export interface PromptTextPart {
  type: 'text';
  text: string;
}

/** File / image prompt part accepted by the API. */
export interface PromptFilePart {
  type: 'file';
  mime: string;
  filename?: string;
  url: string;
}

/** Prompt part accepted by `/message`, `/prompt`, and `/prompt_async`. */
export type PromptPart = PromptTextPart | PromptFilePart;

/** Payload for sending a message. */
export interface SendMessageData {
  parts: PromptPart[];
  agent?: string;
  model?: string;
}

/** Backward-compatible alias for file prompt parts. */
export type MessageAttachment = PromptFilePart;

/** Payload for updating a session. */
export interface UpdateSessionData {
  title?: string;
}

/** Command definition returned by the server. */
export interface Command {
  id: string;
  name: string;
  description?: string;
  template?: string;
  agent?: string;
  subtask?: boolean;
}

/** Provider listing response. */
export interface ProvidersResponse {
  providers: Provider[];
  default: Record<string, string>;
  connected: string[];
}

/** SSE event received from the server. */
export interface ServerEvent {
  type: string;
  properties: Record<string, unknown>;
  directory?: string;
}

interface RawServerEvent {
  type: string;
  properties?: Record<string, unknown>;
}

interface GlobalServerEvent {
  directory?: string;
  payload: RawServerEvent;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// ---------------------------------------------------------------------------
//  Client
// ---------------------------------------------------------------------------

/** Default HTTP request timeout (30 seconds). */
const DEFAULT_TIMEOUT_MS = 30_000;

/** Delay before reconnecting after an SSE connection failure. */
const SSE_RECONNECT_DELAY_MS = 3_000;

/** Delay before reconnecting after an SSE stream ends normally. */
const SSE_ERROR_RETRY_DELAY_MS = 1_000;

/**
 * OpenCode REST API client.
 *
 * Uses the native `fetch()` API (Node 20+) so we have full control over
 * requests without depending on any external SDK at this stage.
 *
 * All methods throw {@link OpenCodeApiError} on non-2xx responses and
 * {@link OpenCodeTimeoutError} when a request exceeds the configured timeout.
 */
export class OpenCodeClient {
  private baseUrl = '';
  private timeoutMs: number = DEFAULT_TIMEOUT_MS;
  private logger: Logger | null = null;
  private authHeader: string | null = null;

  constructor() {}

  // ---------------------------------------------------------------------------
  //  Validation
  // ---------------------------------------------------------------------------

  /**
   * Validate that a required ID parameter is not empty.
   * @throws If the id is falsy or an empty string.
   */
  private requireId(id: string, name: string): string {
    if (!id) {
      throw new Error(`${name} is required`);
    }
    return id;
  }

  // ---------------------------------------------------------------------------
  //  Configuration
  // ---------------------------------------------------------------------------

  /**
   * Set the base URL for all API calls (e.g. `http://127.0.0.1:12345`).
   */
  setBaseUrl(url: string): void {
    // Strip trailing slashes
    this.baseUrl = url.replace(/\/+$/, '');
  }

  /**
   * Returns the current base URL.
   */
  getBaseUrl(): string {
    return this.baseUrl;
  }

  /**
   * Set the request timeout (in milliseconds).
   */
  setTimeout(ms: number): void {
    this.timeoutMs = ms;
  }

  /**
   * Attach a {@link Logger} instance for request/response debug logging.
   */
  setLogger(logger: Logger): void {
    this.logger = logger;
  }

  /**
   * Configure HTTP Basic Auth credentials.
   *
   * @param username - The username (or set via `OPENCODE_AUTH_USER` env var).
   * @param password - The password (or set via `OPENCODE_AUTH_PASS` env var).
   */
  setAuth(username: string, password: string): void {
    const encoded = Buffer.from(`${username}:${password}`).toString('base64');
    this.authHeader = `Basic ${encoded}`;
  }

  /**
   * Clear any previously configured authentication.
   */
  clearAuth(): void {
    this.authHeader = null;
  }

  /**
   * Attempt to configure auth from environment variables
   * `OPENCODE_AUTH_USER` / `OPENCODE_AUTH_PASS`.
   */
  configureAuthFromEnv(): void {
    const user = process.env.OPENCODE_AUTH_USER;
    const pass = process.env.OPENCODE_AUTH_PASS;
    if (user && pass) {
      this.setAuth(user, pass);
      this.logger?.debug('Auth configured from environment variables');
    }
  }

  // ---------------------------------------------------------------------------
  //  Health & Global
  // ---------------------------------------------------------------------------

  /**
   * Check server health.
   *
   * `GET /global/health`
   */
  async health(): Promise<HealthResponse> {
    return this.get<HealthResponse>('/global/health');
  }

  /**
   * Subscribe to server-sent events (SSE) from the `/global/event` endpoint.
   * Falls back to `/event` for older servers.
   *
   * Returns an `AbortController` that the caller can use to cancel the
   * subscription.
   *
   * @param callback - Invoked for every received event.
   */
  subscribeToEvents(
    callback: (event: ServerEvent) => void,
  ): AbortController {
    const controller = new AbortController();
    const urls = [`${this.baseUrl}/global/event`, `${this.baseUrl}/event`];

    // Run asynchronously — intentionally not awaited
    void this.consumeSSE(urls, controller.signal, callback);

    return controller;
  }

  // ---------------------------------------------------------------------------
  //  Config
  // ---------------------------------------------------------------------------

  /**
   * Get the current server configuration.
   *
   * `GET /config`
   */
  async getConfig(): Promise<OpenCodeConfig> {
    return this.get<OpenCodeConfig>('/config');
  }

  /**
   * Update the server configuration.
   *
   * `PUT /config`
   */
  async updateConfig(config: Partial<OpenCodeConfig>): Promise<OpenCodeConfig> {
    return this.put<OpenCodeConfig>('/config', config);
  }

  /**
   * List available providers and their models.
   *
   * `GET /config/providers`
   */
  async getProviders(): Promise<ProvidersResponse> {
    return this.get<ProvidersResponse>('/config/providers');
  }

  // ---------------------------------------------------------------------------
  //  Sessions
  // ---------------------------------------------------------------------------

  /**
   * List all sessions.
   *
   * `GET /session`
   */
  async listSessions(): Promise<Session[]> {
    return this.get<Session[]>('/session');
  }

  /**
   * Create a new session.
   *
   * `POST /session`
   */
  async createSession(options?: CreateSessionOptions): Promise<Session> {
    return this.post<Session>('/session', options ?? {});
  }

  /**
   * Get a single session by ID.
   *
   * `GET /session/:id`
   */
  async getSession(id: string): Promise<Session> {
    this.requireId(id, 'Session ID');
    return this.get<Session>(`/session/${enc(id)}`);
  }

  /**
   * Delete a session.
   *
   * `DELETE /session/:id`
   */
  async deleteSession(id: string): Promise<boolean> {
    this.requireId(id, 'Session ID');
    await this.delete(`/session/${enc(id)}`);
    return true;
  }

  /**
   * Update session metadata (e.g. title).
   *
   * `PUT /session/:id`
   */
  async updateSession(id: string, data: UpdateSessionData): Promise<Session> {
    this.requireId(id, 'Session ID');
    return this.put<Session>(`/session/${enc(id)}`, data);
  }

  /**
   * Get the status of all active sessions.
   *
   * `GET /session/status`
   */
  async getSessionStatus(): Promise<Record<string, SessionStatus>> {
    return this.get<Record<string, SessionStatus>>('/session/status');
  }

  /**
   * Get child sessions (subtasks) of a session.
   *
   * `GET /session/:id/children`
   */
  async getSessionChildren(id: string): Promise<Session[]> {
    return this.get<Session[]>(`/session/${enc(id)}/children`);
  }

  /**
   * Get todos associated with a session.
   *
   * `GET /session/:id/todo`
   */
  async getSessionTodos(id: string): Promise<Todo[]> {
    return this.get<Todo[]>(`/session/${enc(id)}/todo`);
  }

  /**
   * Fork a session, optionally from a specific message.
   *
   * `POST /session/:id/fork`
   */
  async forkSession(id: string, messageID?: string): Promise<Session> {
    const body: Record<string, unknown> = {};
    if (messageID) {
      body.messageID = messageID;
    }
    return this.post<Session>(`/session/${enc(id)}/fork`, body);
  }

  /**
   * Abort a running session.
   *
   * `POST /session/:id/abort`
   */
  async abortSession(id: string): Promise<boolean> {
    this.requireId(id, 'Session ID');
    await this.post(`/session/${enc(id)}/abort`, {});
    return true;
  }

  /**
   * Share a session (make it publicly accessible).
   *
   * `POST /session/:id/share`
   */
  async shareSession(id: string): Promise<Session> {
    return this.post<Session>(`/session/${enc(id)}/share`, {});
  }

  /**
   * Un-share a session (revoke public access).
   *
   * `DELETE /session/:id/share`
   */
  async unshareSession(id: string): Promise<Session> {
    return this.delete<Session>(`/session/${enc(id)}/share`);
  }

  /**
   * Get the file diff for a session, optionally for a specific message.
   *
   * `GET /session/:id/diff`
   */
  async getSessionDiff(id: string, messageID?: string): Promise<FileDiff[]> {
    const params = messageID ? `?messageID=${enc(messageID)}` : '';
    return this.get<FileDiff[]>(`/session/${enc(id)}/diff${params}`);
  }

  /**
   * Revert a session to a previous message state.
   *
   * `POST /session/:id/revert`
   */
  async revertSession(id: string, messageID: string, partID?: string): Promise<boolean> {
    const body: Record<string, unknown> = { messageID };
    if (partID) {
      body.partID = partID;
    }
    await this.post(`/session/${enc(id)}/revert`, body);
    return true;
  }

  /**
   * Undo a previous revert operation.
   *
   * `POST /session/:id/unrevert`
   */
  async unrevertSession(id: string): Promise<boolean> {
    await this.post(`/session/${enc(id)}/unrevert`, {});
    return true;
  }

  /**
   * Respond to a permission request within a session.
   *
   * `POST /session/:sessionID/permission/:permissionID`
   */
  async respondToPermission(
    sessionID: string,
    permissionID: string,
    response: string,
    remember?: boolean,
  ): Promise<boolean> {
    const body: Record<string, unknown> = { response };
    if (remember !== undefined) {
      body.remember = remember;
    }
    await this.post(
      `/session/${enc(sessionID)}/permission/${enc(permissionID)}`,
      body,
    );
    return true;
  }

  // ---------------------------------------------------------------------------
  //  Messages
  // ---------------------------------------------------------------------------

  /**
   * List messages in a session.
   *
   * `GET /session/:id/message`
   */
  async listMessages(sessionID: string, limit?: number): Promise<MessageWithParts[]> {
    this.requireId(sessionID, 'Session ID');
    const params = limit ? `?limit=${limit}` : '';
    return this.get<MessageWithParts[]>(`/session/${enc(sessionID)}/message${params}`);
  }

  /**
   * Send a synchronous message to a session (waits for completion).
   *
   * `POST /session/:id/prompt`
   */
  async sendMessage(sessionID: string, data: SendMessageData): Promise<MessageWithParts> {
    this.requireId(sessionID, 'Session ID');
    return this.post<MessageWithParts>(`/session/${enc(sessionID)}/prompt`, data);
  }

  /**
   * Send an asynchronous message to a session (returns immediately).
   * Progress can be tracked via SSE.
   *
   * `POST /session/:id/prompt_async`
   */
  async sendMessageAsync(sessionID: string, data: SendMessageData): Promise<void> {
    this.requireId(sessionID, 'Session ID');
    await this.post(`/session/${enc(sessionID)}/prompt_async`, data);
  }

  /**
   * Get a single message (with parts) from a session.
   *
   * `GET /session/:id/message/:messageID`
   */
  async getMessage(sessionID: string, messageID: string): Promise<MessageWithParts> {
    this.requireId(sessionID, 'Session ID');
    this.requireId(messageID, 'Message ID');
    return this.get<MessageWithParts>(
      `/session/${enc(sessionID)}/message/${enc(messageID)}`,
    );
  }

  /**
   * Execute a slash command within a session.
   *
   * `POST /session/:id/command`
   */
  async executeCommand(
    sessionID: string,
    command: string,
    args?: string,
    agent?: string,
    model?: string,
  ): Promise<MessageWithParts> {
    const body: Record<string, unknown> = { command };
    if (args !== undefined) { body.args = args; }
    if (agent !== undefined) { body.agent = agent; }
    if (model !== undefined) { body.model = model; }
    return this.post<MessageWithParts>(`/session/${enc(sessionID)}/command`, body);
  }

  // ---------------------------------------------------------------------------
  //  Agents & Commands
  // ---------------------------------------------------------------------------

  /**
   * List available agents.
   *
   * `GET /agent`
   */
  async listAgents(): Promise<Agent[]> {
    return this.get<Agent[]>('/agent');
  }

  /**
   * List available slash commands.
   *
   * `GET /command`
   */
  async listCommands(): Promise<Command[]> {
    return this.get<Command[]>('/command');
  }

  // ---------------------------------------------------------------------------
  //  Files
  // ---------------------------------------------------------------------------

  /**
   * Search for text patterns across the project.
   *
   * `GET /file/search/text?pattern=...`
   */
  async searchText(pattern: string): Promise<unknown[]> {
    return this.get<unknown[]>(`/file/search/text?pattern=${enc(pattern)}`);
  }

  /**
   * Search for files by name / query.
   *
   * `GET /file/search/files?query=...`
   */
  async searchFiles(query: string): Promise<string[]> {
    return this.get<string[]>(`/file/search/files?query=${enc(query)}`);
  }

  /**
   * Read a file's contents.
   *
   * `GET /file/read?path=...`
   */
  async readFile(path: string): Promise<unknown> {
    return this.get<unknown>(`/file/read?path=${enc(path)}`);
  }

  /**
   * Get the status of tracked files (modified, added, etc.).
   *
   * `GET /file/status`
   */
  async getFileStatus(): Promise<unknown[]> {
    return this.get<unknown[]>('/file/status');
  }

  // ---------------------------------------------------------------------------
  //  MCP
  // ---------------------------------------------------------------------------

  /**
   * Get the status of all MCP servers.
   *
   * `GET /mcp`
   */
  async getMCPStatus(): Promise<Record<string, MCPStatus>> {
    return this.get<Record<string, MCPStatus>>('/mcp');
  }

  /**
   * Add (or update) an MCP server configuration.
   *
   * `POST /mcp/server`
   */
  async addMCPServer(name: string, config: MCPServerConfig): Promise<MCPStatus> {
    return this.post<MCPStatus>('/mcp/server', { name, ...config });
  }

  // ---------------------------------------------------------------------------
  //  LSP
  // ---------------------------------------------------------------------------

  /**
   * Get the status of LSP servers.
   *
   * `GET /lsp`
   */
  async getLSPStatus(): Promise<LSPStatus[]> {
    return this.get<LSPStatus[]>('/lsp');
  }

  // ---------------------------------------------------------------------------
  //  Provider info
  // ---------------------------------------------------------------------------

  /**
   * Get full provider info including connection status.
   *
   * `GET /provider`
   */
  async getProviderInfo(): Promise<ProviderInfoResponse> {
    return this.get<ProviderInfoResponse>('/provider');
  }

  // ---------------------------------------------------------------------------
  //  Path info
  // ---------------------------------------------------------------------------

  /**
   * Return filesystem paths (home, config dir, state dir, etc.).
   *
   * `GET /path`
   */
  async getPathInfo(): Promise<PathInfo> {
    return this.get<PathInfo>('/path');
  }

  // ---------------------------------------------------------------------------
  //  Formatter
  // ---------------------------------------------------------------------------

  /**
   * Get formatter status.
   *
   * `GET /formatter`
   */
  async getFormatterStatus(): Promise<FormatterStatus[]> {
    return this.get<FormatterStatus[]>('/formatter');
  }

  // ---------------------------------------------------------------------------
  //  Auth
  // ---------------------------------------------------------------------------

  /**
   * Set authentication credentials for a provider.
   *
   * `POST /auth`
   */
  async setProviderAuth(providerID: string, credentials: Record<string, string>): Promise<boolean> {
    await this.post('/auth', { providerID, ...credentials });
    return true;
  }

  // ---------------------------------------------------------------------------
  //  SSE helper
  // ---------------------------------------------------------------------------

  /**
   * Consume a Server-Sent Events stream.
   */
  private async consumeSSE(
    urls: readonly string[],
    signal: AbortSignal,
    callback: (event: ServerEvent) => void,
  ): Promise<void> {
    let urlIndex = 0;

    while (!signal.aborted) {
      const url = urls[urlIndex] ?? urls[0];

      try {
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            Accept: 'text/event-stream',
            ...this.buildAuthHeaders(),
          },
          signal,
        });

        if (!response.ok) {
          if ((response.status === 404 || response.status === 405) && urlIndex < urls.length - 1) {
            const nextUrl = urls[urlIndex + 1];
            this.logger?.warn(`SSE endpoint unavailable (${response.status}) — falling back to ${nextUrl}`);
            urlIndex += 1;
            continue;
          }

          this.logger?.warn(`SSE connection failed: ${response.status} ${response.statusText}`);
          // Wait before reconnecting
          await this.sleep(SSE_RECONNECT_DELAY_MS, signal);
          continue;
        }

        if (!response.body) {
          this.logger?.warn('SSE response has no body');
          await this.sleep(SSE_RECONNECT_DELAY_MS, signal);
          continue;
        }

        this.logger?.debug('SSE connection established');

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let currentEventType = '';
        let currentData = '';

        try {
          while (!signal.aborted) {
            const { done, value } = await reader.read();
            if (done) { break; }

            buffer += decoder.decode(value, { stream: true });

            // Process complete lines
            const lines = buffer.split('\n');
            // Keep the last (possibly incomplete) line in the buffer
            buffer = lines.pop() ?? '';

            for (const line of lines) {
              if (line.startsWith('event:')) {
                currentEventType = line.slice(6).trim();
              } else if (line.startsWith('data:')) {
                currentData += `${line.slice(5).trim()}\n`;
              } else if (line === '') {
                // Empty line = end of event
                if (currentData) {
                  try {
                    const event = this.parseServerEvent(currentData.trim(), currentEventType);
                    if (event) {
                      callback(event);
                    } else {
                      this.logger?.warn('Ignoring SSE payload with unrecognized event shape');
                    }
                  } catch (parseErr) {
                    this.logger?.warn('Failed to parse SSE data:', String(parseErr));
                  }
                }
                currentEventType = '';
                currentData = '';
              }
            }
          }
        } finally {
          reader.releaseLock();
        }

        // If we got here without abort, the stream ended — reconnect
        if (!signal.aborted) {
          this.logger?.debug('SSE stream ended — reconnecting…');
          await this.sleep(SSE_ERROR_RETRY_DELAY_MS, signal);
        }
      } catch (err) {
        if (signal.aborted) { break; }
        this.logger?.warn('SSE error:', err instanceof Error ? err.message : String(err));
        await this.sleep(SSE_RECONNECT_DELAY_MS, signal);
      }
    }

    this.logger?.debug('SSE subscription cancelled');
  }

  private parseServerEvent(data: string, fallbackType?: string): ServerEvent | undefined {
    const parsed = JSON.parse(data) as unknown;
    if (!isRecord(parsed)) {
      return undefined;
    }

    const globalEvent = parsed as Partial<GlobalServerEvent>;
    if (isRecord(globalEvent.payload) && typeof globalEvent.payload.type === 'string') {
      return {
        type: globalEvent.payload.type,
        properties: isRecord(globalEvent.payload.properties) ? globalEvent.payload.properties : {},
        directory: typeof globalEvent.directory === 'string' ? globalEvent.directory : undefined,
      };
    }

    const directEvent = parsed as Partial<RawServerEvent> & { directory?: unknown };
    if (typeof directEvent.type === 'string') {
      return {
        type: directEvent.type,
        properties: isRecord(directEvent.properties) ? directEvent.properties : {},
        directory: typeof directEvent.directory === 'string' ? directEvent.directory : undefined,
      };
    }

    if (!fallbackType) {
      return undefined;
    }

    return {
      type: fallbackType,
      properties: parsed,
      directory: typeof directEvent.directory === 'string' ? directEvent.directory : undefined,
    };
  }

  // ---------------------------------------------------------------------------
  //  HTTP helpers
  // ---------------------------------------------------------------------------

  private async get<T>(path: string): Promise<T> {
    return this.request<T>('GET', path);
  }

  private async post<T = void>(path: string, body: unknown): Promise<T> {
    return this.request<T>('POST', path, body);
  }

  private async put<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('PUT', path, body);
  }

  private async delete<T = void>(path: string): Promise<T> {
    return this.request<T>('DELETE', path);
  }

  /**
   * Core HTTP request method.
   */
  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...this.buildAuthHeaders(),
    };

    const init: RequestInit = {
      method,
      headers,
      signal: controller.signal,
    };

    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }

    this.logger?.debug(`→ ${method} ${path}`);

    try {
      const response = await fetch(url, init);
      clearTimeout(timeoutId);

      const responseBody = await this.parseResponseBody(response);

      this.logger?.debug(`← ${response.status} ${response.statusText} ${path}`);

      if (!response.ok) {
        throw new OpenCodeApiError(response.status, response.statusText, responseBody, url);
      }

      return responseBody as T;
    } catch (err) {
      clearTimeout(timeoutId);

      if (err instanceof OpenCodeApiError) {
        throw err;
      }

      // AbortError = timeout
      if (err instanceof Error && err.name === 'AbortError') {
        throw new OpenCodeTimeoutError(url, this.timeoutMs);
      }

      // Re-throw with context
      throw new Error(
        `OpenCode API request failed: ${method} ${path} — ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * Parse an HTTP response body while handling empty / no-content responses.
   */
  private async parseResponseBody(response: Response): Promise<unknown> {
    if (response.status === 204 || response.status === 205) {
      return undefined;
    }

    const contentLength = response.headers.get('content-length');
    if (contentLength === '0') {
      return undefined;
    }

    const text = await response.text();
    if (text.trim().length === 0) {
      return undefined;
    }

    const contentType = response.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      return JSON.parse(text) as unknown;
    }

    return text;
  }

  /**
   * Build the Authorization header (if credentials are configured).
   */
  private buildAuthHeaders(): Record<string, string> {
    if (this.authHeader) {
      return { Authorization: this.authHeader };
    }
    return {};
  }

  /**
   * Sleep for the given duration, respecting an AbortSignal.
   */
  private sleep(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise<void>((resolve) => {
      if (signal?.aborted) {
        resolve();
        return;
      }
      const timer = setTimeout(resolve, ms);
      signal?.addEventListener('abort', () => {
        clearTimeout(timer);
        resolve();
      }, { once: true });
    });
  }
}

// ---------------------------------------------------------------------------
//  Utilities
// ---------------------------------------------------------------------------

/** URL-encode a path segment or query parameter. */
function enc(value: string): string {
  return encodeURIComponent(value);
}
