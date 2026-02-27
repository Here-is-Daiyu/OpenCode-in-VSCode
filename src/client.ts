/**
 * OpenCode API 客户端 - 封装所有 HTTP REST API 调用
 * 直接使用 fetch 而不依赖 SDK，保持扩展轻量
 */

import * as vscode from "vscode";

// ============================================================
// 类型定义
// ============================================================

export interface HealthInfo {
  healthy: boolean;
  version: string;
}

export interface Project {
  id: string;
  path: string;
  name: string;
  createdAt: string;
}

export interface Session {
  id: string;
  title?: string;
  parentID?: string;
  modelID?: string;
  providerID?: string;
  createdAt: string;
  updatedAt: string;
  share?: string;
}

export type SessionStatus = "idle" | "busy" | "retry";

export interface SessionStatusMap {
  [sessionID: string]: SessionStatus;
}

export interface MessagePart {
  id: string;
  type: string;
  [key: string]: any;
}

export interface TextPart extends MessagePart {
  type: "text";
  text: string;
}

export interface ToolPart extends MessagePart {
  type: "tool";
  tool: string;
  state: {
    status: string;
    input?: any;
    output?: string;
    error?: string;
  };
}

export interface FilePart extends MessagePart {
  type: "file";
  mediaType: string;
  filename: string;
  url: string;
}

export interface SnapshotPart extends MessagePart {
  type: "snapshot";
  content: string;
}

export interface PatchPart extends MessagePart {
  type: "patch";
  file: string;
  content: string;
}

export type AnyPart = TextPart | ToolPart | FilePart | SnapshotPart | PatchPart | MessagePart;

export interface MessageInfo {
  id: string;
  sessionID: string;
  role: "user" | "assistant";
  model?: { providerID: string; modelID: string };
  system?: boolean;
  createdAt: string;
  error?: {
    name: string;
    message?: string;
  };
}

export interface MessageWithParts {
  info: MessageInfo;
  parts: AnyPart[];
}

export interface PromptBody {
  parts: Array<{ type: "text"; text: string } | { type: "file"; mediaType: string; filename: string; url: string }>;
  model?: { providerID: string; modelID: string };
  agent?: string;
  noReply?: boolean;
  system?: string;
  tools?: string[];
  format?: {
    type: "json_schema" | "text";
    schema?: Record<string, any>;
    retryCount?: number;
  };
}

export interface CommandBody {
  command: string;
  arguments?: string;
  agent?: string;
  model?: { providerID: string; modelID: string };
}

export interface ShellBody {
  command: string;
  agent?: string;
  model?: { providerID: string; modelID: string };
}

export interface Provider {
  id: string;
  name: string;
  source?: string;
  env?: string[];
  models: Record<string, ProviderModel>;
}

export interface ProviderModel {
  id: string;
  name: string;
  providerID?: string;
  family?: string;
  status?: string;
  [key: string]: any;
}

export interface ProvidersInfo {
  all: Provider[];
  default: Record<string, string>;
  connected: string[];
}

export interface Agent {
  id: string;
  name: string;
  description?: string;
  mode?: "primary" | "subagent";
  model?: string;
  hidden?: boolean;
  tools?: string[];
  color?: string;
  reasoningEffort?: string;
  textVerbosity?: string;
}

export interface ConfigProviders {
  providers: Provider[];
  default: Record<string, string>;
}

export interface Command {
  name: string;
  description?: string;
  args?: Array<{ name: string; description?: string; required?: boolean }>;
}

export interface FileDiff {
  path: string;
  status: string;
  hunks: Array<{
    header: string;
    lines: string[];
  }>;
}

export interface FileNode {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: FileNode[];
}

export interface FileContent {
  type: "raw" | "patch";
  content: string;
}

export interface TextSearchResult {
  path: string;
  lines: string;
  line_number: number;
  absolute_offset: number;
  submatches: Array<{ match: string; start: number; end: number }>;
}

export interface SymbolInfo {
  name: string;
  kind: string;
  location: {
    path: string;
    range: {
      start: { line: number; character: number };
      end: { line: number; character: number };
    };
  };
}

export interface TodoItem {
  id: string;
  content: string;
  status: string;
  priority: string;
}

export interface PermissionRequest {
  id: string;
  sessionID: string;
  description: string;
  action: string;
  metadata?: Record<string, any>;
}

export interface MCPStatus {
  [name: string]: {
    status: string;
    tools?: Array<{ name: string; description?: string }>;
  };
}

export interface LSPStatus {
  name: string;
  status: string;
}

export interface SSEEvent {
  type: string;
  properties: Record<string, any>;
}

// ============================================================
// API 客户端
// ============================================================

export class OpenCodeClient {
  private baseUrl: string;
  private directory: string;
  private abortControllers: Set<AbortController> = new Set();

  constructor(baseUrl: string, directory?: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.directory = directory || "";
  }

  get url(): string {
    return this.baseUrl;
  }

  updateBaseUrl(url: string): void {
    this.baseUrl = url.replace(/\/$/, "");
  }

  dispose(): void {
    for (const controller of this.abortControllers) {
      controller.abort();
    }
    this.abortControllers.clear();
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.directory) {
      headers["x-opencode-directory"] = encodeURIComponent(this.directory);
    }
    return headers;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: any,
    query?: Record<string, string>
  ): Promise<T> {
    let url = `${this.baseUrl}${path}`;
    if (query) {
      const params = new URLSearchParams(query);
      url += `?${params.toString()}`;
    }

    const controller = new AbortController();
    this.abortControllers.add(controller);

    try {
      const response = await fetch(url, {
        method,
        headers: this.getHeaders(),
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => "");
        throw new Error(`API 错误 ${response.status}: ${response.statusText} - ${errorBody}`);
      }

      // 204 无内容
      if (response.status === 204) {
        return undefined as T;
      }

      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        return (await response.json()) as T;
      }

      return (await response.text()) as unknown as T;
    } finally {
      this.abortControllers.delete(controller);
    }
  }

  // ---- Global ----

  async health(): Promise<HealthInfo> {
    return this.request<HealthInfo>("GET", "/global/health");
  }

  // ---- Project ----

  async listProjects(): Promise<Project[]> {
    return this.request<Project[]>("GET", "/project");
  }

  async currentProject(): Promise<Project> {
    return this.request<Project>("GET", "/project/current");
  }

  // ---- Config ----

  async getConfig(): Promise<Record<string, any>> {
    return this.request<Record<string, any>>("GET", "/config");
  }

  async updateConfig(config: Record<string, any>): Promise<Record<string, any>> {
    return this.request<Record<string, any>>("PATCH", "/config", config);
  }

  async getProviders(): Promise<ProvidersInfo> {
    return this.request<ProvidersInfo>("GET", "/provider");
  }

  async getProviderAuth(): Promise<Record<string, any[]>> {
    return this.request<Record<string, any[]>>("GET", "/provider/auth");
  }

  async getConfigProviders(): Promise<ConfigProviders> {
    return this.request<ConfigProviders>("GET", "/config/providers");
  }

  // ---- Sessions ----

  async listSessions(): Promise<Session[]> {
    return this.request<Session[]>("GET", "/session");
  }

  async getSession(id: string): Promise<Session> {
    return this.request<Session>("GET", `/session/${id}`);
  }

  async createSession(title?: string, parentID?: string): Promise<Session> {
    return this.request<Session>("POST", "/session", { title, parentID });
  }

  async deleteSession(id: string): Promise<boolean> {
    return this.request<boolean>("DELETE", `/session/${id}`);
  }

  async updateSession(id: string, title: string): Promise<Session> {
    return this.request<Session>("PATCH", `/session/${id}`, { title });
  }

  async getSessionStatus(): Promise<SessionStatusMap> {
    return this.request<SessionStatusMap>("GET", "/session/status");
  }

  async getSessionChildren(id: string): Promise<Session[]> {
    return this.request<Session[]>("GET", `/session/${id}/children`);
  }

  async getSessionTodo(id: string): Promise<TodoItem[]> {
    return this.request<TodoItem[]>("GET", `/session/${id}/todo`);
  }

  async forkSession(id: string, messageID?: string): Promise<Session> {
    return this.request<Session>("POST", `/session/${id}/fork`, { messageID });
  }

  async abortSession(id: string): Promise<boolean> {
    return this.request<boolean>("POST", `/session/${id}/abort`);
  }

  async shareSession(id: string): Promise<Session> {
    return this.request<Session>("POST", `/session/${id}/share`);
  }

  async unshareSession(id: string): Promise<Session> {
    return this.request<Session>("DELETE", `/session/${id}/share`);
  }

  async getSessionDiff(id: string, messageID?: string): Promise<FileDiff[]> {
    const query: Record<string, string> = {};
    if (messageID) {
      query.messageID = messageID;
    }
    return this.request<FileDiff[]>("GET", `/session/${id}/diff`, undefined, query);
  }

  async summarizeSession(
    id: string,
    providerID: string,
    modelID: string
  ): Promise<boolean> {
    return this.request<boolean>("POST", `/session/${id}/summarize`, {
      providerID,
      modelID,
    });
  }

  async initSession(
    id: string,
    messageID: string,
    providerID: string,
    modelID: string
  ): Promise<boolean> {
    return this.request<boolean>("POST", `/session/${id}/init`, {
      messageID,
      providerID,
      modelID,
    });
  }

  async revertMessage(
    id: string,
    messageID: string,
    partID?: string
  ): Promise<boolean> {
    return this.request<boolean>("POST", `/session/${id}/revert`, {
      messageID,
      partID,
    });
  }

  async unrevertMessages(id: string): Promise<boolean> {
    return this.request<boolean>("POST", `/session/${id}/unrevert`);
  }

  async respondToPermission(
    sessionID: string,
    permissionID: string,
    response: string,
    remember?: boolean
  ): Promise<boolean> {
    return this.request<boolean>(
      "POST",
      `/session/${sessionID}/permissions/${permissionID}`,
      { response, remember }
    );
  }

  // ---- Messages ----

  async listMessages(sessionID: string, limit?: number): Promise<MessageWithParts[]> {
    const query: Record<string, string> = {};
    if (limit) {
      query.limit = String(limit);
    }
    return this.request<MessageWithParts[]>(
      "GET",
      `/session/${sessionID}/message`,
      undefined,
      query
    );
  }

  async getMessage(sessionID: string, messageID: string): Promise<MessageWithParts> {
    return this.request<MessageWithParts>(
      "GET",
      `/session/${sessionID}/message/${messageID}`
    );
  }

  async sendPrompt(sessionID: string, body: PromptBody): Promise<MessageWithParts> {
    return this.request<MessageWithParts>(
      "POST",
      `/session/${sessionID}/message`,
      body
    );
  }

  async sendPromptAsync(sessionID: string, body: PromptBody): Promise<void> {
    return this.request<void>(
      "POST",
      `/session/${sessionID}/prompt_async`,
      body
    );
  }

  async sendCommand(sessionID: string, body: CommandBody): Promise<MessageWithParts> {
    return this.request<MessageWithParts>(
      "POST",
      `/session/${sessionID}/command`,
      body
    );
  }

  async runShell(sessionID: string, body: ShellBody): Promise<MessageWithParts> {
    return this.request<MessageWithParts>(
      "POST",
      `/session/${sessionID}/shell`,
      body
    );
  }

  // ---- Files ----

  async listFiles(path?: string): Promise<FileNode[]> {
    const query: Record<string, string> = {};
    if (path) {
      query.path = path;
    }
    return this.request<FileNode[]>("GET", "/file", undefined, query);
  }

  async readFile(path: string): Promise<FileContent> {
    return this.request<FileContent>("GET", "/file/content", undefined, { path });
  }

  async fileStatus(): Promise<any[]> {
    return this.request<any[]>("GET", "/file/status");
  }

  // ---- Find / Search ----

  async findText(pattern: string): Promise<TextSearchResult[]> {
    return this.request<TextSearchResult[]>("GET", "/find", undefined, { pattern });
  }

  async findFiles(
    query: string,
    type?: "file" | "directory",
    limit?: number
  ): Promise<string[]> {
    const params: Record<string, string> = { query };
    if (type) params.type = type;
    if (limit) params.limit = String(limit);
    return this.request<string[]>("GET", "/find/file", undefined, params);
  }

  async findSymbols(query: string): Promise<SymbolInfo[]> {
    return this.request<SymbolInfo[]>("GET", "/find/symbol", undefined, { query });
  }

  // ---- Agents & Commands ----

  async listAgents(): Promise<Agent[]> {
    return this.request<Agent[]>("GET", "/agent");
  }

  async listCommands(): Promise<Command[]> {
    return this.request<Command[]>("GET", "/command");
  }

  // ---- Auth ----

  async setAuth(providerID: string, body: { type: string; key: string }): Promise<boolean> {
    return this.request<boolean>("PUT", `/auth/${providerID}`, body);
  }

  // ---- MCP ----

  async getMCPStatus(): Promise<MCPStatus> {
    return this.request<MCPStatus>("GET", "/mcp");
  }

  async addMCP(name: string, config: Record<string, any>): Promise<any> {
    return this.request<any>("POST", "/mcp", { name, config });
  }

  // ---- LSP & Formatter ----

  async getLSPStatus(): Promise<LSPStatus[]> {
    return this.request<LSPStatus[]>("GET", "/lsp");
  }

  async getFormatterStatus(): Promise<any[]> {
    return this.request<any[]>("GET", "/formatter");
  }

  // ---- Tools ----

  async listToolIDs(): Promise<string[]> {
    return this.request<string[]>("GET", "/experimental/tool/ids");
  }

  async listTools(provider: string, model: string): Promise<any[]> {
    return this.request<any[]>("GET", "/experimental/tool", undefined, { provider, model });
  }

  // ---- TUI ----

  async tuiAppendPrompt(text: string): Promise<boolean> {
    return this.request<boolean>("POST", "/tui/append-prompt", { text });
  }

  async tuiSubmitPrompt(): Promise<boolean> {
    return this.request<boolean>("POST", "/tui/submit-prompt");
  }

  async tuiClearPrompt(): Promise<boolean> {
    return this.request<boolean>("POST", "/tui/clear-prompt");
  }

  async tuiExecuteCommand(command: string): Promise<boolean> {
    return this.request<boolean>("POST", "/tui/execute-command", { command });
  }

  async tuiShowToast(message: string, variant?: string, title?: string): Promise<boolean> {
    return this.request<boolean>("POST", "/tui/show-toast", { message, variant, title });
  }

  // ---- VCS ----

  async getVcsInfo(): Promise<any> {
    return this.request<any>("GET", "/vcs");
  }

  // ---- Path ----

  async getPath(): Promise<any> {
    return this.request<any>("GET", "/path");
  }

  // ---- Instance ----

  async dispose_instance(): Promise<boolean> {
    return this.request<boolean>("POST", "/instance/dispose");
  }

  // ---- Logging ----

  async log(
    service: string,
    level: string,
    message: string,
    extra?: Record<string, any>
  ): Promise<boolean> {
    return this.request<boolean>("POST", "/log", { service, level, message, extra });
  }

  // ---- SSE 事件订阅 ----

  subscribeEvents(
    onEvent: (event: SSEEvent) => void,
    onError?: (error: Error) => void
  ): AbortController {
    const controller = new AbortController();
    this.abortControllers.add(controller);

    const url = `${this.baseUrl}/event`;
    const headers = this.getHeaders();
    delete headers["Content-Type"];
    headers["Accept"] = "text/event-stream";

    this._connectSSE(url, headers, controller, onEvent, onError);

    return controller;
  }

  private async _connectSSE(
    url: string,
    headers: Record<string, string>,
    controller: AbortController,
    onEvent: (event: SSEEvent) => void,
    onError?: (error: Error) => void,
    retryDelay: number = 1000
  ): Promise<void> {
    try {
      const response = await fetch(url, {
        headers,
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`SSE 连接失败: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("无法获取 SSE 响应流");
      }

      const decoder = new TextDecoder();
      let buffer = "";
      let eventType = "";
      let eventDataLines: string[] = [];

      const flushEvent = (): void => {
        if (eventDataLines.length === 0) {
          eventType = "";
          return;
        }

        const eventData = eventDataLines.join("\n");
        try {
          const parsed = JSON.parse(eventData);
          onEvent({
            type: eventType || parsed.type || "unknown",
            properties: parsed.properties || parsed,
          });
        } catch {
          onEvent({
            type: eventType || "raw",
            properties: { data: eventData },
          });
        }

        eventType = "";
        eventDataLines = [];
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const rawLine of lines) {
          const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
          if (line.startsWith(":")) {
            continue;
          }

          if (line.startsWith("event:")) {
            eventType = line.slice(6).trim();
            continue;
          }

          if (line.startsWith("data:")) {
            eventDataLines.push(line.slice(5).trimStart());
            continue;
          }

          if (line === "") {
            // 空行表示事件结束
            flushEvent();
          }
        }
      }

      const trailing = buffer.trim();
      if (trailing.startsWith("data:")) {
        eventDataLines.push(trailing.slice(5).trimStart());
      }
      flushEvent();

      // 流正常结束，如果没有被 abort，自动重连
      if (!controller.signal.aborted) {
        setTimeout(() => {
          this._connectSSE(url, headers, controller, onEvent, onError, retryDelay);
        }, retryDelay);
      }
    } catch (error: any) {
      if (controller.signal.aborted) return;
      onError?.(error);
      // 自动重连
      setTimeout(() => {
        this._connectSSE(
          url,
          headers,
          controller,
          onEvent,
          onError,
          Math.min(retryDelay * 2, 30000)
        );
      }, retryDelay);
    }
  }
}
