/**
 * Models settings tab — model selection, agent mode, and provider availability.
 *
 * Combines the old ModelTab (current model summary, model selection grid,
 * agent selection) with the old ProvidersTab's "Provider Availability"
 * section into a unified models management tab.
 */

import React, { useCallback, useMemo } from 'react';
import type { OpenCodeConfig, Provider } from '../../../types/opencode';
import { SettingGroup } from '../../../components/settings/SettingGroup';
import { Dropdown } from '../../../components/settings/Dropdown';
import { Toggle } from '../../../components/settings/Toggle';
import { useAgentStore } from '../../../stores/agentStore';
import { getConfiguredAgent, getConfiguredModel } from '../../../utils/opencodeConfig';

interface ModelsTabProps {
  config: OpenCodeConfig;
  providers: Provider[];
  connectedProviders: string[];
  onUpdateConfig: (partial: Record<string, unknown>) => void;
}

/** Format a context/output limit into a human-readable string (e.g. 128000 -> "128K"). */
function formatLimit(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1)}K`;
  return String(n);
}

export function ModelsTab({
  config,
  providers,
  connectedProviders,
  onUpdateConfig,
}: ModelsTabProps) {
  // Current model is stored as "providerId/modelId"
  const currentModel = getConfiguredModel(config) ?? '';
  const usingAutoModel = !currentModel;

  // Parse the current model reference
  const [currentProviderID, currentModelID] = useMemo(() => {
    const parts = currentModel.split('/');
    if (parts.length >= 2) return [parts[0], parts.slice(1).join('/')];
    return ['', ''];
  }, [currentModel]);

  // Find the current model object for displaying details
  const currentModelObj = useMemo(() => {
    for (const provider of providers) {
      if (provider.id === currentProviderID) {
        return Object.values(provider.models).find((m) => m.id === currentModelID);
      }
    }
    return undefined;
  }, [providers, currentProviderID, currentModelID]);

  // Select a model
  const handleModelSelect = useCallback(
    (providerID: string, modelID: string) => {
      onUpdateConfig({ model: `${providerID}/${modelID}` });
    },
    [onUpdateConfig],
  );

  const clearModelSelection = useCallback(() => {
    onUpdateConfig({ model: null });
  }, [onUpdateConfig]);

  const agents = useAgentStore((s) => s.agents);
  const currentAgent = getConfiguredAgent(config) ?? '';
  const handleAgentChange = useCallback(
    (value: string) => {
      onUpdateConfig({ default_agent: value || null });
    },
    [onUpdateConfig],
  );

  const hasCurrentModelBadges = Boolean(
    currentModelObj?.capabilities?.reasoning || currentModelObj?.capabilities?.attachment,
  );

  // Disabled-providers toggle
  const disabledProviders = useMemo(
    () => config.disabled_providers ?? [],
    [config.disabled_providers],
  );

  const handleToggleProvider = useCallback(
    (providerId: string, enabled: boolean) => {
      let updated: string[];
      if (enabled) {
        updated = disabledProviders.filter((id) => id !== providerId);
      } else {
        updated = [...disabledProviders, providerId];
      }
      onUpdateConfig({ disabled_providers: updated });
    },
    [disabledProviders, onUpdateConfig],
  );

  // Sort providers: connected first, then alphabetically
  const sortedProviders = useMemo(
    () =>
      [...providers].sort((a, b) => {
        const aConn = connectedProviders.includes(a.id) ? 0 : 1;
        const bConn = connectedProviders.includes(b.id) ? 0 : 1;
        if (aConn !== bConn) return aConn - bConn;
        return a.name.localeCompare(b.name);
      }),
    [providers, connectedProviders],
  );

  return (
    <div className="model-tab">
      {/* ---- Current Model Summary ---- */}
      <SettingGroup
        title="Current Model"
        description="The model currently used for conversations."
      >
        <div className={`model-current-summary${usingAutoModel ? ' model-current-summary--auto' : ''}`}>
          <div className="model-current-summary__name">
            {usingAutoModel
              ? 'Automatic model selection'
              : currentModelObj?.name || currentModelID || 'Unknown'}
          </div>
          <div className="model-current-summary__provider">
            {usingAutoModel ? (
              <>
                Model: <strong>Auto</strong>
                <span
                  className={`model-group__status model-group__status--${connectedProviders.length > 0 ? 'connected' : 'disconnected'}`}
                >
                  {connectedProviders.length > 0
                    ? `${connectedProviders.length} provider${connectedProviders.length === 1 ? '' : 's'} connected`
                    : 'No connected providers'}
                </span>
              </>
            ) : (
              <>
                Provider: <strong>{currentProviderID}</strong>
                {connectedProviders.includes(currentProviderID) ? (
                  <span className="model-group__status model-group__status--connected">
                    Connected
                  </span>
                ) : (
                  <span className="model-group__status model-group__status--disconnected">
                    Disconnected
                  </span>
                )}
              </>
            )}
          </div>
          {usingAutoModel ? (
            <div className="model-current-summary__limits">
              OpenCode will pick the server default model until you pin one explicitly.
            </div>
          ) : currentModelObj?.limit ? (
            <div className="model-current-summary__limits">
              Context: {formatLimit(currentModelObj.limit.context)} tokens
              {currentModelObj.limit.output > 0 &&
                ` · Output: ${formatLimit(currentModelObj.limit.output)} tokens`}
            </div>
          ) : null}
          {(usingAutoModel || hasCurrentModelBadges) && (
            <div className="model-current-summary__badges">
              {usingAutoModel && <span className="model-option__badge">Auto</span>}
              {currentModelObj?.capabilities?.reasoning && (
                <span className="model-option__badge">Reasoning</span>
              )}
              {currentModelObj?.capabilities?.attachment && (
                <span className="model-option__badge">Attachments</span>
              )}
            </div>
          )}
        </div>
      </SettingGroup>

      {/* ---- Model Selection ---- */}
      <SettingGroup
        title="Select Model"
        description="Choose a model from your configured providers. Connected providers are shown first."
      >
        <div className="model-selection">
          <div
            className={[
              'model-option',
              'model-option--system',
              usingAutoModel && 'model-option--selected',
            ]
              .filter(Boolean)
              .join(' ')}
            onClick={clearModelSelection}
            role="button"
            tabIndex={0}
            aria-selected={usingAutoModel}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                clearModelSelection();
              }
            }}
          >
            <div className="model-option__body">
              <span className="model-option__name">Automatic selection</span>
              <span className="model-option__hint">
                Use the server default model when you do not want to pin a provider/model
                pair.
              </span>
            </div>
            <span className="model-option__badges">
              <span className="model-option__badge">Auto</span>
            </span>
          </div>

          {providers.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state__text">
                No providers available. Make sure the OpenCode server is running and has
                providers configured.
              </div>
            </div>
          ) : (
            sortedProviders.map((provider) => {
              const isConnected = connectedProviders.includes(provider.id);
              return (
                <div key={provider.id} className="model-group">
                  <div className="model-group__provider">
                    {provider.name}
                    <span
                      className={`model-group__status model-group__status--${
                        isConnected ? 'connected' : 'disconnected'
                      }`}
                    >
                      {isConnected ? 'Connected' : 'Disconnected'}
                    </span>
                  </div>
                  <div className="model-group__models">
                    {Object.values(provider.models).map((model) => {
                      const isSelected =
                        currentProviderID === provider.id &&
                        currentModelID === model.id;

                      return (
                        <div
                          key={model.id}
                          className={[
                            'model-option',
                            isSelected && 'model-option--selected',
                            !isConnected && 'model-option--disabled',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                          onClick={() => {
                            if (isConnected) {
                              handleModelSelect(provider.id, model.id);
                            }
                          }}
                          role="button"
                          tabIndex={isConnected ? 0 : -1}
                          aria-selected={isSelected}
                          aria-disabled={!isConnected}
                          onKeyDown={(e) => {
                            if (
                              isConnected &&
                              (e.key === 'Enter' || e.key === ' ')
                            ) {
                              handleModelSelect(provider.id, model.id);
                            }
                          }}
                        >
                          <span className="model-option__name">
                            {model.name || model.id}
                          </span>

                          {model.limit && (
                            <span className="model-option__limit">
                              {formatLimit(model.limit.context)}
                            </span>
                          )}

                          <span className="model-option__badges">
                            {model.capabilities?.reasoning && (
                              <span className="model-option__badge">
                                Reasoning
                              </span>
                            )}
                            {model.capabilities?.attachment && (
                              <span className="model-option__badge">
                                Attachments
                              </span>
                            )}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </SettingGroup>

      {/* ---- Agent Selection ---- */}
      <SettingGroup
        title="Agent"
        description="Choose the agent mode. Leave empty for the default agent."
      >
        <Dropdown
          label="Agent mode"
          description="The agent determines which tools and system prompt are used."
          value={currentAgent}
          options={
            agents.length > 0
              ? [
                  { value: '', label: 'Default' },
                  ...agents.map((a) => ({
                    value: a.name,
                    label: a.name,
                  })),
                ]
              : [
                  { value: '', label: 'Default' },
                  { value: 'code', label: 'Code' },
                  { value: 'task', label: 'Task' },
                ]
          }
          onChange={handleAgentChange}
        />
      </SettingGroup>

      {/* ---- Provider Availability ---- */}
      {providers.length > 0 && (
        <SettingGroup
          title="Provider Availability"
          description="Enable or disable known providers. Disabled providers will not appear in model selection."
        >
          <div className="provider-availability">
            {providers.map((p) => {
              const isConnected = connectedProviders.includes(p.id);
              const isEnabled = !disabledProviders.includes(p.id);

              return (
                <div className="provider-availability__row" key={p.id}>
                  <div className="provider-availability__info">
                    <span className="provider-availability__name">
                      {p.name || p.id}
                    </span>
                    <span
                      className={`provider-availability__status provider-availability__status--${isConnected ? 'connected' : 'disconnected'}`}
                    >
                      {isConnected ? 'Connected' : 'Not connected'}
                    </span>
                  </div>
                  <Toggle
                    label={`Enable ${p.name || p.id}`}
                    description={`${Object.keys(p.models).length} model(s) available`}
                    checked={isEnabled}
                    onChange={(checked) => handleToggleProvider(p.id, checked)}
                  />
                </div>
              );
            })}
          </div>
        </SettingGroup>
      )}
    </div>
  );
}
