/**
 * Custom Providers section of the Integrations tab.
 *
 * Contains the provider list, individual provider cards, and add/edit provider forms.
 */

import React, { useCallback, useState } from 'react';
import { SettingGroup } from '../../../../components/settings/SettingGroup';
import { TextInput } from '../../../../components/settings/TextInput';
import type { ProviderConfig } from '../../../../types/opencode';

// ---------------------------------------------------------------------------
//  Props
// ---------------------------------------------------------------------------

export interface ProvidersSectionProps {
  customProviders: Record<string, ProviderConfig>;
  onUpdateConfig: (partial: Record<string, unknown>) => void;
}

// ---------------------------------------------------------------------------
//  Providers Section
// ---------------------------------------------------------------------------

export function ProvidersSection({
  customProviders,
  onUpdateConfig,
}: ProvidersSectionProps) {
  const [showProviderForm, setShowProviderForm] = useState(false);
  const [editingProviderId, setEditingProviderId] = useState<string | null>(null);

  const handleAddProvider = useCallback(
    (id: string, providerCfg: ProviderConfig) => {
      onUpdateConfig({
        provider: { ...customProviders, [id]: providerCfg },
      });
      setShowProviderForm(false);
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
      setEditingProviderId(null);
    },
    [customProviders, onUpdateConfig],
  );

  return (
    <SettingGroup
      title="Custom Providers"
      description="Define your own AI providers backed by npm SDK packages."
    >
      {Object.entries(customProviders).length === 0 && !showProviderForm && (
        <div className="empty-state">
          <div className="empty-state__text">
            No custom providers configured. Add one to connect a third-party or
            self-hosted AI provider.
          </div>
        </div>
      )}

      {Object.entries(customProviders).map(([id, providerCfg]) =>
        editingProviderId === id ? (
          <EditProviderForm
            key={id}
            id={id}
            initial={providerCfg}
            onSave={(cfg) => handleUpdateProvider(id, cfg)}
            onCancel={() => setEditingProviderId(null)}
          />
        ) : (
          <ProviderCard
            key={id}
            id={id}
            config={providerCfg}
            onEdit={() => setEditingProviderId(id)}
            onRemove={() => handleRemoveProvider(id)}
          />
        ),
      )}

      {showProviderForm ? (
        <AddProviderForm
          onAdd={handleAddProvider}
          onCancel={() => setShowProviderForm(false)}
        />
      ) : (
        <button
          className="btn btn--primary"
          type="button"
          onClick={() => setShowProviderForm(true)}
        >
          + Add Provider
        </button>
      )}
    </SettingGroup>
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
