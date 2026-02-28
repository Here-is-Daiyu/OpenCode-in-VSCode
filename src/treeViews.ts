/**
 * 会话列表 TreeView Provider
 * 在侧边栏显示所有 OpenCode 会话
 */

import * as vscode from "vscode";
import { OpenCodeClient, Session, SessionStatusMap, ProvidersInfo, MCPStatus, LSPStatus, Agent } from "./client";

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
    public readonly status?: string,
    public readonly childCount?: number
  ) {
    super(
      session.title || session.id.slice(0, 12),
      childCount && childCount > 0
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None
    );

    this.description = this.getStatusLabel();
    this.tooltip = this.getTooltip();
    this.contextValue = this.getContextValue();
    this.iconPath = this.getIcon();

    this.command = {
      command: "opencode.selectSession",
      title: "打开会话",
      arguments: [session.id],
    };
  }

  private getContextValue(): string {
    if (this.status === "busy") return "sessionBusy";
    if (this.session.parentID) return "sessionChild";
    if (this.childCount && this.childCount > 0) return "sessionParent";
    return "session";
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
    const childStr = this.childCount && this.childCount > 0
      ? ` (${this.childCount} 个子会话)`
      : "";
    return timeStr + statusStr + childStr;
  }

  private getTooltip(): string {
    const lines = [
      `ID: ${this.session.id}`,
      `标题: ${this.session.title || "无"}`,
      `状态: ${this.status || "unknown"}`,
      `创建: ${formatSessionTime((this.session as any).createdAt ?? (this.session as any).time?.created)}`,
      `更新: ${formatSessionTime((this.session as any).updatedAt ?? (this.session as any).time?.updated)}`,
    ];
    if (this.session.parentID) {
      lines.push(`父会话: ${this.session.parentID.slice(0, 12)}`);
    }
    if (this.childCount && this.childCount > 0) {
      lines.push(`子会话数: ${this.childCount}`);
    }
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
    if (this.session.parentID) {
      return new vscode.ThemeIcon("git-commit", new vscode.ThemeColor("charts.green"));
    }
    if (this.childCount && this.childCount > 0) {
      return new vscode.ThemeIcon("repo-forked", new vscode.ThemeColor("charts.purple"));
    }
    return new vscode.ThemeIcon("comment-discussion");
  }
}

export class SessionTreeProvider implements vscode.TreeDataProvider<SessionItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<SessionItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private allSessions: Session[] = [];
  private statusMap: SessionStatusMap = {};
  private childrenMap: Map<string, Session[]> = new Map();
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

      this.allSessions = sessions.sort(
        (a, b) => getSessionTimestamp(b) - getSessionTimestamp(a)
      );

      // 构建 parentID → children 映射
      this.childrenMap.clear();
      for (const s of this.allSessions) {
        const pid = (s as any).parentID || (s as any).parentId;
        if (pid) {
          const arr = this.childrenMap.get(pid) || [];
          arr.push(s);
          this.childrenMap.set(pid, arr);
        }
      }

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

  getChildren(element?: SessionItem): SessionItem[] {
    if (!element) {
      // 根级: 只显示没有 parentID 的会话
      const rootSessions = this.allSessions.filter(
        (s) => !(s as any).parentID && !(s as any).parentId
      );
      return rootSessions.map(
        (s) => new SessionItem(s, this.statusMap[s.id], (this.childrenMap.get(s.id) || []).length)
      );
    }

    // 子级: 显示该会话的子会话
    const children = this.childrenMap.get(element.session.id) || [];
    return children
      .sort((a, b) => getSessionTimestamp(b) - getSessionTimestamp(a))
      .map(
        (s) => new SessionItem(s, this.statusMap[s.id], (this.childrenMap.get(s.id) || []).length)
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
    public readonly children?: StatusItem[],
    iconColor?: string
  ) {
    super(label, collapsible);
    this.description = description;
    this.iconPath = iconColor
      ? new vscode.ThemeIcon(icon, new vscode.ThemeColor(iconColor))
      : new vscode.ThemeIcon(icon);
  }
}

export class StatusTreeProvider implements vscode.TreeDataProvider<StatusItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<StatusItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private items: StatusItem[] = [];
  private client: OpenCodeClient | null = null;
  private refreshTimer: ReturnType<typeof setInterval> | null = null;

  setClient(client: OpenCodeClient): void {
    this.client = client;
  }

  /**
   * 启动定时自动刷新（每 30 秒）
   */
  startAutoRefresh(): void {
    this.stopAutoRefresh();
    this.refreshTimer = setInterval(() => {
      this.refresh();
    }, 30_000);
  }

  /**
   * 停止定时自动刷新
   */
  stopAutoRefresh(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  async refresh(): Promise<void> {
    this.items = [];

    if (!this.client) {
      this.items.push(
        new StatusItem("服务器", "未连接", "circle-slash", vscode.TreeItemCollapsibleState.None, undefined, "charts.red")
      );
      this._onDidChangeTreeData.fire(undefined);
      return;
    }

    // 并行拉取所有状态数据，各自独立处理异常
    const [healthResult, providersResult, configResult, mcpResult, lspResult, formatterResult, agentsResult, toolsResult] = await Promise.allSettled([
      this.client.health(),
      this.client.getProviders(),
      this.client.getConfig(),
      this.client.getMCPStatus(),
      this.client.getLSPStatus(),
      this.client.getFormatterStatus(),
      this.client.listAgents(),
      this.client.listToolIDs(),
    ]);

    const health = healthResult.status === "fulfilled" ? healthResult.value : null;
    const providers = providersResult.status === "fulfilled" ? providersResult.value : null;
    const config = configResult.status === "fulfilled" ? configResult.value : null;
    const mcpStatus = mcpResult.status === "fulfilled" ? mcpResult.value : null;
    const lspStatus = lspResult.status === "fulfilled" ? lspResult.value : null;
    const formatterStatus = formatterResult.status === "fulfilled" ? formatterResult.value : null;
    const agents = agentsResult.status === "fulfilled" ? agentsResult.value : null;
    const tools = toolsResult.status === "fulfilled" ? toolsResult.value : null;

    // ---- 服务器 ----
    this.buildServerSection(health, config);

    // ---- Providers ----
    this.buildProviderSection(providers, config);

    // ---- MCP 服务器 ----
    this.buildMCPSection(mcpStatus);

    // ---- LSP 服务器 ----
    this.buildLSPSection(lspStatus);

    // ---- Formatter ----
    this.buildFormatterSection(formatterStatus);

    // ---- 工具 ----
    this.buildToolsSection(tools, config);

    // ---- 配置 ----
    this.buildConfigSection(config, agents);

    this._onDidChangeTreeData.fire(undefined);
  }

  /**
   * 服务器状态区域：URL、连接状态、版本、模型、Agent
   */
  private buildServerSection(health: { healthy: boolean; version: string } | null, config: Record<string, any> | null): void {
    if (!health) {
      this.items.push(
        new StatusItem("服务器", "无法连接", "error", vscode.TreeItemCollapsibleState.None, undefined, "charts.red")
      );
      return;
    }

    const serverUrl = this.client?.url || "未知";
    const serverChildren: StatusItem[] = [];

    // 连接状态
    serverChildren.push(
      health.healthy
        ? new StatusItem("连接状态", "已连接", "pass-filled", vscode.TreeItemCollapsibleState.None, undefined, "charts.green")
        : new StatusItem("连接状态", "异常", "error", vscode.TreeItemCollapsibleState.None, undefined, "charts.red")
    );

    // 版本
    serverChildren.push(
      new StatusItem("版本", `v${health.version}`, "versions")
    );

    // 服务器地址
    serverChildren.push(
      new StatusItem("地址", serverUrl, "globe")
    );

    // 当前模型
    const currentModel = (config as any)?.model || "未设置";
    serverChildren.push(
      new StatusItem("模型", currentModel, "hubot")
    );

    // 当前 Agent
    const defaultAgent = (config as any)?.default_agent || "未设置";
    serverChildren.push(
      new StatusItem("Agent", defaultAgent, "person")
    );

    this.items.push(
      new StatusItem(
        "服务器",
        health.healthy ? `v${health.version} · 已连接` : "异常",
        health.healthy ? "server-process" : "server-environment",
        vscode.TreeItemCollapsibleState.Expanded,
        serverChildren,
        health.healthy ? "charts.green" : "charts.red"
      )
    );
  }

  /**
   * Provider 区域：所有配置的 provider 及其连接状态、活跃模型
   */
  private buildProviderSection(providers: ProvidersInfo | null, config: Record<string, any> | null): void {
    if (!providers) {
      this.items.push(
        new StatusItem("AI 提供商", "未知", "hubot")
      );
      return;
    }

    const connected = providers.connected || [];
    const enabledProviders: string[] = (config as any)?.enabled_providers || [];
    const disabledProviders: string[] = (config as any)?.disabled_providers || [];
    const defaultModels = providers.default || {};

    // 显示所有非禁用的 provider（或 enabled_providers 列表中的）
    const visibleProviders = (providers.all || []).filter((p) => {
      if (disabledProviders.includes(p.id)) return false;
      if (enabledProviders.length > 0 && !enabledProviders.includes(p.id)) return false;
      return true;
    });

    const connectedCount = visibleProviders.filter((p) => connected.includes(p.id)).length;

    const providerChildren = visibleProviders.map((p) => {
      const isConnected = connected.includes(p.id);
      const modelCount = Object.keys(p.models || {}).length;
      const defaultModel = defaultModels[p.id];
      const modelLabel = defaultModel || `${modelCount} 模型`;

      return new StatusItem(
        p.name || p.id,
        isConnected ? modelLabel : "未连接",
        isConnected ? "pass-filled" : "circle-slash",
        vscode.TreeItemCollapsibleState.None,
        undefined,
        isConnected ? "charts.green" : "charts.red"
      );
    });

    this.items.push(
      new StatusItem(
        "AI 提供商",
        `${connectedCount} 个已连接`,
        "hubot",
        providerChildren.length > 0
          ? vscode.TreeItemCollapsibleState.Collapsed
          : vscode.TreeItemCollapsibleState.None,
        providerChildren
      )
    );
  }

  /**
   * MCP 服务器区域：各 MCP server 名称、状态、工具数
   */
  private buildMCPSection(mcpStatus: MCPStatus | null): void {
    if (!mcpStatus) {
      this.items.push(
        new StatusItem("MCP 服务器", "未知", "extensions")
      );
      return;
    }

    const mcpNames = Object.keys(mcpStatus);
    const runningCount = mcpNames.filter(
      (name) => mcpStatus[name]?.status === "connected"
    ).length;

    const mcpChildren = mcpNames.map((name) => {
      const entry = mcpStatus[name];
      const status = entry?.status || "unknown";
      const toolCount = entry?.tools?.length ?? 0;

      let icon: string;
      let color: string | undefined;
      let statusLabel: string;

      switch (status) {
        case "connected":
          icon = "pass-filled";
          color = "charts.green";
          statusLabel = `运行中 · ${toolCount} 工具`;
          break;
        case "error":
          icon = "error";
          color = "charts.red";
          statusLabel = "错误";
          break;
        default:
          icon = "circle-slash";
          color = "charts.yellow";
          statusLabel = status;
          break;
      }

      return new StatusItem(name, statusLabel, icon, vscode.TreeItemCollapsibleState.None, undefined, color);
    });

    this.items.push(
      new StatusItem(
        "MCP 服务器",
        mcpNames.length > 0 ? `${runningCount} 个运行中` : "无",
        "extensions",
        mcpChildren.length > 0
          ? vscode.TreeItemCollapsibleState.Collapsed
          : vscode.TreeItemCollapsibleState.None,
        mcpChildren
      )
    );
  }

  /**
   * LSP 服务器区域：各 LSP server 名称和状态
   */
  private buildLSPSection(lspStatus: LSPStatus[] | null): void {
    if (!lspStatus) {
      this.items.push(
        new StatusItem("LSP 服务器", "未知", "symbol-method")
      );
      return;
    }

    const runningCount = lspStatus.filter((l) => l.status === "running").length;

    const lspChildren = lspStatus.map((l) => {
      const isRunning = l.status === "running";
      return new StatusItem(
        l.name,
        isRunning ? "运行中" : l.status,
        isRunning ? "pass-filled" : "circle-slash",
        vscode.TreeItemCollapsibleState.None,
        undefined,
        isRunning ? "charts.green" : "charts.red"
      );
    });

    this.items.push(
      new StatusItem(
        "LSP 服务器",
        lspStatus.length > 0 ? `${runningCount} 个运行中` : "无",
        "symbol-method",
        lspChildren.length > 0
          ? vscode.TreeItemCollapsibleState.Collapsed
          : vscode.TreeItemCollapsibleState.None,
        lspChildren
      )
    );
  }

  /**
   * Formatter 区域：格式化工具状态
   */
  private buildFormatterSection(formatterStatus: any[] | null): void {
    if (!formatterStatus || formatterStatus.length === 0) {
      this.items.push(
        new StatusItem("Formatter", "无", "symbol-color")
      );
      return;
    }

    const formatterChildren = formatterStatus.map((f) => {
      const name = f?.name || f?.id || "未知";
      const status = f?.status || "unknown";
      const isActive = status === "running" || status === "active" || status === "connected";
      return new StatusItem(
        name,
        isActive ? "活跃" : status,
        isActive ? "pass-filled" : "circle-slash",
        vscode.TreeItemCollapsibleState.None,
        undefined,
        isActive ? "charts.green" : undefined
      );
    });

    const activeCount = formatterChildren.filter(
      (c) => c.description === "活跃"
    ).length;

    this.items.push(
      new StatusItem(
        "Formatter",
        activeCount > 0 ? `${activeCount} 个活跃` : `${formatterStatus.length} 个`,
        "symbol-color",
        formatterChildren.length > 0
          ? vscode.TreeItemCollapsibleState.Collapsed
          : vscode.TreeItemCollapsibleState.None,
        formatterChildren
      )
    );
  }

  /**
   * 工具区域：已启用 / 禁用工具列表
   */
  private buildToolsSection(tools: string[] | null, config: Record<string, any> | null): void {
    if (!tools) {
      this.items.push(
        new StatusItem("工具", "未知", "tools")
      );
      return;
    }

    const disabledTools: string[] = (config as any)?.disabled_tools || [];
    const enabledCount = tools.filter((t) => !disabledTools.includes(t)).length;
    const disabledCount = disabledTools.length;

    const toolChildren: StatusItem[] = [];

    toolChildren.push(
      new StatusItem("已启用", `${enabledCount} 个`, "pass-filled", vscode.TreeItemCollapsibleState.None, undefined, "charts.green")
    );

    if (disabledCount > 0) {
      toolChildren.push(
        new StatusItem("已禁用", `${disabledCount} 个`, "circle-slash", vscode.TreeItemCollapsibleState.None, undefined, "charts.red")
      );
    }

    this.items.push(
      new StatusItem(
        "工具",
        `${enabledCount} 个启用`,
        "tools",
        vscode.TreeItemCollapsibleState.Collapsed,
        toolChildren
      )
    );
  }

  /**
   * 配置区域：关键配置值
   */
  private buildConfigSection(config: Record<string, any> | null, agents: Agent[] | null): void {
    if (!config) {
      this.items.push(
        new StatusItem("配置", "未知", "gear")
      );
      return;
    }

    const configChildren: StatusItem[] = [];

    // 默认 Agent
    const defaultAgent = (config as any)?.default_agent;
    if (defaultAgent) {
      const agentInfo = agents?.find((a) => a.id === defaultAgent);
      configChildren.push(
        new StatusItem("默认 Agent", agentInfo?.name || defaultAgent, "person")
      );
    }

    // 权限模式
    const permissionMode = (config as any)?.permission;
    if (permissionMode) {
      configChildren.push(
        new StatusItem("权限模式", permissionMode, "shield")
      );
    }

    // Compaction 模式
    const compaction = (config as any)?.compaction;
    if (compaction) {
      configChildren.push(
        new StatusItem("压缩模式", compaction, "fold")
      );
    }

    // 自动压缩
    const autoCompact = (config as any)?.auto_compact;
    if (autoCompact !== undefined) {
      configChildren.push(
        new StatusItem("自动压缩", autoCompact ? "开启" : "关闭", "history")
      );
    }

    // 工作目录
    const cwd = (config as any)?.cwd;
    if (cwd) {
      configChildren.push(
        new StatusItem("工作目录", cwd, "folder")
      );
    }

    // Provider 筛选（enabled / disabled）
    const enabledProviders: string[] = (config as any)?.enabled_providers || [];
    if (enabledProviders.length > 0) {
      configChildren.push(
        new StatusItem("启用 Providers", enabledProviders.join(", "), "check-all")
      );
    }

    const disabledProviders: string[] = (config as any)?.disabled_providers || [];
    if (disabledProviders.length > 0) {
      configChildren.push(
        new StatusItem("禁用 Providers", disabledProviders.join(", "), "circle-slash")
      );
    }

    this.items.push(
      new StatusItem(
        "配置",
        `${configChildren.length} 项`,
        "gear",
        configChildren.length > 0
          ? vscode.TreeItemCollapsibleState.Collapsed
          : vscode.TreeItemCollapsibleState.None,
        configChildren
      )
    );
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
    this.stopAutoRefresh();
    this._onDidChangeTreeData.dispose();
  }
}
