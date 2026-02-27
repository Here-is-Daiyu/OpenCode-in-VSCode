/**
 * 会话列表 TreeView Provider
 * 在侧边栏显示所有 OpenCode 会话
 */

import * as vscode from "vscode";
import { OpenCodeClient, Session, SessionStatusMap } from "./client";

function getSessionTimestamp(session: Session): number {
  const raw =
    (session as any).updatedAt ??
    (session as any).time?.updated ??
    (session as any).createdAt ??
    (session as any).time?.created;
  if (typeof raw === "number") {
    return raw;
  }
  if (typeof raw === "string") {
    const parsed = Date.parse(raw);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return 0;
}

function getSessionStatusType(status: unknown): string | undefined {
  if (typeof status === "string") {
    return status;
  }
  if (status && typeof status === "object" && typeof (status as any).type === "string") {
    return (status as any).type;
  }
  return undefined;
}

function formatSessionTime(raw: unknown): string {
  if (typeof raw === "number") {
    return new Date(raw).toLocaleString();
  }
  if (typeof raw === "string") {
    return new Date(raw).toLocaleString();
  }
  return "未知";
}

export class SessionItem extends vscode.TreeItem {
  constructor(
    public readonly session: Session,
    public readonly status?: string
  ) {
    super(
      session.title || session.id.slice(0, 12),
      vscode.TreeItemCollapsibleState.None
    );

    this.description = this.getStatusLabel();
    this.tooltip = this.getTooltip();
    this.contextValue = status === "busy" ? "sessionBusy" : "session";
    this.iconPath = this.getIcon();

    this.command = {
      command: "opencode.selectSession",
      title: "打开会话",
      arguments: [session.id],
    };
  }

  private getStatusLabel(): string {
    const timeRaw =
      (this.session as any).updatedAt ??
      (this.session as any).time?.updated ??
      (this.session as any).createdAt ??
      (this.session as any).time?.created;
    const timeStr = formatSessionTime(timeRaw);
    const statusStr = this.status
      ? ` [${this.status === "busy" ? "运行中" : this.status === "idle" ? "空闲" : this.status}]`
      : "";
    return timeStr + statusStr;
  }

  private getTooltip(): string {
    const lines = [
      `ID: ${this.session.id}`,
      `标题: ${this.session.title || "无"}`,
      `状态: ${this.status || "unknown"}`,
      `创建: ${formatSessionTime((this.session as any).createdAt ?? (this.session as any).time?.created)}`,
      `更新: ${formatSessionTime((this.session as any).updatedAt ?? (this.session as any).time?.updated)}`,
    ];
    if (this.session.share) {
      lines.push(`分享链接: ${this.session.share}`);
    }
    return lines.join("\n");
  }

  private getIcon(): vscode.ThemeIcon {
    if (this.status === "busy") {
      return new vscode.ThemeIcon("sync~spin", new vscode.ThemeColor("charts.yellow"));
    }
    if (this.session.share) {
      return new vscode.ThemeIcon("globe", new vscode.ThemeColor("charts.blue"));
    }
    return new vscode.ThemeIcon("comment-discussion");
  }
}

export class SessionTreeProvider implements vscode.TreeDataProvider<SessionItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<SessionItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private sessions: Session[] = [];
  private statusMap: SessionStatusMap = {};
  private client: OpenCodeClient | null = null;

  setClient(client: OpenCodeClient): void {
    this.client = client;
  }

  async refresh(): Promise<void> {
    if (!this.client) return;
    try {
      const [sessions, statusMap] = await Promise.all([
        this.client.listSessions(),
        this.client.getSessionStatus().catch(() => ({})),
      ]);
      // 过滤掉子代理会话（有 parentID 的会话是子会话）
      const primarySessions = sessions.filter(
        (s) => !(s as any).parentID && !(s as any).parentId
      );
      this.sessions = primarySessions.sort(
        (a, b) => getSessionTimestamp(b) - getSessionTimestamp(a)
      );

      const normalizedStatusMap: SessionStatusMap = {};
      for (const [sessionID, status] of Object.entries(statusMap as Record<string, unknown>)) {
        const statusType = getSessionStatusType(status);
        if (statusType) {
          normalizedStatusMap[sessionID] = statusType as any;
        }
      }
      this.statusMap = normalizedStatusMap;
    } catch {
      // 如果获取失败，保持现有数据
    }
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: SessionItem): vscode.TreeItem {
    return element;
  }

  getChildren(): SessionItem[] {
    return this.sessions.map(
      (s) => new SessionItem(s, this.statusMap[s.id])
    );
  }

  dispose(): void {
    this._onDidChangeTreeData.dispose();
  }
}

/**
 * 服务状态 TreeView Provider
 * 显示 OpenCode 服务器状态、LSP、MCP 等信息
 */

export class StatusItem extends vscode.TreeItem {
  constructor(
    label: string,
    description: string,
    icon: string,
    collapsible: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.None,
    public readonly children?: StatusItem[]
  ) {
    super(label, collapsible);
    this.description = description;
    this.iconPath = new vscode.ThemeIcon(icon);
  }
}

export class StatusTreeProvider implements vscode.TreeDataProvider<StatusItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<StatusItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private items: StatusItem[] = [];
  private client: OpenCodeClient | null = null;

  setClient(client: OpenCodeClient): void {
    this.client = client;
  }

  async refresh(): Promise<void> {
    this.items = [];

    if (!this.client) {
      this.items.push(new StatusItem("服务器", "未连接", "circle-slash"));
      this._onDidChangeTreeData.fire(undefined);
      return;
    }

    try {
      // 健康状态
      const health = await this.client.health();
      this.items.push(
        new StatusItem(
          "服务器",
          health.healthy ? `v${health.version}` : "异常",
          health.healthy ? "check" : "error"
        )
      );
    } catch {
      this.items.push(new StatusItem("服务器", "无法连接", "error"));
    }

    try {
      // Provider 信息 — 只显示已连接/启用的
      const [providers, config] = await Promise.all([
        this.client.getProviders(),
        this.client.getConfig().catch(() => ({})),
      ]);
      const connected = providers.connected || [];
      const enabledProviders: string[] = (config as any)?.enabled_providers || [];
      const disabledProviders: string[] = (config as any)?.disabled_providers || [];

      // 过滤逻辑：
      // 1. disabled_providers 中的一定不显示
      // 2. 如果 enabled_providers 不为空，只显示其中的
      // 3. 然后只显示已连接的
      let visibleProviders = (providers.all || []).filter((p) => {
        if (disabledProviders.includes(p.id)) return false;
        if (enabledProviders.length > 0 && !enabledProviders.includes(p.id)) return false;
        return connected.includes(p.id);
      });

      const providerChildren = visibleProviders.map((p) => {
        return new StatusItem(
          p.name || p.id,
          `${Object.keys(p.models || {}).length} 模型`,
          "check"
        );
      });

      this.items.push(
        new StatusItem(
          "AI 提供商",
          `${providerChildren.length} 已连接`,
          "hubot",
          providerChildren.length > 0
            ? vscode.TreeItemCollapsibleState.Collapsed
            : vscode.TreeItemCollapsibleState.None,
          providerChildren
        )
      );
    } catch {
      // 忽略
    }

    try {
      // LSP 状态
      const lspStatus = await this.client.getLSPStatus();
      const lspChildren = lspStatus.map(
        (l) => new StatusItem(l.name, l.status, l.status === "running" ? "check" : "circle-slash")
      );
      this.items.push(
        new StatusItem(
          "LSP 服务器",
          `${lspStatus.length} 个`,
          "symbol-method",
          lspChildren.length > 0
            ? vscode.TreeItemCollapsibleState.Collapsed
            : vscode.TreeItemCollapsibleState.None,
          lspChildren
        )
      );
    } catch {
      // 忽略
    }

    try {
      // MCP 状态
      const mcpStatus = await this.client.getMCPStatus();
      const mcpNames = Object.keys(mcpStatus);
      const mcpChildren = mcpNames.map(
        (name) =>
          new StatusItem(
            name,
            mcpStatus[name]?.status || "unknown",
            mcpStatus[name]?.status === "connected" ? "check" : "circle-slash"
          )
      );
      this.items.push(
        new StatusItem(
          "MCP 服务器",
          `${mcpNames.length} 个`,
          "extensions",
          mcpChildren.length > 0
            ? vscode.TreeItemCollapsibleState.Collapsed
            : vscode.TreeItemCollapsibleState.None,
          mcpChildren
        )
      );
    } catch {
      // 忽略
    }

    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: StatusItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: StatusItem): StatusItem[] {
    if (element && element.children) {
      return element.children;
    }
    return this.items;
  }

  dispose(): void {
    this._onDidChangeTreeData.dispose();
  }
}
