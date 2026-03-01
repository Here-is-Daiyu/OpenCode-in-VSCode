import * as vscode from 'vscode';
import type {
  Provider,
  MCPStatus,
  LSPStatus,
  OpenCodeConfig,
} from '../types/opencode';
import type { EventBus } from '../services/eventBus';
import type { OpenCodeClient, ProvidersResponse } from '../services/openCodeClient';

// ---------------------------------------------------------------------------
//  Section identifiers
// ---------------------------------------------------------------------------

/** Discriminated key for each root section in the status tree. */
type SectionKey = 'server' | 'model' | 'providers' | 'mcp' | 'lsp';

// ---------------------------------------------------------------------------
//  Tree item
// ---------------------------------------------------------------------------

export class StatusTreeItem extends vscode.TreeItem {
  constructor(
    label: string,
    options: {
      description?: string;
      collapsibleState?: vscode.TreeItemCollapsibleState;
      icon?: vscode.ThemeIcon;
      tooltip?: string | vscode.MarkdownString;
      contextValue?: string;
      /** Opaque key used to match children to their parent section. */
      sectionKey?: SectionKey;
    } = {},
  ) {
    super(
      label,
      options.collapsibleState ?? vscode.TreeItemCollapsibleState.None,
    );
    this.description = options.description;
    this.iconPath = options.icon;
    this.tooltip = options.tooltip;
    this.contextValue = options.contextValue;

    // Store section key for child resolution
    if (options.sectionKey) {
      (this as Record<string, unknown>)['_sectionKey'] = options.sectionKey;
    }
  }

  get sectionKey(): SectionKey | undefined {
    return (this as Record<string, unknown>)['_sectionKey'] as SectionKey | undefined;
  }
}

// ---------------------------------------------------------------------------
//  Provider
// ---------------------------------------------------------------------------

/**
 * Hierarchical status TreeView showing server connection state, model info,
 * provider connections, MCP servers and LSP servers.
 *
 * Auto-refreshes on EventBus events and on a configurable timer.
 */
export class StatusTreeProvider
  implements vscode.TreeDataProvider<StatusTreeItem>, vscode.Disposable
{
  private _onDidChangeTreeData = new vscode.EventEmitter<StatusTreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private client?: OpenCodeClient;
  private serverInfo: { connected: boolean; version?: string; url?: string } = {
    connected: false,
  };
  private config?: OpenCodeConfig;
  private providersData?: ProvidersResponse;
  private mcpStatus?: Record<string, MCPStatus>;
  private lspStatus?: LSPStatus[];
  private refreshInterval?: ReturnType<typeof setInterval>;

  /** EventBus unsubscribe callbacks */
  private unsubscribers: Array<() => void> = [];

  constructor(private eventBus: EventBus) {
    this.unsubscribers.push(
      eventBus.on('server:connected', (payload) => {
        this.serverInfo = { connected: true, version: payload.version, url: this.serverInfo.url };
        void this.refresh();
      }),
      eventBus.on('server:disconnected', () => {
        this.serverInfo = { ...this.serverInfo, connected: false };
        this._onDidChangeTreeData.fire(undefined);
      }),
      eventBus.on('server:error', () => {
        this.serverInfo = { ...this.serverInfo, connected: false };
        this._onDidChangeTreeData.fire(undefined);
      }),
      eventBus.on('config:updated', (cfg) => {
        this.config = cfg;
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

  setServerInfo(info: { connected: boolean; version?: string; url?: string }): void {
    this.serverInfo = info;
    this._onDidChangeTreeData.fire(undefined);
  }

  /**
   * Start periodic auto-refresh. Default interval: 30 000 ms.
   */
  startAutoRefresh(intervalMs = 30_000): void {
    this.stopAutoRefresh();
    this.refreshInterval = setInterval(() => void this.refresh(), intervalMs);
  }

  stopAutoRefresh(): void {
    if (this.refreshInterval !== undefined) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = undefined;
    }
  }

  /**
   * Fetch fresh data from the server and refresh the tree.
   */
  async refresh(): Promise<void> {
    if (this.client && this.serverInfo.connected) {
      try {
        const [config, providers, mcp, lsp] = await Promise.allSettled([
          this.client.getConfig(),
          this.client.getProviders(),
          this.client.getMCPStatus(),
          this.client.getLSPStatus(),
        ]);

        if (config.status === 'fulfilled') { this.config = config.value; }
        if (providers.status === 'fulfilled') { this.providersData = providers.value; }
        if (mcp.status === 'fulfilled') { this.mcpStatus = mcp.value; }
        if (lsp.status === 'fulfilled') { this.lspStatus = lsp.value; }
      } catch {
        // Swallow — keep stale data
      }
    }
    this._onDidChangeTreeData.fire(undefined);
  }

  // -------------------------------------------------------------------------
  //  TreeDataProvider
  // -------------------------------------------------------------------------

  getTreeItem(element: StatusTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: StatusTreeItem): Promise<StatusTreeItem[]> {
    if (!element) {
      return this.getRootSections();
    }

    switch (element.sectionKey) {
      case 'server':
        return this.getServerChildren();
      case 'model':
        return this.getModelChildren();
      case 'providers':
        return this.getProviderChildren();
      case 'mcp':
        return this.getMCPChildren();
      case 'lsp':
        return this.getLSPChildren();
      default:
        return [];
    }
  }

  // -------------------------------------------------------------------------
  //  Dispose
  // -------------------------------------------------------------------------

  dispose(): void {
    this.stopAutoRefresh();
    for (const unsub of this.unsubscribers) {
      unsub();
    }
    this.unsubscribers = [];
    this._onDidChangeTreeData.dispose();
  }

  // -------------------------------------------------------------------------
  //  Section builders
  // -------------------------------------------------------------------------

  private getRootSections(): StatusTreeItem[] {
    const items: StatusTreeItem[] = [];

    // 1. Server
    const serverDesc = this.serverInfo.connected ? 'Connected' : 'Disconnected';
    items.push(
      new StatusTreeItem('Server', {
        description: serverDesc,
        collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
        icon: new vscode.ThemeIcon(
          this.serverInfo.connected ? 'vm-running' : 'vm-outline',
          this.serverInfo.connected
            ? new vscode.ThemeColor('testing.iconPassed')
            : new vscode.ThemeColor('testing.iconFailed'),
        ),
        sectionKey: 'server',
      }),
    );

    // 2. Model
    items.push(
      new StatusTreeItem('Model', {
        description: this.config?.model ?? 'default',
        collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
        icon: new vscode.ThemeIcon('symbol-enum'),
        sectionKey: 'model',
      }),
    );

    // 3. Providers
    const connectedCount = this.providersData?.connected?.length ?? 0;
    const totalCount = this.providersData?.providers?.length ?? 0;
    items.push(
      new StatusTreeItem('Providers', {
        description: `${connectedCount}/${totalCount} connected`,
        collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
        icon: new vscode.ThemeIcon('cloud'),
        sectionKey: 'providers',
      }),
    );

    // 4. MCP Servers
    const mcpEntries = this.mcpStatus ? Object.values(this.mcpStatus) : [];
    const mcpConnected = mcpEntries.filter(m => m.status === 'connected').length;
    items.push(
      new StatusTreeItem('MCP Servers', {
        description: mcpEntries.length > 0 ? `${mcpConnected}/${mcpEntries.length} connected` : 'none',
        collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
        icon: new vscode.ThemeIcon('server'),
        sectionKey: 'mcp',
      }),
    );

    // 5. LSP Servers
    const lspCount = this.lspStatus?.length ?? 0;
    items.push(
      new StatusTreeItem('LSP Servers', {
        description: lspCount > 0 ? `${lspCount} server${lspCount === 1 ? '' : 's'}` : 'none',
        collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
        icon: new vscode.ThemeIcon('symbol-class'),
        sectionKey: 'lsp',
      }),
    );

    return items;
  }

  // -- Server children -------------------------------------------------------

  private getServerChildren(): StatusTreeItem[] {
    const items: StatusTreeItem[] = [];

    // Version
    items.push(
      new StatusTreeItem('Version', {
        description: this.serverInfo.version ?? 'unknown',
        icon: new vscode.ThemeIcon('tag'),
      }),
    );

    // Status
    items.push(
      new StatusTreeItem('Status', {
        description: this.serverInfo.connected ? 'Connected' : 'Disconnected',
        icon: new vscode.ThemeIcon(
          this.serverInfo.connected ? 'check' : 'x',
          this.serverInfo.connected
            ? new vscode.ThemeColor('testing.iconPassed')
            : new vscode.ThemeColor('testing.iconFailed'),
        ),
      }),
    );

    // URL
    const url = this.serverInfo.url ?? this.client?.getBaseUrl();
    if (url) {
      items.push(
        new StatusTreeItem('URL', {
          description: url,
          icon: new vscode.ThemeIcon('link'),
          tooltip: url,
        }),
      );
    }

    return items;
  }

  // -- Model children --------------------------------------------------------

  private getModelChildren(): StatusTreeItem[] {
    const items: StatusTreeItem[] = [];

    items.push(
      new StatusTreeItem('Current', {
        description: this.config?.model ?? 'default',
        icon: new vscode.ThemeIcon('symbol-enum'),
      }),
    );

    items.push(
      new StatusTreeItem('Agent', {
        description: this.config?.agent ?? 'default',
        icon: new vscode.ThemeIcon('robot'),
      }),
    );

    return items;
  }

  // -- Provider children -----------------------------------------------------

  private getProviderChildren(): StatusTreeItem[] {
    if (!this.providersData) {
      return [
        new StatusTreeItem('No provider data', {
          icon: new vscode.ThemeIcon('info'),
        }),
      ];
    }

    const connectedSet = new Set(this.providersData.connected ?? []);

    return this.providersData.providers.map((provider) => {
      const connected = connectedSet.has(provider.id);
      const models = Object.values(provider.models ?? {});
      const modelCount = models.length;
      return new StatusTreeItem(provider.name || provider.id, {
        description: connected
          ? `Connected · ${modelCount} model${modelCount === 1 ? '' : 's'}`
          : 'Disconnected',
        icon: new vscode.ThemeIcon(
          'cloud',
          connected
            ? new vscode.ThemeColor('testing.iconPassed')
            : new vscode.ThemeColor('testing.iconFailed'),
        ),
        tooltip: buildProviderTooltip(provider, connected),
        contextValue: 'provider',
      });
    });
  }

  // -- MCP children ----------------------------------------------------------

  private getMCPChildren(): StatusTreeItem[] {
    if (!this.mcpStatus || Object.keys(this.mcpStatus).length === 0) {
      return [
        new StatusTreeItem('No MCP servers configured', {
          icon: new vscode.ThemeIcon('info'),
        }),
      ];
    }

    return Object.entries(this.mcpStatus).map(([name, status]) => {
      const desc = buildMCPDescription(status);
      return new StatusTreeItem(name, {
        description: desc,
        icon: new vscode.ThemeIcon(
          'server',
          mcpStatusColor(status.status),
        ),
        tooltip: buildMCPTooltip(name, status),
        contextValue: 'mcpServer',
      });
    });
  }

  // -- LSP children ----------------------------------------------------------

  private getLSPChildren(): StatusTreeItem[] {
    if (!this.lspStatus || this.lspStatus.length === 0) {
      return [
        new StatusTreeItem('No LSP servers running', {
          icon: new vscode.ThemeIcon('info'),
        }),
      ];
    }

    return this.lspStatus.map((lsp) => {
      const langs = lsp.languages?.join(', ') ?? '';
      return new StatusTreeItem(lsp.name, {
        description: langs || lsp.status,
        icon: new vscode.ThemeIcon(
          'symbol-class',
          lsp.status === 'running'
            ? new vscode.ThemeColor('testing.iconPassed')
            : lsp.status === 'error'
              ? new vscode.ThemeColor('testing.iconFailed')
              : undefined,
        ),
        tooltip: `${lsp.name}\nStatus: ${lsp.status}${langs ? `\nLanguages: ${langs}` : ''}`,
        contextValue: 'lspServer',
      });
    });
  }
}

// ---------------------------------------------------------------------------
//  Helper functions
// ---------------------------------------------------------------------------

function buildProviderTooltip(provider: Provider, connected: boolean): vscode.MarkdownString {
  const md = new vscode.MarkdownString('', true);
  md.isTrusted = true;
  md.appendMarkdown(`### ${provider.name || provider.id}\n\n`);
  md.appendMarkdown(`**Status:** ${connected ? '$(check) Connected' : '$(x) Disconnected'}\n\n`);
  if (provider.models && Object.keys(provider.models).length > 0) {
    const models = Object.values(provider.models);
    md.appendMarkdown(`**Models (${models.length}):**\n\n`);
    for (const model of models) {
      const tags: string[] = [];
      if (model.capabilities?.reasoning) { tags.push('reasoning'); }
      if (model.capabilities?.attachment) { tags.push('attachments'); }
      const suffix = tags.length > 0 ? ` _(${tags.join(', ')})_` : '';
      md.appendMarkdown(`- \`${model.id}\`${suffix}\n`);
    }
  }
  return md;
}

function buildMCPDescription(status: MCPStatus): string {
  const parts: string[] = [status.status];
  if (status.status === 'connected' && status.tools !== undefined) {
    parts.push(`${status.tools} tool${status.tools === 1 ? '' : 's'}`);
  }
  if (status.error) {
    parts.push(status.error);
  }
  return parts.join(' · ');
}

function buildMCPTooltip(name: string, status: MCPStatus): vscode.MarkdownString {
  const md = new vscode.MarkdownString('', true);
  md.isTrusted = true;
  md.appendMarkdown(`### MCP: ${name}\n\n`);
  md.appendMarkdown(`**Status:** ${status.status}\n\n`);
  if (status.tools !== undefined) {
    md.appendMarkdown(`**Tools:** ${status.tools}\n\n`);
  }
  if (status.error) {
    md.appendMarkdown(`**Error:** ${status.error}\n\n`);
  }
  return md;
}

function mcpStatusColor(
  status: MCPStatus['status'],
): vscode.ThemeColor | undefined {
  switch (status) {
    case 'connected':
      return new vscode.ThemeColor('testing.iconPassed');
    case 'connecting':
      return new vscode.ThemeColor('charts.yellow');
    case 'error':
      return new vscode.ThemeColor('testing.iconFailed');
    default:
      return undefined;
  }
}
