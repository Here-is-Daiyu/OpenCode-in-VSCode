/**
 * Model & Agent tab — select current model grouped by provider, view model
 * capabilities, choose agent, and adjust reasoning effort if applicable.
 */

import React, { useCallback, useMemo } from 'react';
import type { OpenCodeConfig, Provider } from '../../../types/opencode';
import { SettingGroup } from '../../../components/settings/SettingGroup';
import { Field } from '../../../components/settings/Field';
import { SegmentedControl } from '../../../components/settings/SegmentedControl';

interface ModelTabProps {
  config: OpenCodeConfig;
  providers: Provider[];
  connectedProviders: string[];
  onUpdateConfig: (partial: Record<string, unknown>) => void;
}

/** Format a context/output limit into a human-readable string (e.g. 128000 → "128K"). */
function formatLimit(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1)}K`;
  return String(n);
}

export function ModelTab({
  config,
  providers,
  connectedProviders,
  onUpdateConfig,
}: ModelTabProps) {
  // Current model is stored as "providerId/modelId"
  const currentModel = config.model ?? '';

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

  // Check if the current model supports reasoning
  const supportsReasoning = currentModelObj?.capabilities?.reasoning ?? false;

  // Select a model
  const handleModelSelect = useCallback(
    (providerID: string, modelID: string) => {
      onUpdateConfig({ model: `${providerID}/${modelID}` });
    },
    [onUpdateConfig],
  );

  // Agent selection — we don't have a separate agents list in props,
  // so we use config.agent and allow the user to set it as a string.
  const handleAgentChange = useCallback(
    (value: string) => {
      onUpdateConfig({ agent: value || undefined });
    },
    [onUpdateConfig],
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
      {currentModel && (
        <SettingGroup
          title="Current Model"
          description="The model currently used for conversations."
        >
          <div className="model-current-summary">
            <div className="model-current-summary__name">
              {currentModelObj?.name || currentModelID || 'Unknown'}
            </div>
            <div className="model-current-summary__provider">
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
            </div>
            {currentModelObj?.limit && (
              <div className="model-current-summary__limits">
                Context: {formatLimit(currentModelObj.limit.context)} tokens
                {currentModelObj.limit.output > 0 &&
                  ` · Output: ${formatLimit(currentModelObj.limit.output)} tokens`}
              </div>
            )}
            <div className="model-current-summary__badges">
              {currentModelObj?.capabilities?.reasoning && (
                <span className="model-option__badge">Reasoning</span>
              )}
              {currentModelObj?.capabilities?.attachment && (
                <span className="model-option__badge">Attachments</span>
              )}
            </div>
          </div>
        </SettingGroup>
      )}

      {/* ---- Model Selection ---- */}
      <SettingGroup
        title="Select Model"
        description="Choose a model from your configured providers. Connected providers are shown first."
      >
        {providers.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state__icon">🔌</div>
            <div className="empty-state__text">
              No providers available. Make sure the OpenCode server is running and has
              providers configured.
            </div>
          </div>
        ) : (
          <div className="model-selection">
            {sortedProviders.map((provider) => {
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
            })}
          </div>
        )}
      </SettingGroup>

      {/* ---- Agent Selection ---- */}
      <SettingGroup
        title="Agent"
        description="Choose the agent mode. Leave empty for the default agent."
      >
        <Field
          label="Agent mode"
          description="The agent determines which tools and system prompt are used."
        >
          <SegmentedControl
            value={(config.agent ?? '') as '' | 'code' | 'task'}
            options={[
              { value: '', label: 'Default' },
              { value: 'code', label: 'Code' },
              { value: 'task', label: 'Task' },
            ]}
            onChange={handleAgentChange}
          />
        </Field>
      </SettingGroup>

      {/* ---- Reasoning Effort (conditional) ---- */}
      {supportsReasoning && (
        <SettingGroup
          title="Reasoning"
          description="Configure reasoning behavior for models that support it."
        >
          <div className="setting-row">
            <span className="setting-row__label">Reasoning Effort</span>
            <span className="setting-row__description">
              Higher values produce more thorough reasoning chains but use more tokens.
              Not all providers support this parameter.
            </span>
            <div className="setting-row__control">
              <div className="reasoning-effort-labels">
                <span className="reasoning-effort-labels__low">Low</span>
                <span className="reasoning-effort-labels__medium">Medium</span>
                <span className="reasoning-effort-labels__high">High</span>
              </div>
            </div>
          </div>
        </SettingGroup>
      )}
    </div>
  );
}
