/**
 * Settings panel — main React application component.
 *
 * Renders a tabbed settings UI that communicates with the extension host
 * via postMessage to read/write VSCode settings and OpenCode server config.
 */

import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { useSettingsStore, type SettingsTab } from '../../stores/settingsStore';
import { getVsCodeApi } from '../../utils/vscodeApi';
import { SettingsTabs, getSettingsTabDef } from '../../components/settings/SettingsTabs';
import { ConnectionTab } from './tabs/ConnectionTab';
import { ChatTab } from './tabs/ChatTab';
import { ModelsTab } from './tabs/ModelsTab';
import { IntegrationsTab } from './tabs/IntegrationsTab';
import { PermissionsTab } from './tabs/PermissionsTab';
import type { ExtensionToSettingsMessage, SettingsToExtensionMessage } from '../../types/messages';
import type { MCPServerConfig, OpenCodeConfig } from '../../types/opencode';
import { getConfiguredAgent, getConfiguredModel } from '../../utils/opencodeConfig';
import '../../styles/settings.css';

// Debounce timer for auto-save
let saveTimer: ReturnType<typeof setTimeout> | undefined;

function postMessage(message: SettingsToExtensionMessage): void {
  getVsCodeApi().postMessage(message);
}

export function SettingsApp() {
  const store = useSettingsStore();
  const initialised = useRef(false);
  const activeTab = getSettingsTabDef(store.activeTab);
  const settingsSummary = useMemo(() => {
    const providerCount = store.providers.length;
    const mcpCount = Object.keys(store.mcpStatus).length;

    return [
      {
        label: 'Model',
        value: getConfiguredModel(store.opencodeConfig) ?? 'Auto',
      },
      {
        label: 'Agent',
        value: getConfiguredAgent(store.opencodeConfig) ?? 'Default',
      },
      {
        label: 'Providers',
        value: providerCount > 0
          ? `${store.connectedProviders.length}/${providerCount} connected`
          : store.loaded
            ? 'None detected'
            : 'Loading…',
      },
      {
        label: 'MCP',
        value: mcpCount > 0
          ? `${mcpCount} configured`
          : store.loaded
            ? 'None configured'
            : 'Loading…',
      },
    ];
  }, [store.connectedProviders.length, store.loaded, store.mcpStatus, store.opencodeConfig, store.providers.length]);

  // ------------------------------------------------------------------
  //  Listen for messages from extension host
  // ------------------------------------------------------------------
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data as ExtensionToSettingsMessage;
      if (!msg || typeof msg !== 'object' || !('type' in msg)) return;

      const settingsStore = useSettingsStore.getState();

      switch (msg.type) {
        case 'settings:loaded':
          settingsStore.loadAll(msg.data);
          break;
        case 'settings:updated':
          settingsStore.setVSCodeSetting(msg.data.key, msg.data.value);
          settingsStore.flashSaved();
          break;
        case 'providers:loaded':
          settingsStore.setProviders(msg.data.providers, msg.data.connected);
          break;
        case 'mcp:status':
          settingsStore.setMCPStatus(msg.data);
          break;
        case 'theme:changed': {
          // Suppress CSS transitions during theme switch to prevent flash
          document.documentElement.classList.add('theme-transitioning');
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              document.documentElement.classList.remove('theme-transitioning');
            });
          });
          break;
        }
        case 'error':
          settingsStore.setError(msg.data.message);
          break;
      }
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  // ------------------------------------------------------------------
  //  Notify extension host that we're ready
  // ------------------------------------------------------------------
  useEffect(() => {
    if (!initialised.current) {
      initialised.current = true;
      postMessage({ type: 'ready' });
    }
  }, []);

  // ------------------------------------------------------------------
  //  Auto-save helpers (debounced)
  // ------------------------------------------------------------------

  /** Update a VSCode setting (debounced 500ms). */
  const updateVSCodeSetting = useCallback((key: string, value: unknown) => {
    // Update local state immediately
    useSettingsStore.getState().setVSCodeSetting(key, value);

    // Debounced save to extension
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      postMessage({
        type: 'settings:update',
        data: { section: 'opencode', key, value },
      });
    }, 500);
  }, []);

  /** Update OpenCode server config (debounced 500ms). */
  const updateOpenCodeConfig = useCallback((partial: Partial<OpenCodeConfig>) => {
    useSettingsStore.getState().setOpenCodeConfig(partial);

    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      postMessage({
        type: 'settings:opencode:update',
        data: partial,
      });
    }, 500);
  }, []);

  /** Add MCP server (immediate). */
  const addMCPServer = useCallback((name: string, config: MCPServerConfig) => {
    postMessage({ type: 'settings:mcp:add', data: { name, config } });
  }, []);

  /** Remove MCP server (immediate). */
  const removeMCPServer = useCallback((name: string) => {
    postMessage({ type: 'settings:mcp:remove', data: { name } });
  }, []);

  /** Toggle MCP server (immediate). */
  const toggleMCPServer = useCallback((name: string, enabled: boolean) => {
    postMessage({ type: 'settings:mcp:toggle', data: { name, enabled } });
  }, []);

  const openKeyboardShortcuts = useCallback(() => {
    postMessage({ type: 'settings:openKeyboardShortcuts' });
  }, []);

  // ------------------------------------------------------------------
  //  Tab change
  // ------------------------------------------------------------------
  const handleTabChange = useCallback((tab: SettingsTab) => {
    useSettingsStore.getState().setActiveTab(tab);
  }, []);

  // ------------------------------------------------------------------
  //  Render active tab content
  // ------------------------------------------------------------------
  const renderTab = () => {
    switch (store.activeTab) {
      case 'connection':
        return (
          <ConnectionTab
            settings={store.vscodeSettings}
            onUpdate={updateVSCodeSetting}
          />
        );
      case 'chat':
        return (
          <ChatTab
            settings={store.vscodeSettings}
            onUpdate={updateVSCodeSetting}
            onOpenKeyboardShortcuts={openKeyboardShortcuts}
          />
        );
      case 'models':
        return (
          <ModelsTab
            config={store.opencodeConfig}
            providers={store.providers}
            connectedProviders={store.connectedProviders}
            onUpdateConfig={updateOpenCodeConfig}
          />
        );
      case 'integrations':
        return (
          <IntegrationsTab
            config={store.opencodeConfig}
            providers={store.providers}
            connectedProviders={store.connectedProviders}
            mcpStatus={store.mcpStatus}
            onUpdateConfig={updateOpenCodeConfig}
            onMCPAdd={addMCPServer}
            onMCPRemove={removeMCPServer}
            onMCPToggle={toggleMCPServer}
          />
        );
      case 'permissions':
        return (
          <PermissionsTab
            config={store.opencodeConfig}
            settings={store.vscodeSettings}
            onUpdateConfig={updateOpenCodeConfig}
            onUpdateSetting={updateVSCodeSetting}
          />
        );
      default:
        return null;
    }
  };

  // ------------------------------------------------------------------
  //  Render
  // ------------------------------------------------------------------
  return (
    <div className="settings-app">
      <div className="settings-shell">
        <header className="settings-header">
          <div className="settings-header__main">
            <div className="settings-header__title-row">
              <div className="settings-header__heading">
                <h1 className="settings-header__title">Settings</h1>
                <p className="settings-header__description">
                  Edit VS Code preferences and OpenCode server configuration from one
                  place.
                </p>
                <div className="settings-header__summary">
                  {settingsSummary.map((item) => (
                    <div key={item.label} className="settings-header__summary-item">
                      <span className="settings-header__summary-label">{item.label}</span>
                      <span className="settings-header__summary-value" title={item.value}>
                        {item.value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="settings-header__meta">
                <button
                  type="button"
                  className="settings-header-button"
                  onClick={() => postMessage({ type: 'settings:openConfigFile' })}
                  title="Open the highest-priority local OpenCode config source"
                >
                  Open local config
                </button>
                {store.saveIndicator && (
                  <span className="settings-header__indicator settings-header__indicator--saved">
                    Saved
                  </span>
                )}
                {store.isDirty && !store.saveIndicator && (
                  <span className="settings-header__indicator settings-header__indicator--dirty">
                    Unsaved
                  </span>
                )}
                {!store.isDirty && !store.saveIndicator && store.loaded && (
                  <span className="settings-header__indicator settings-header__indicator--idle">
                    Auto-save on
                  </span>
                )}
              </div>
            </div>
          </div>
        </header>

        {store.error && (
          <div className="settings-error">
            <span>{store.error}</span>
            <button
              type="button"
              className="settings-error__dismiss"
              onClick={() => store.setError(null)}
            >
              ×
            </button>
          </div>
        )}

        <div className="settings-layout">
          <aside className="settings-sidebar">
            <SettingsTabs activeTab={store.activeTab} onTabChange={handleTabChange} />
          </aside>

          <div className="settings-content">
            <section className="settings-panel">
              <div className="settings-panel__header">
                <div>
                  <h2 className="settings-panel__title">{activeTab.label}</h2>
                  <p className="settings-panel__description">{activeTab.description}</p>
                </div>
              </div>

              {store.loaded ? (
                renderTab()
              ) : (
                <div className="empty-state">
                  <div className="empty-state__icon">
                    <span className="codicon codicon-loading codicon-modifier-spin" />
                  </div>
                  <div className="empty-state__text">Loading settings…</div>
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
