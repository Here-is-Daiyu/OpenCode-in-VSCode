/**
 * Settings panel — main React application component.
 *
 * Renders a single-page settings UI that communicates with the extension host
 * via postMessage to read/write VSCode settings and OpenCode server config.
 */

import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { useSettingsStore, type SettingsTab } from '../../stores/settingsStore';
import { getVsCodeApi } from '../../utils/vscodeApi';
import {
  SettingsTabs,
  SETTINGS_TABS,
  getSettingsSectionId,
} from '../../components/settings/SettingsTabs';
import { ConnectionTab } from './tabs/ConnectionTab';
import { ChatTab } from './tabs/ChatTab';
import { ModelsTab } from './tabs/ModelsTab';
import { IntegrationsTab } from './tabs/IntegrationsTab';
import { PermissionsTab } from './tabs/PermissionsTab';
import type { ExtensionToSettingsMessage, SettingsToExtensionMessage } from '../../types/messages';
import type { MCPServerConfig, OpenCodeConfig } from '../../types/opencode';
import { getConfiguredAgent, getConfiguredModel } from '../../utils/opencodeConfig';
import '../../styles/settings.css';

function postMessage(message: SettingsToExtensionMessage): void {
  getVsCodeApi().postMessage(message);
}

const SETTINGS_TAB_IDS = new Set<SettingsTab>(SETTINGS_TABS.map((tab) => tab.id));

function getObservedTab(target: Element): SettingsTab | null {
  const tab = target.getAttribute('data-settings-tab');
  if (!tab || !SETTINGS_TAB_IDS.has(tab as SettingsTab)) {
    return null;
  }

  return tab as SettingsTab;
}

export function SettingsApp() {
  const store = useSettingsStore();
  const initialised = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const programmaticScrollRef = useRef(false);
  const pendingScrollTabRef = useRef<SettingsTab | null>(null);
  const scrollResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const visibleHeadersRef = useRef(new Map<SettingsTab, IntersectionObserverEntry>());
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
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = setTimeout(() => {
      postMessage({
        type: 'settings:update',
        data: { section: 'opencode', key, value },
      });
    }, 500);
  }, []);

  /** Update OpenCode server config (debounced 500ms). */
  const updateOpenCodeConfig = useCallback((partial: Partial<OpenCodeConfig>) => {
    useSettingsStore.getState().setOpenCodeConfig(partial);

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = setTimeout(() => {
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

  const clearProgrammaticScroll = useCallback(() => {
    programmaticScrollRef.current = false;
    pendingScrollTabRef.current = null;

    if (scrollResetTimerRef.current) {
      clearTimeout(scrollResetTimerRef.current);
      scrollResetTimerRef.current = null;
    }
  }, []);

  useEffect(() => () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    if (scrollResetTimerRef.current) {
      clearTimeout(scrollResetTimerRef.current);
    }
  }, []);

  // ------------------------------------------------------------------
  //  Anchor navigation
  // ------------------------------------------------------------------
  const handleTabChange = useCallback((tab: SettingsTab) => {
    useSettingsStore.getState().setActiveTab(tab);

    if (!document.getElementById(getSettingsSectionId(tab))) {
      clearProgrammaticScroll();
      return;
    }

    programmaticScrollRef.current = true;
    pendingScrollTabRef.current = tab;

    if (scrollResetTimerRef.current) {
      clearTimeout(scrollResetTimerRef.current);
    }

    scrollResetTimerRef.current = setTimeout(() => {
      clearProgrammaticScroll();
    }, 1200);
  }, [clearProgrammaticScroll]);

  useEffect(() => {
    if (!store.loaded) {
      clearProgrammaticScroll();
      visibleHeadersRef.current.clear();
      return;
    }

    const container = scrollContainerRef.current;
    if (!container) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const tab = getObservedTab(entry.target);
          if (!tab) continue;

          if (entry.isIntersecting) {
            visibleHeadersRef.current.set(tab, entry);
          } else {
            visibleHeadersRef.current.delete(tab);
          }
        }

        const visibleEntries = Array.from(visibleHeadersRef.current.values())
          .filter((entry) => entry.intersectionRatio >= 0.6)
          .sort((left, right) => left.boundingClientRect.top - right.boundingClientRect.top);

        for (const entry of visibleEntries) {
          const tab = getObservedTab(entry.target);
          if (!tab) continue;

          const pendingTab = pendingScrollTabRef.current;

          if (programmaticScrollRef.current && pendingTab && tab !== pendingTab) {
            continue;
          }

          useSettingsStore.getState().setActiveTab(tab);

          if (pendingTab === tab) {
            clearProgrammaticScroll();
          }

          break;
        }
      },
      {
        root: container,
        rootMargin: '0px 0px -80% 0px',
        threshold: [0, 0.6, 1],
      }
    );

    const sectionHeaders = container.querySelectorAll<HTMLElement>('.settings-section__header');
    sectionHeaders.forEach((sectionHeader) => observer.observe(sectionHeader));

    return () => {
      visibleHeadersRef.current.clear();
      observer.disconnect();
    };
  }, [clearProgrammaticScroll, store.loaded]);

  // ------------------------------------------------------------------
  //  Render section content
  // ------------------------------------------------------------------
  const renderTab = (tab: SettingsTab) => {
    switch (tab) {
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

          <div className="settings-content" ref={scrollContainerRef}>
            <div className="settings-panel">
              {store.loaded ? (
                SETTINGS_TABS.map((tab) => {
                  const sectionId = getSettingsSectionId(tab.id);

                  return (
                    <section
                      key={tab.id}
                      id={sectionId}
                      className="settings-section"
                      aria-labelledby={`${sectionId}-title`}
                    >
                      <div className="settings-section__header" data-settings-tab={tab.id}>
                        <h2 id={`${sectionId}-title`} className="settings-section__title">
                          {tab.label}
                        </h2>
                        <p className="settings-section__description">{tab.description}</p>
                      </div>

                      {renderTab(tab.id)}
                    </section>
                  );
                })
              ) : (
                <div className="empty-state">
                  <div className="empty-state__icon">
                    <span className="codicon codicon-loading codicon-modifier-spin" />
                  </div>
                  <div className="empty-state__text">Loading settings…</div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
