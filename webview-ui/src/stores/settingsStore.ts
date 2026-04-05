/**
 * Zustand store for the Settings panel.
 *
 * Manages VSCode extension settings, OpenCode server configuration,
 * provider info, MCP status, and UI state (active tab, save indicator).
 */

import { create } from 'zustand';
import type {
  OpenCodeConfig,
  Provider,
  MCPStatus,
} from '../types/opencode';

// ---------------------------------------------------------------------------
//  Tab type
// ---------------------------------------------------------------------------

export type SettingsTab =
  | 'connection'
  | 'chat'
  | 'models'
  | 'integrations'
  | 'permissions';

// ---------------------------------------------------------------------------
//  Store interface
// ---------------------------------------------------------------------------

export interface SettingsState {
  /** VSCode extension settings (flat key-value map). */
  vscodeSettings: Record<string, unknown>;

  /** OpenCode server configuration. */
  opencodeConfig: OpenCodeConfig;

  /** Available providers & their models. */
  providers: Provider[];

  /** IDs of providers that are currently connected (have valid API keys). */
  connectedProviders: string[];

  /** MCP server status map: serverName -> MCPStatus */
  mcpStatus: Record<string, MCPStatus>;

  /** Currently active settings tab. */
  activeTab: SettingsTab;

  /** Whether there are unsaved changes. */
  isDirty: boolean;

  /** Transient "Saved" indicator. */
  saveIndicator: boolean;

  /** Error message to display (if any). */
  error: string | null;

  /** Whether the initial data has been loaded. */
  loaded: boolean;

  // ---- Actions ----

  /** Bulk-load all settings from the extension host. */
  loadAll(data: { vscode: Record<string, unknown>; opencode: OpenCodeConfig }): void;

  /** Update a single VSCode extension setting locally. */
  setVSCodeSetting(key: string, value: unknown): void;

  /** Merge partial OpenCode config locally. */
  setOpenCodeConfig(config: Partial<OpenCodeConfig>): void;

  /** Set provider / connected-provider data. */
  setProviders(providers: Provider[], connected: string[]): void;

  /** Set MCP status map. */
  setMCPStatus(status: Record<string, MCPStatus>): void;

  /** Switch the active tab. */
  setActiveTab(tab: SettingsTab): void;

  /** Mark as dirty or clean. */
  setDirty(dirty: boolean): void;

  /** Flash the "Saved" indicator briefly. */
  flashSaved(): void;

  /** Set an error message. */
  setError(error: string | null): void;
}

// ---------------------------------------------------------------------------
//  Default VSCode settings (matches package.json defaults)
// ---------------------------------------------------------------------------

const DEFAULT_VSCODE_SETTINGS: Record<string, unknown> = {
  'server.mode': 'local',
  'server.externalUrl': '',
  'server.hostname': '127.0.0.1',
  'server.port': 0,
  'server.autoStart': true,
  'server.executablePath': 'opencode',
  'chat.fontSize': 14,
  'chat.showTimestamps': true,
  'chat.wordWrap': true,
  'chat.maxImageSize': 10,
  'chat.showToolCalls': 'collapsed',
  'editor.showInlineDiffs': true,
  'editor.codeLensEnabled': false,
};

// ---------------------------------------------------------------------------
//  Store
// ---------------------------------------------------------------------------

export const useSettingsStore = create<SettingsState>((set) => ({
  vscodeSettings: { ...DEFAULT_VSCODE_SETTINGS },
  opencodeConfig: {},
  providers: [],
  connectedProviders: [],
  mcpStatus: {},
  activeTab: 'connection',
  isDirty: false,
  saveIndicator: false,
  error: null,
  loaded: false,

  loadAll: (data) =>
    set({
      vscodeSettings: { ...DEFAULT_VSCODE_SETTINGS, ...data.vscode },
      opencodeConfig: data.opencode,
      loaded: true,
      isDirty: false,
    }),

  setVSCodeSetting: (key, value) =>
    set((state) => ({
      vscodeSettings: { ...state.vscodeSettings, [key]: value },
      isDirty: true,
    })),

  setOpenCodeConfig: (config) =>
    set((state) => ({
      opencodeConfig: { ...state.opencodeConfig, ...config },
      isDirty: true,
    })),

  setProviders: (providers, connected) =>
    set({ providers, connectedProviders: connected }),

  setMCPStatus: (status) =>
    set({ mcpStatus: status }),

  setActiveTab: (tab) =>
    set({ activeTab: tab }),

  setDirty: (dirty) =>
    set({ isDirty: dirty }),

  flashSaved: () => {
    set({ saveIndicator: true, isDirty: false });
    setTimeout(() => set({ saveIndicator: false }), 2000);
  },

  setError: (error) =>
    set({ error }),
}));
