/**
 * OpenCode API 客户端 - 基于 @opencode-ai/sdk 的兼容适配层
 * 对外保留原有 OpenCodeClient 方法签名，尽量减少上层改动。
 */

import { createOpencodeClient, type OpencodeClient as SDKClient } from "@opencode-ai/sdk/client";

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
  parts: Array<{ type: "text"; text: string } | { type: "file"; mime: string; filename: string; url: string }>;
  model?: { providerID: string; modelID: string };
  agent?: string;
  variant?: string;
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
  limit?: { context?: number; output?: number };
  capabilities?: {
    input?: { image?: boolean };
    reasoning?: boolean;
  };
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

// OAuth 授权相关类型
export interface OAuthAuthorizeResult {
  url: string;
  state?: string;
}

export interface OAuthCallbackResult {
  success: boolean;
  providerID: string;
  error?: string;
}

// TUI 控制请求/响应类型
export interface TuiControlRequest {
  id: string;
  type: string;
  payload?: Record<string, any>;
}

export interface TuiControlResponse {
  id: string;
  result?: any;
  error?: string;
}

// Question 工具数据结构
export interface QuestionOption {
  label: string;
  value: string;
  description?: string;
}

export interface QuestionToolData {
  question: string;
  options?: QuestionOption[];
  multiSelect?: boolean;
  allowCustomInput?: boolean;
  defaultValue?: string;
  placeholder?: string;
}

// ============================================================
// API 客户端
// ============================================================

export class OpenCodeClient {
  private baseUrl: string;
  private directory: string;
  private sdk: SDKClient;
  private abortControllers: Set<AbortController> = new Set();

  constructor(baseUrl: string, directory?: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.directory = directory || "";
    this.sdk = this.createSdkClient();
  }

  get url(): string {
    return this.baseUrl;
  }

  updateBaseUrl(url: string): void {
    this.baseUrl = url.replace(/\/$/, "");
    this.sdk = this.createSdkClient();
  }

  dispose(): void {
    for (const controller of this.abortControllers) {
      controller.abort();
    }
    this.abortControllers.clear();
  }

  private createSdkClient(): SDKClient {
    return createOpencodeClient({
      baseUrl: this.baseUrl,
      directory: this.directory || undefined,
      responseStyle: "data",
      throwOnError: true,
    });
  }

  private toError(error: unknown): Error {
    if (error instanceof Error) {
      return error;
    }
    if (typeof error === "string") {
      return new Error(error || "未知错误");
    }
    if (error && typeof error === "object") {
      // 处理 { message: string } 或 { error: string } 等对象格式
      const obj = error as Record<string, any>;
      if (typeof obj.message === "string" && obj.message) {
        return new Error(obj.message);
      }
      if (typeof obj.error === "string" && obj.error) {
        return new Error(obj.error);
      }
    }
    try {
      const str = JSON.stringify(error);
      return new Error(str && str !== "{}" ? str : "未知错误");
    } catch {
      return new Error("未知错误");
    }
  }

  private async withAbort<T>(operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const controller = new AbortController();
    this.abortControllers.add(controller);
    try {
      return await operation(controller.signal);
    } finally {
      this.abortControllers.delete(controller);
    }
  }

  private unwrapSdkResult<T>(result: any): T {
    if (
      result &&
      typeof result === "object" &&
      "request" in result &&
      "response" in result &&
      ("data" in result || "error" in result)
    ) {
      if (result.error !== undefined && result.error !== null) {
        throw this.toError(result.error);
      }
      return result.data as T;
    }
    return result as T;
  }

  private async sdkCall<T>(operation: (signal: AbortSignal) => Promise<any>): Promise<T> {
    const result = await this.withAbort((signal) => operation(signal));
    return this.unwrapSdkResult<T>(result);
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

  private async rawRequest<T>(
    method: string,
    path: string,
    body?: any,
    query?: Record<string, string>
  ): Promise<T> {
    return this.withAbort(async (signal) => {
      let url = `${this.baseUrl}${path}`;
      if (query && Object.keys(query).length > 0) {
        const params = new URLSearchParams(query);
        url += `?${params.toString()}`;
      }

      const response = await fetch(url, {
        method,
        headers: this.getHeaders(),
        body: body ? JSON.stringify(body) : undefined,
        signal,
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => "");
        throw new Error(`API 错误 ${response.status}: ${response.statusText} - ${errorBody}`);
      }

      if (response.status === 204) {
        return undefined as T;
      }

      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        return (await response.json()) as T;
      }
      return (await response.text()) as unknown as T;
    });
  }

  private toModelString(model?: { providerID: string; modelID: string }): string | undefined {
    if (!model?.providerID || !model?.modelID) {
      return undefined;
    }
    return `${model.providerID}/${model.modelID}`;
  }

  private toToolsMap(tools?: string[]): Record<string, boolean> | undefined {
    if (!tools || tools.length === 0) {
      return undefined;
    }
    return Object.fromEntries(tools.map((tool) => [tool, true]));
  }

  private mapPromptBody(body: PromptBody): Record<string, any> {
    const mapped: Record<string, any> = {
      ...body,
      tools: this.toToolsMap(body.tools),
    };
    if (!mapped.tools) {
      delete mapped.tools;
    }
    return mapped;
  }

  private normalizePermissionResponse(
    response: string,
    remember?: boolean
  ): "once" | "always" | "reject" {
    if (response === "deny" || response === "reject") {
      return "reject";
    }
    return remember ? "always" : "once";
  }

  private normalizeFindText(results: any[]): TextSearchResult[] {
    return (results || []).map((item) => {
      const submatches = Array.isArray(item?.submatches)
        ? item.submatches.map((sub: any) => ({
            match:
              typeof sub?.match === "string"
                ? sub.match
                : typeof sub?.match?.text === "string"
                  ? sub.match.text
                  : "",
            start: Number(sub?.start ?? 0),
            end: Number(sub?.end ?? 0),
          }))
        : [];
      return {
        path:
          typeof item?.path === "string"
            ? item.path
            : typeof item?.path?.text === "string"
              ? item.path.text
              : "",
        lines:
          typeof item?.lines === "string"
            ? item.lines
            : typeof item?.lines?.text === "string"
              ? item.lines.text
              : "",
        line_number: Number(item?.line_number ?? 0),
        absolute_offset: Number(item?.absolute_offset ?? 0),
        submatches,
      };
    });
  }

  private normalizeSymbols(symbols: any[]): SymbolInfo[] {
    return (symbols || []).map((symbol) => {
      const uri = String(symbol?.location?.uri ?? "");
      let path = uri;
      if (uri.startsWith("file://")) {
        try {
          const url = new URL(uri);
          path = decodeURIComponent(url.pathname);
          if (/^\/[A-Za-z]:\//.test(path)) {
            path = path.slice(1);
          }
        } catch {
          path = uri.replace(/^file:\/\//, "");
        }
      }
      return {
        name: String(symbol?.name ?? ""),
        kind: String(symbol?.kind ?? ""),
        location: {
          path,
          range: {
            start: {
              line: Number(symbol?.location?.range?.start?.line ?? 0),
              character: Number(symbol?.location?.range?.start?.character ?? 0),
            },
            end: {
              line: Number(symbol?.location?.range?.end?.line ?? 0),
              character: Number(symbol?.location?.range?.end?.character ?? 0),
            },
          },
        },
      };
    });
  }

  private normalizeFileContent(file: any): FileContent {
    if (typeof file?.diff === "string" && file.diff.length > 0) {
      return {
        type: "patch",
        content: file.diff,
      };
    }
    return {
      type: "raw",
      content: typeof file?.content === "string" ? file.content : "",
    };
  }

  private normalizeSSEEvent(payload: unknown): SSEEvent {
    if (!payload || typeof payload !== "object") {
      return {
        type: "raw",
        properties: { data: payload },
      };
    }
    const data = payload as Record<string, any>;
    return {
      type: typeof data.type === "string" ? data.type : "unknown",
      properties:
        data.properties && typeof data.properties === "object"
          ? (data.properties as Record<string, any>)
          : data,
    };
  }

  // ---- Global ----

  async health(): Promise<HealthInfo> {
    // SDK 当前不暴露 /global/health，保留轻量回退。
    return this.rawRequest<HealthInfo>("GET", "/global/health");
  }

  // ---- Project ----

  async listProjects(): Promise<Project[]> {
    return this.sdkCall<Project[]>((signal) => this.sdk.project.list({ signal }));
  }

  async currentProject(): Promise<Project> {
    return this.sdkCall<Project>((signal) => this.sdk.project.current({ signal }));
  }

  // ---- Config ----

  async getConfig(): Promise<Record<string, any>> {
    return this.sdkCall<Record<string, any>>((signal) => this.sdk.config.get({ signal }));
  }

  async updateConfig(config: Record<string, any>): Promise<Record<string, any>> {
    return this.sdkCall<Record<string, any>>((signal) =>
      this.sdk.config.update({ body: config, signal })
    );
  }

  async getProviders(): Promise<ProvidersInfo> {
    return this.sdkCall<ProvidersInfo>((signal) => this.sdk.provider.list({ signal }));
  }

  async getProviderAuth(): Promise<Record<string, any[]>> {
    return this.sdkCall<Record<string, any[]>>((signal) => this.sdk.provider.auth({ signal }));
  }

  async getConfigProviders(): Promise<ConfigProviders> {
    return this.sdkCall<ConfigProviders>((signal) => this.sdk.config.providers({ signal }));
  }

  // ---- Sessions ----

  async listSessions(): Promise<Session[]> {
    return this.sdkCall<Session[]>((signal) => this.sdk.session.list({ signal }));
  }

  async getSession(id: string): Promise<Session> {
    return this.sdkCall<Session>((signal) => this.sdk.session.get({ path: { id }, signal }));
  }

  async createSession(title?: string, parentID?: string): Promise<Session> {
    return this.sdkCall<Session>((signal) =>
      this.sdk.session.create({ body: { title, parentID }, signal })
    );
  }

  async deleteSession(id: string): Promise<boolean> {
    return this.sdkCall<boolean>((signal) => this.sdk.session.delete({ path: { id }, signal }));
  }

  async updateSession(id: string, title: string): Promise<Session> {
    return this.sdkCall<Session>((signal) =>
      this.sdk.session.update({ path: { id }, body: { title }, signal })
    );
  }

  async getSessionStatus(): Promise<SessionStatusMap> {
    return this.sdkCall<SessionStatusMap>((signal) => this.sdk.session.status({ signal }));
  }

  async getSessionChildren(id: string): Promise<Session[]> {
    return this.sdkCall<Session[]>((signal) => this.sdk.session.children({ path: { id }, signal }));
  }

  async getSessionTodo(id: string): Promise<TodoItem[]> {
    return this.sdkCall<TodoItem[]>((signal) => this.sdk.session.todo({ path: { id }, signal }));
  }

  async forkSession(id: string, messageID?: string): Promise<Session> {
    return this.sdkCall<Session>((signal) =>
      this.sdk.session.fork({ path: { id }, body: { messageID }, signal })
    );
  }

  async abortSession(id: string): Promise<boolean> {
    return this.sdkCall<boolean>((signal) => this.sdk.session.abort({ path: { id }, signal }));
  }

  async shareSession(id: string): Promise<Session> {
    return this.sdkCall<Session>((signal) => this.sdk.session.share({ path: { id }, signal }));
  }

  async unshareSession(id: string): Promise<Session> {
    return this.sdkCall<Session>((signal) => this.sdk.session.unshare({ path: { id }, signal }));
  }

  async getSessionDiff(id: string, messageID?: string): Promise<FileDiff[]> {
    return this.sdkCall<FileDiff[]>((signal) =>
      this.sdk.session.diff({ path: { id }, query: { messageID }, signal })
    );
  }

  async summarizeSession(
    id: string,
    providerID: string,
    modelID: string
  ): Promise<boolean> {
    return this.sdkCall<boolean>((signal) =>
      this.sdk.session.summarize({
        path: { id },
        body: { providerID, modelID },
        signal,
      })
    );
  }

  async initSession(
    id: string,
    messageID: string,
    providerID: string,
    modelID: string
  ): Promise<boolean> {
    return this.sdkCall<boolean>((signal) =>
      this.sdk.session.init({
        path: { id },
        body: { messageID, providerID, modelID },
        signal,
      })
    );
  }

  async revertMessage(
    id: string,
    messageID: string,
    partID?: string
  ): Promise<boolean> {
    await this.sdkCall<unknown>((signal) =>
      this.sdk.session.revert({
        path: { id },
        body: { messageID, partID },
        signal,
      })
    );
    return true;
  }

  async unrevertMessages(id: string): Promise<boolean> {
    await this.sdkCall<unknown>((signal) =>
      this.sdk.session.unrevert({
        path: { id },
        signal,
      })
    );
    return true;
  }

  async respondToPermission(
    sessionID: string,
    permissionID: string,
    response: string,
    remember?: boolean
  ): Promise<boolean> {
    return this.sdkCall<boolean>((signal) =>
      this.sdk.postSessionIdPermissionsPermissionId({
        path: { id: sessionID, permissionID },
        body: {
          response: this.normalizePermissionResponse(response, remember),
        },
        signal,
      })
    );
  }

  // ---- Messages ----

  async listMessages(sessionID: string, limit?: number): Promise<MessageWithParts[]> {
    return this.sdkCall<MessageWithParts[]>((signal) =>
      this.sdk.session.messages({
        path: { id: sessionID },
        query: limit ? { limit } : undefined,
        signal,
      })
    );
  }

  async getMessage(sessionID: string, messageID: string): Promise<MessageWithParts> {
    return this.sdkCall<MessageWithParts>((signal) =>
      this.sdk.session.message({
        path: { id: sessionID, messageID },
        signal,
      })
    );
  }

  async sendPrompt(sessionID: string, body: PromptBody): Promise<MessageWithParts> {
    return this.sdkCall<MessageWithParts>((signal) =>
      this.sdk.session.prompt({
        path: { id: sessionID },
        body: this.mapPromptBody(body) as any,
        signal,
      })
    );
  }

  async sendPromptAsync(sessionID: string, body: PromptBody): Promise<void> {
    await this.sdkCall<unknown>((signal) =>
      this.sdk.session.promptAsync({
        path: { id: sessionID },
        body: this.mapPromptBody(body) as any,
        signal,
      })
    );
  }

  async sendCommand(sessionID: string, body: CommandBody): Promise<MessageWithParts> {
    const payload: Record<string, any> = {
      command: body.command,
      arguments: body.arguments ?? "",
      agent: body.agent,
      model: this.toModelString(body.model),
    };
    if (!payload.agent) {
      delete payload.agent;
    }
    if (!payload.model) {
      delete payload.model;
    }
    return this.sdkCall<MessageWithParts>((signal) =>
      this.sdk.session.command({
        path: { id: sessionID },
        body: payload as any,
        signal,
      })
    );
  }

  async runShell(sessionID: string, body: ShellBody): Promise<MessageWithParts> {
    // SDK 类型要求 agent 必填，保留兼容回退以继续支持可选 agent。
    return this.rawRequest<MessageWithParts>("POST", `/session/${sessionID}/shell`, body);
  }

  // ---- Files ----

  async listFiles(path?: string): Promise<FileNode[]> {
    if (!path) {
      return this.rawRequest<FileNode[]>("GET", "/file");
    }
    return this.sdkCall<FileNode[]>((signal) =>
      this.sdk.file.list({
        query: { path },
        signal,
      })
    );
  }

  async readFile(path: string): Promise<FileContent> {
    const data = await this.sdkCall<any>((signal) =>
      this.sdk.file.read({
        query: { path },
        signal,
      })
    );
    return this.normalizeFileContent(data);
  }

  async fileStatus(): Promise<any[]> {
    return this.sdkCall<any[]>((signal) => this.sdk.file.status({ signal }));
  }

  // ---- Find / Search ----

  async findText(pattern: string): Promise<TextSearchResult[]> {
    const results = await this.sdkCall<any[]>((signal) =>
      this.sdk.find.text({
        query: { pattern },
        signal,
      })
    );
    return this.normalizeFindText(results as any[]);
  }

  async findFiles(
    query: string,
    type?: "file" | "directory",
    limit?: number
  ): Promise<string[]> {
    // 兼容老接口：支持 type + limit。SDK 仅支持 dirs 标记且无 limit。
    if (typeof limit === "number") {
      const params: Record<string, string> = { query, limit: String(limit) };
      if (type) {
        params.type = type;
      }
      return this.rawRequest<string[]>("GET", "/find/file", undefined, params);
    }

    const dirs = type ? (type === "directory" ? "true" : "false") : undefined;
    return this.sdkCall<string[]>((signal) =>
      this.sdk.find.files({
        query: { query, dirs },
        signal,
      })
    );
  }

  async findSymbols(query: string): Promise<SymbolInfo[]> {
    const symbols = await this.sdkCall<any[]>((signal) =>
      this.sdk.find.symbols({
        query: { query },
        signal,
      })
    );
    return this.normalizeSymbols(symbols as any[]);
  }

  // ---- Agents & Commands ----

  async listAgents(): Promise<Agent[]> {
    return this.sdkCall<Agent[]>((signal) => this.sdk.app.agents({ signal }));
  }

  async listCommands(): Promise<Command[]> {
    return this.sdkCall<Command[]>((signal) => this.sdk.command.list({ signal }));
  }

  // ---- Auth ----

  async setAuth(providerID: string, body: { type: string; key: string }): Promise<boolean> {
    return this.sdkCall<boolean>((signal) =>
      this.sdk.auth.set({
        path: { id: providerID },
        body: body as any,
        signal,
      })
    );
  }

  // ---- OAuth 授权 ----

  async oauthAuthorize(providerId: string): Promise<OAuthAuthorizeResult> {
    return this.rawRequest<OAuthAuthorizeResult>(
      "POST",
      `/provider/${encodeURIComponent(providerId)}/oauth/authorize`
    );
  }

  async oauthCallback(
    providerId: string,
    code: string,
    state: string
  ): Promise<OAuthCallbackResult> {
    return this.rawRequest<OAuthCallbackResult>(
      "POST",
      `/provider/${encodeURIComponent(providerId)}/oauth/callback`,
      { code, state }
    );
  }

  // ---- MCP ----

  async getMCPStatus(): Promise<MCPStatus> {
    return this.sdkCall<MCPStatus>((signal) => this.sdk.mcp.status({ signal }));
  }

  async addMCP(name: string, config: Record<string, any>): Promise<any> {
    return this.sdkCall<any>((signal) =>
      this.sdk.mcp.add({
        body: { name, config } as any,
        signal,
      })
    );
  }

  // ---- LSP & Formatter ----

  async getLSPStatus(): Promise<LSPStatus[]> {
    return this.sdkCall<LSPStatus[]>((signal) => this.sdk.lsp.status({ signal }));
  }

  async getFormatterStatus(): Promise<any[]> {
    return this.sdkCall<any[]>((signal) => this.sdk.formatter.status({ signal }));
  }

  // ---- Tools ----

  async listToolIDs(): Promise<string[]> {
    return this.sdkCall<string[]>((signal) => this.sdk.tool.ids({ signal }));
  }

  async listTools(provider: string, model: string): Promise<any[]> {
    return this.sdkCall<any[]>((signal) =>
      this.sdk.tool.list({
        query: { provider, model },
        signal,
      })
    );
  }

  // ---- TUI ----

  async tuiAppendPrompt(text: string): Promise<boolean> {
    return this.sdkCall<boolean>((signal) => this.sdk.tui.appendPrompt({ body: { text }, signal }));
  }

  async tuiSubmitPrompt(): Promise<boolean> {
    return this.sdkCall<boolean>((signal) => this.sdk.tui.submitPrompt({ signal }));
  }

  async tuiClearPrompt(): Promise<boolean> {
    return this.sdkCall<boolean>((signal) => this.sdk.tui.clearPrompt({ signal }));
  }

  async tuiExecuteCommand(command: string): Promise<boolean> {
    return this.sdkCall<boolean>((signal) =>
      this.sdk.tui.executeCommand({
        body: { command },
        signal,
      })
    );
  }

  async tuiShowToast(message: string, variant?: string, title?: string): Promise<boolean> {
    const safeVariant =
      variant === "success" || variant === "warning" || variant === "error" || variant === "info"
        ? variant
        : "info";
    return this.sdkCall<boolean>((signal) =>
      this.sdk.tui.showToast({
        body: {
          message,
          title,
          variant: safeVariant,
        },
        signal,
      })
    );
  }

  async openHelp(): Promise<boolean> {
    return this.rawRequest<boolean>("POST", "/tui/open-help");
  }

  async openSessions(): Promise<boolean> {
    return this.rawRequest<boolean>("POST", "/tui/open-sessions");
  }

  async openThemes(): Promise<boolean> {
    return this.rawRequest<boolean>("POST", "/tui/open-themes");
  }

  async openModels(): Promise<boolean> {
    return this.rawRequest<boolean>("POST", "/tui/open-models");
  }

  // ---- TUI 控制请求/响应 ----

  async getNextControlRequest(): Promise<TuiControlRequest | null> {
    try {
      return await this.rawRequest<TuiControlRequest>("GET", "/tui/control/next");
    } catch (error) {
      // 无待处理请求时可能返回 404 或空响应
      if (error instanceof Error && error.message.includes("404")) {
        return null;
      }
      throw error;
    }
  }

  async sendControlResponse(body: TuiControlResponse): Promise<boolean> {
    return this.rawRequest<boolean>("POST", "/tui/control/response", body);
  }

  // ---- VCS ----

  async getVcsInfo(): Promise<any> {
    return this.sdkCall<any>((signal) => this.sdk.vcs.get({ signal }));
  }

  // ---- Path ----

  async getPath(): Promise<any> {
    return this.sdkCall<any>((signal) => this.sdk.path.get({ signal }));
  }

  // ---- Instance ----

  async dispose_instance(): Promise<boolean> {
    return this.sdkCall<boolean>((signal) => this.sdk.instance.dispose({ signal }));
  }

  // ---- Logging ----

  async log(
    service: string,
    level: string,
    message: string,
    extra?: Record<string, any>
  ): Promise<boolean> {
    const safeLevel =
      level === "debug" || level === "info" || level === "warn" || level === "error"
        ? level
        : "info";
    return this.sdkCall<boolean>((signal) =>
      this.sdk.app.log({
        body: {
          service,
          level: safeLevel,
          message,
          extra,
        },
        signal,
      })
    );
  }

  // ---- SSE 事件订阅 ----

  subscribeEvents(
    onEvent: (event: SSEEvent) => void,
    onError?: (error: Error) => void
  ): AbortController {
    const controller = new AbortController();
    this.abortControllers.add(controller);

    const start = async (): Promise<void> => {
      try {
        const { stream } = await this.sdk.event.subscribe({
          signal: controller.signal,
          onSseError: (error: unknown) => {
            if (!controller.signal.aborted) {
              onError?.(this.toError(error));
            }
          },
        });

        for await (const payload of stream) {
          if (controller.signal.aborted) {
            break;
          }
          try {
            onEvent(this.normalizeSSEEvent(payload));
          } catch (error) {
            onError?.(this.toError(error));
          }
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          onError?.(this.toError(error));
        }
      } finally {
        this.abortControllers.delete(controller);
      }
    };

    void start();
    return controller;
  }

  // ---- 全局 SSE 事件订阅（独立于项目级 /event） ----

  subscribeGlobalEvents(
    onEvent: (event: SSEEvent) => void,
    onError?: (error: Error) => void
  ): AbortController {
    const controller = new AbortController();
    this.abortControllers.add(controller);

    const start = async (): Promise<void> => {
      try {
        const url = `${this.baseUrl}/global/event`;
        const response = await fetch(url, {
          headers: {
            Accept: "text/event-stream",
            ...this.getHeaders(),
          },
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`全局 SSE 连接失败: ${response.status} ${response.statusText}`);
        }

        if (!response.body) {
          throw new Error("全局 SSE 响应无 body");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (!controller.signal.aborted) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = line.slice(6).trim();
              if (!data) {
                continue;
              }
              try {
                const parsed = JSON.parse(data);
                onEvent(this.normalizeSSEEvent(parsed));
              } catch {
                // 非 JSON 数据，作为原始事件传递
                onEvent({ type: "raw", properties: { data } });
              }
            }
          }
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          onError?.(this.toError(error));
        }
      } finally {
        this.abortControllers.delete(controller);
      }
    };

    void start();
    return controller;
  }
}
