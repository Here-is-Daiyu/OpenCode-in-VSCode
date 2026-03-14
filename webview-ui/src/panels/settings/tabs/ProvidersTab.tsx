/**
 * Providers settings tab.
 *
 * Section 1 — "Custom Providers": cards for each entry in config.provider,
 *   with add / edit / delete capability.
 * Section 2 — "Provider Availability": toggle rows for every known provider,
 *   backed by the disabled_providers config field.
 */

import React, { useCallback, useState } from 'react';
import { SettingGroup } from '../../../components/settings/SettingGroup';
import { TextInput } from '../../../components/settings/TextInput';
import { Toggle } from '../../../components/settings/Toggle';
import type { OpenCodeConfig, Provider, ProviderConfig } from '../../../types/opencode';

// ---------------------------------------------------------------------------
//  Props
// ---------------------------------------------------------------------------

interface ProvidersTabProps {
  config: OpenCodeConfig;
  providers: Provider[];
  connectedProviders: string[];
  onUpdateConfig: (partial: Record<string, unknown>) => void;
}

// ---------------------------------------------------------------------------
//  Main component
// ---------------------------------------------------------------------------

export function ProvidersTab({
  config,
  providers,
  connectedProviders,
  onUpdateConfig,
}: ProvidersTabProps) {
  const customProviders = config.provider ?? {};
  const disabledProviders = config.disabled_providers ?? [];
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // ---- Custom provider CRUD ----

  const handleAddProvider = useCallback(
    (id: string, providerCfg: ProviderConfig) => {
      onUpdateConfig({
        provider: { ...customProviders, [id]: providerCfg },
      });
      setShowForm(false);
    },
    [customProviders, onUpdateConfig],
  );

  const handleRemoveProvider = useCallback(
    (id: string) => {
      const updated = { ...customProviders };
      delete updated[id];
      onUpdateConfig({ provider: updated });
    },
    [customProviders, onUpdateConfig],
  );

  const handleUpdateProvider = useCallback(
    (id: string, providerCfg: ProviderConfig) => {
      onUpdateConfig({
        provider: { ...customProviders, [id]: providerCfg },
      });
      setEditingId(null);
    },
    [customProviders, onUpdateConfig],
  );

  // ---- Disabled-providers toggle ----

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

  return (
    <>
      {/* ------------------------------------------------------------ */}
      {/*  Section 1 — Custom Providers                                */}
      {/* ------------------------------------------------------------ */}
      <SettingGroup
        title="Custom Providers"
        description="Define your own AI providers backed by npm SDK packages. Models within a provider can be edited via the config file."
      >
        {Object.entries(customProviders).length === 0 && !showForm && (
          <div className="empty-state">
            <div className="empty-state__icon">⚡</div>
            <div className="empty-state__text">
              No custom providers configured. Add one to connect a third-party or
              self-hosted AI provider.
            </div>
          </div>
        )}

        {Object.entries(customProviders).map(([id, providerCfg]) =>
          editingId === id ? (
            <EditProviderForm
              key={id}
              id={id}
              initial={providerCfg}
              onSave={(cfg) => handleUpdateProvider(id, cfg)}
              onCancel={() => setEditingId(null)}
            />
          ) : (
            <ProviderCard
              key={id}
              id={id}
              config={providerCfg}
              onEdit={() => setEditingId(id)}
              onRemove={() => handleRemoveProvider(id)}
            />
          ),
        )}

        {showForm ? (
          <AddProviderForm
            onAdd={handleAddProvider}
            onCancel={() => setShowForm(false)}
          />
        ) : (
          <button
            className="btn btn--primary"
            type="button"
            onClick={() => setShowForm(true)}
          >
            + Add Provider
          </button>
        )}
      </SettingGroup>

      {/* ------------------------------------------------------------ */}
      {/*  Section 2 — Provider Availability                           */}
      {/* ------------------------------------------------------------ */}
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
    </>
  );
}

// ---------------------------------------------------------------------------
//  Provider Card
// ---------------------------------------------------------------------------

function ProviderCard({
  id,
  config,
  onEdit,
  onRemove,
}: {
  id: string;
  config: ProviderConfig;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const baseURL = (config.options?.baseURL as string | undefined) ?? '';
  const modelCount = Object.keys(config.models).length;

  return (
    <div className="provider-card">
      <div className="provider-card__header">
        <div className="provider-card__title">
          <span className="provider-card__name">{config.name || id}</span>
          <div className="provider-card__pills">
            <span className="provider-card__badge">{id}</span>
            <span className="provider-card__badge">
              {modelCount} model{modelCount !== 1 ? 's' : ''}
            </span>
          </div>
        </div>

        <div className="provider-card__actions">
          <button
            className="provider-card__action-btn"
            type="button"
            onClick={onEdit}
            title="Edit"
          >
            Edit
          </button>
          {confirmDelete ? (
            <>
              <button
                className="provider-card__action-btn provider-card__action-btn--danger"
                type="button"
                onClick={onRemove}
                title="Confirm delete"
              >
                Confirm
              </button>
              <button
                className="provider-card__action-btn"
                type="button"
                onClick={() => setConfirmDelete(false)}
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              className="provider-card__action-btn provider-card__action-btn--danger"
              type="button"
              onClick={() => setConfirmDelete(true)}
              title="Delete"
            >
              Delete
            </button>
          )}
        </div>
      </div>

      <div className="provider-card__body">
        <div className="provider-card__detail">
          <span className="provider-card__detail-label">NPM:</span>
          <span className="provider-card__detail-value--mono">{config.npm}</span>
        </div>
        {baseURL && (
          <div className="provider-card__detail">
            <span className="provider-card__detail-label">Base URL:</span>
            <span className="provider-card__detail-value--mono">{baseURL}</span>
          </div>
        )}
        {modelCount > 0 && (
          <div className="provider-card__detail">
            <span className="provider-card__detail-label">Models:</span>
            <span>{Object.keys(config.models).join(', ')}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
//  Add Provider Form
// ---------------------------------------------------------------------------

function AddProviderForm({
  onAdd,
  onCancel,
}: {
  onAdd: (id: string, config: ProviderConfig) => void;
  onCancel: () => void;
}) {
  const [id, setId] = useState('');
  const [name, setName] = useState('');
  const [npm, setNpm] = useState('');
  const [baseURL, setBaseURL] = useState('');

  const handleSubmit = useCallback(() => {
    if (!id.trim() || !name.trim() || !npm.trim()) return;

    const cfg: ProviderConfig = {
      name: name.trim(),
      npm: npm.trim(),
      models: {},
    };

    if (baseURL.trim()) {
      cfg.options = { baseURL: baseURL.trim() };
    }

    onAdd(id.trim(), cfg);
  }, [id, name, npm, baseURL, onAdd]);

  const isValid = id.trim() && name.trim() && npm.trim();

  return (
    <div className="provider-form">
      <div className="provider-form__title">Add Provider</div>
      <div className="provider-form__fields">
        <TextInput
          label="Provider ID"
          description="Unique identifier used in the config file (e.g. my-openai)."
          placeholder="my-openai"
          value={id}
          onChange={setId}
          mono
        />

        <TextInput
          label="Display Name"
          description="Human-readable name shown in the UI."
          placeholder="My OpenAI"
          value={name}
          onChange={setName}
        />

        <TextInput
          label="NPM Package"
          description="The AI SDK provider package to import."
          placeholder="@ai-sdk/openai-compatible"
          value={npm}
          onChange={setNpm}
          mono
        />

        <TextInput
          label="Base URL"
          description="Optional base URL for the provider API."
          placeholder="https://api.openai.com/v1"
          value={baseURL}
          onChange={setBaseURL}
          mono
        />

        <div className="provider-form__hint">
          Models can be added after creation by editing the config file directly.
        </div>

        <div className="provider-form__actions">
          <button
            className="btn btn--primary"
            type="button"
            onClick={handleSubmit}
            disabled={!isValid}
          >
            Add Provider
          </button>
          <button className="btn btn--secondary" type="button" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
//  Edit Provider Form (inline)
// ---------------------------------------------------------------------------

function EditProviderForm({
  id,
  initial,
  onSave,
  onCancel,
}: {
  id: string;
  initial: ProviderConfig;
  onSave: (config: ProviderConfig) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial.name);
  const [npm, setNpm] = useState(initial.npm);
  const [baseURL, setBaseURL] = useState(
    (initial.options?.baseURL as string | undefined) ?? '',
  );

  const handleSubmit = useCallback(() => {
    if (!name.trim() || !npm.trim()) return;

    const cfg: ProviderConfig = {
      name: name.trim(),
      npm: npm.trim(),
      models: initial.models,
    };

    const options: Record<string, unknown> = { ...initial.options };
    if (baseURL.trim()) {
      options.baseURL = baseURL.trim();
    } else {
      delete options.baseURL;
    }
    if (Object.keys(options).length > 0) {
      cfg.options = options;
    }

    onSave(cfg);
  }, [name, npm, baseURL, initial, onSave]);

  const isValid = name.trim() && npm.trim();

  return (
    <div className="provider-form">
      <div className="provider-form__title">
        Edit Provider — <span className="provider-form__title-id">{id}</span>
      </div>
      <div className="provider-form__fields">
        <TextInput
          label="Display Name"
          description="Human-readable name shown in the UI."
          placeholder="My OpenAI"
          value={name}
          onChange={setName}
        />

        <TextInput
          label="NPM Package"
          description="The AI SDK provider package to import."
          placeholder="@ai-sdk/openai-compatible"
          value={npm}
          onChange={setNpm}
          mono
        />

        <TextInput
          label="Base URL"
          description="Optional base URL for the provider API."
          placeholder="https://api.openai.com/v1"
          value={baseURL}
          onChange={setBaseURL}
          mono
        />

        <div className="provider-form__hint">
          Models ({Object.keys(initial.models).length}) are preserved.
          Edit models via the config file.
        </div>

        <div className="provider-form__actions">
          <button
            className="btn btn--primary"
            type="button"
            onClick={handleSubmit}
            disabled={!isValid}
          >
            Save Changes
          </button>
          <button className="btn btn--secondary" type="button" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
