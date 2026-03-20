/**
 * Integrations settings tab.
 *
 * Combines MCP Servers, Custom Commands, and Custom Providers (CRUD only)
 * into a single unified tab for managing external integrations.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { Dropdown, type DropdownOption } from '../../../components/settings/Dropdown';
import { Field } from '../../../components/settings/Field';
import { KeyValueEditor } from '../../../components/settings/KeyValueEditor';
import { NumberInput } from '../../../components/settings/NumberInput';
import { SegmentedControl } from '../../../components/settings/SegmentedControl';
import { SettingGroup } from '../../../components/settings/SettingGroup';
import { TextInput } from '../../../components/settings/TextInput';
import { Textarea } from '../../../components/settings/Textarea';
import { Toggle } from '../../../components/settings/Toggle';
import type {
  OpenCodeConfig,
  CustomCommand,
  MCPServerConfig,
  MCPStatus,
  Provider,
  ProviderConfig,
} from '../../../types/opencode';

// ---------------------------------------------------------------------------
//  Props
// ---------------------------------------------------------------------------

interface IntegrationsTabProps {
  config: OpenCodeConfig;
  providers: Provider[];
  connectedProviders: string[];
  mcpStatus: Record<string, MCPStatus>;
  onUpdateConfig: (partial: Record<string, unknown>) => void;
  onMCPAdd: (name: string, config: MCPServerConfig) => void;
  onMCPRemove: (name: string) => void;
  onMCPToggle: (name: string, enabled: boolean) => void;
}

// ---------------------------------------------------------------------------
//  Main component
// ---------------------------------------------------------------------------

export function IntegrationsTab({
  config,
  providers,
  connectedProviders,
  mcpStatus,
  onUpdateConfig,
  onMCPAdd,
  onMCPRemove,
  onMCPToggle,
}: IntegrationsTabProps) {
  const mcpServers = config.mcp ?? {};
  const commands = config.command ?? {};
  const customProviders = config.provider ?? {};

  // ---- MCP state ----
  const [showMCPForm, setShowMCPForm] = useState(false);

  // ---- Command state ----
  const [showCommandForm, setShowCommandForm] = useState(false);
  const [editingCommandName, setEditingCommandName] = useState<string | null>(null);

  const handleCommandDelete = useCallback(
    (name: string) => {
      const updated = { ...commands };
      delete updated[name];
      onUpdateConfig({ command: updated });
    },
    [commands, onUpdateConfig],
  );

  const handleCommandSave = useCallback(
    (name: string, cmd: CustomCommand) => {
      const updated = { ...commands, [name]: cmd };
      onUpdateConfig({ command: updated });
      setShowCommandForm(false);
      setEditingCommandName(null);
    },
    [commands, onUpdateConfig],
  );

  const handleCommandEdit = useCallback((name: string) => {
    setEditingCommandName(name);
    setShowCommandForm(true);
  }, []);

  // ---- Provider state ----
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
    <>
      {/* -------------------------------------------------------------- */}
      {/*  Section 1 — MCP Servers                                       */}
      {/* -------------------------------------------------------------- */}
      <SettingGroup
        title="MCP Servers"
        description="Model Context Protocol servers extend the AI's capabilities with external tools."
      >
        {Object.entries(mcpServers).length === 0 && !showMCPForm && (
          <div className="empty-state">
            <div className="empty-state__text">
              No MCP servers configured. Add one to extend AI capabilities.
            </div>
          </div>
        )}

        {Object.entries(mcpServers).map(([name, serverConfig]) => {
          const status = mcpStatus[name];
          return (
            <MCPServerCard
              key={name}
              name={name}
              config={serverConfig}
              status={status}
              onRemove={() => onMCPRemove(name)}
              onToggle={(enabled) => onMCPToggle(name, enabled)}
            />
          );
        })}

        {showMCPForm ? (
          <AddMCPForm
            onAdd={(name, cfg) => {
              onMCPAdd(name, cfg);
              setShowMCPForm(false);
            }}
            onCancel={() => setShowMCPForm(false)}
          />
        ) : (
          <button
            className="btn btn--primary"
            type="button"
            onClick={() => setShowMCPForm(true)}
          >
            + Add MCP Server
          </button>
        )}
      </SettingGroup>

      {/* -------------------------------------------------------------- */}
      {/*  Section 2 — Custom Commands                                   */}
      {/* -------------------------------------------------------------- */}
      <SettingGroup
        title="Custom Commands"
        description="Define reusable prompt templates invoked with slash commands."
      >
        {Object.entries(commands).length === 0 && !showCommandForm && (
          <div className="empty-state">
            <div className="empty-state__text">
              No custom commands defined. Add one to create reusable prompt templates.
            </div>
          </div>
        )}

        {Object.entries(commands).map(([name, cmd]) => {
          if (editingCommandName === name && showCommandForm) return null;
          return (
            <CommandCard
              key={name}
              name={name}
              command={cmd}
              onEdit={() => handleCommandEdit(name)}
              onDelete={() => handleCommandDelete(name)}
            />
          );
        })}

        {showCommandForm ? (
          <CommandForm
            initialName={editingCommandName ?? ''}
            initialCommand={editingCommandName ? commands[editingCommandName] : undefined}
            providers={providers}
            onSave={handleCommandSave}
            onCancel={() => {
              setShowCommandForm(false);
              setEditingCommandName(null);
            }}
          />
        ) : (
          <button
            className="btn btn--primary"
            type="button"
            onClick={() => {
              setEditingCommandName(null);
              setShowCommandForm(true);
            }}
          >
            + Add Command
          </button>
        )}
      </SettingGroup>

      {/* -------------------------------------------------------------- */}
      {/*  Section 3 — Custom Providers                                  */}
      {/* -------------------------------------------------------------- */}
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
    </>
  );
}

// ---------------------------------------------------------------------------
//  MCP Server Card
// ---------------------------------------------------------------------------

function MCPServerCard({
  name,
  config,
  status,
  onRemove,
  onToggle,
}: {
  name: string;
  config: MCPServerConfig;
  status?: MCPStatus;
  onRemove: () => void;
  onToggle: (enabled: boolean) => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const statusStr = status?.status ?? 'disconnected';
  const isEnabled = config.enabled !== false;

  return (
    <div className="mcp-card">
      <div className="mcp-card__header">
        <div className={`mcp-card__status-dot mcp-card__status-dot--${statusStr}`} />
        <div className="mcp-card__title">
          <span className="mcp-card__name">{name}</span>
          <div className="mcp-card__pills">
            <span className="mcp-card__type">{config.type}</span>
            <span className={`mcp-card__type ${isEnabled ? '' : 'mcp-card__type--muted'}`}>
              {isEnabled ? 'Enabled' : 'Paused'}
            </span>
          </div>
        </div>

        <div className="mcp-card__actions">
          <button
            className="mcp-card__action-btn"
            type="button"
            onClick={() => onToggle(!isEnabled)}
            title={isEnabled ? 'Disable' : 'Enable'}
          >
            {isEnabled ? 'Pause' : 'Enable'}
          </button>
          {confirmDelete ? (
            <>
              <button
                className="mcp-card__action-btn mcp-card__action-btn--danger"
                type="button"
                onClick={onRemove}
                title="Confirm delete"
              >
                Confirm
              </button>
              <button
                className="mcp-card__action-btn"
                type="button"
                onClick={() => setConfirmDelete(false)}
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              className="mcp-card__action-btn mcp-card__action-btn--danger"
              type="button"
              onClick={() => setConfirmDelete(true)}
              title="Delete"
            >
              Delete
            </button>
          )}
        </div>
      </div>

      <div className="mcp-card__body">
        {config.type === 'local' && config.command && (
          <div className="mcp-card__detail">
            <span className="mcp-card__detail-label">Command:</span>
            <span style={{ fontFamily: 'var(--vscode-editor-font-family, monospace)' }}>
              {config.command.join(' ')}
            </span>
          </div>
        )}
        {config.type === 'remote' && config.url && (
          <div className="mcp-card__detail">
            <span className="mcp-card__detail-label">URL:</span>
            <span>{config.url}</span>
          </div>
        )}
        {config.timeout !== undefined && (
          <div className="mcp-card__detail">
            <span className="mcp-card__detail-label">Timeout:</span>
            <span>{config.timeout}ms</span>
          </div>
        )}
        <div className="mcp-card__detail">
          <span className="mcp-card__detail-label">Status:</span>
          <span>{statusStr}</span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
//  Add MCP Server Form
// ---------------------------------------------------------------------------

function AddMCPForm({
  onAdd,
  onCancel,
}: {
  onAdd: (name: string, config: MCPServerConfig) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [type, setType] = useState<'local' | 'remote'>('local');
  const [command, setCommand] = useState('');
  const [url, setUrl] = useState('');
  const [timeout, setTimeout_] = useState(30000);
  const [enabled, setEnabled] = useState(true);
  const [envPairs, setEnvPairs] = useState<Array<{ key: string; value: string }>>([]);
  const [headerPairs, setHeaderPairs] = useState<Array<{ key: string; value: string }>>([]);

  const handleSubmit = useCallback(() => {
    if (!name.trim()) return;

    const cfg: MCPServerConfig = {
      type,
      enabled,
      timeout,
    };

    if (type === 'local') {
      cfg.command = command.split(/\s+/).filter(Boolean);
      if (envPairs.length > 0) {
        cfg.environment = {};
        for (const p of envPairs) {
          if (p.key.trim()) {
            cfg.environment[p.key.trim()] = p.value;
          }
        }
      }
    } else {
      cfg.url = url;
      if (headerPairs.length > 0) {
        cfg.headers = {};
        for (const p of headerPairs) {
          if (p.key.trim()) {
            cfg.headers[p.key.trim()] = p.value;
          }
        }
      }
    }

    onAdd(name.trim(), cfg);
  }, [name, type, command, url, timeout, enabled, envPairs, headerPairs, onAdd]);

  const isValid = name.trim() && (type === 'local' ? command.trim() : url.trim());

  return (
    <div className="mcp-form">
      <div className="mcp-form__title">Add MCP Server</div>
      <div className="mcp-form__fields">
        <TextInput
          label="Server name"
          description="Unique ID used by the OpenCode config file."
          placeholder="my-server"
          value={name}
          onChange={setName}
        />

        <Field
          label="Connection type"
          description="Choose whether this server is launched locally or reached over HTTP."
        >
          <SegmentedControl
            value={type}
            options={[
              { value: 'local', label: 'Local command' },
              { value: 'remote', label: 'Remote URL' },
            ]}
            onChange={setType}
          />
        </Field>

        {type === 'local' && (
          <>
            <TextInput
              label="Command"
              description="Command line used to start the MCP process."
              placeholder="npx -y @modelcontextprotocol/server-filesystem ."
              value={command}
              onChange={setCommand}
              mono
            />
            <KeyValueEditor
              label="Environment variables"
              pairs={envPairs}
              keyPlaceholder="VAR_NAME"
              valuePlaceholder="value"
              onChange={setEnvPairs}
            />
          </>
        )}

        {type === 'remote' && (
          <>
            <TextInput
              label="URL"
              description="Remote MCP endpoint exposed by your server."
              placeholder="https://example.com/mcp"
              value={url}
              onChange={setUrl}
              mono
            />
            <KeyValueEditor
              label="Headers"
              pairs={headerPairs}
              keyPlaceholder="Header"
              valuePlaceholder="Value"
              onChange={setHeaderPairs}
            />
          </>
        )}

        <NumberInput
          label="Timeout (ms)"
          description="How long OpenCode waits before considering the MCP request failed."
          value={timeout}
          min={1000}
          max={300000}
          step={1000}
          onChange={setTimeout_}
        />

        <Toggle
          label="Enabled on create"
          description="Keep the server active immediately after it is added."
          checked={enabled}
          onChange={setEnabled}
        />

        <div className="mcp-form__actions">
          <button
            className="btn btn--primary"
            type="button"
            onClick={handleSubmit}
            disabled={!isValid}
          >
            Add Server
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
//  Command Card
// ---------------------------------------------------------------------------

function CommandCard({
  name,
  command,
  onEdit,
  onDelete,
}: {
  name: string;
  command: CustomCommand;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className="command-card">
      <div className="command-card__header">
        <div className="command-card__title-wrap">
          <span className="command-card__name">/{name}</span>
          <div className="command-card__badges">
            {command.agent && (
              <span className="command-card__badge">{command.agent}</span>
            )}
            {command.subtask && (
              <span className="command-card__badge">subtask</span>
            )}
            {command.model && (
              <span className="command-card__badge">model override</span>
            )}
          </div>
        </div>
        <div className="command-card__actions">
          <button
            className="mcp-card__action-btn"
            type="button"
            onClick={onEdit}
            title="Edit"
          >
            Edit
          </button>
          {confirmDelete ? (
            <>
              <button
                className="mcp-card__action-btn mcp-card__action-btn--danger"
                type="button"
                onClick={onDelete}
              >
                Confirm
              </button>
              <button
                className="mcp-card__action-btn"
                type="button"
                onClick={() => setConfirmDelete(false)}
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              className="mcp-card__action-btn mcp-card__action-btn--danger"
              type="button"
              onClick={() => setConfirmDelete(true)}
              title="Delete"
            >
              Delete
            </button>
          )}
        </div>
      </div>
      {command.description && (
        <div className="command-card__description">{command.description}</div>
      )}
      <div className="command-card__template">{command.template}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
//  Command Form
// ---------------------------------------------------------------------------

function CommandForm({
  initialName,
  initialCommand,
  providers,
  onSave,
  onCancel,
}: {
  initialName: string;
  initialCommand?: CustomCommand;
  providers: Provider[];
  onSave: (name: string, cmd: CustomCommand) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [template, setTemplate] = useState(initialCommand?.template ?? '');
  const [description, setDescription] = useState(initialCommand?.description ?? '');
  const [agent, setAgent] = useState<'' | 'code' | 'task'>(
    (initialCommand?.agent as '' | 'code' | 'task') ?? '',
  );
  const [model, setModel] = useState(initialCommand?.model ?? '');
  const [subtask, setSubtask] = useState(initialCommand?.subtask ?? false);

  const modelOptions = useMemo<DropdownOption[]>(
    () => [
      { value: '', label: 'Use workspace default' },
      ...providers.flatMap((provider) =>
        Object.values(provider.models).map((modelOption) => ({
          value: `${provider.id}/${modelOption.id}`,
          label: modelOption.name || modelOption.id,
          group: provider.name,
        })),
      ),
    ],
    [providers],
  );

  const handleSubmit = useCallback(() => {
    if (!name.trim() || !template.trim()) return;
    const cmd: CustomCommand = { template };
    if (description.trim()) cmd.description = description.trim();
    if (agent) cmd.agent = agent;
    if (model) cmd.model = model;
    if (subtask) cmd.subtask = true;
    onSave(name.trim(), cmd);
  }, [name, template, description, agent, model, subtask, onSave]);

  const isValid = name.trim() && template.trim();

  return (
    <div className="command-form">
      <div className="command-form__title">
        {initialCommand ? 'Edit Command' : 'Add Command'}
      </div>
      <div className="command-form__fields">
        <TextInput
          label="Name"
          description="Slash command identifier without the leading '/'."
          placeholder="my-command"
          value={name}
          onChange={setName}
          mono
          disabled={!!initialName}
        />

        <Textarea
          label="Template"
          description="Prompt template text. Use {{input}} when you want to inject the user's arguments."
          placeholder="Write the prompt template here. Use {{input}} for user input."
          value={template}
          onChange={setTemplate}
          mono
          rows={6}
        />

        <TextInput
          label="Description"
          description="Optional helper text shown in the settings list."
          placeholder="Optional description"
          value={description}
          onChange={setDescription}
        />

        <Field
          label="Agent"
          description="Choose which agent profile runs the command by default."
        >
          <SegmentedControl
            value={agent}
            options={[
              { value: '', label: 'Default' },
              { value: 'code', label: 'Code' },
              { value: 'task', label: 'Task' },
            ]}
            onChange={setAgent}
          />
        </Field>

        <Dropdown
          label="Model override"
          description="Optional. Keep the workspace default, or pin this command to a specific model."
          value={model}
          options={modelOptions}
          onChange={setModel}
        />

        <Toggle
          label="Run as subtask"
          description="Delegate the command into a subtask session instead of the active conversation."
          checked={subtask}
          onChange={setSubtask}
        />

        <div className="command-form__actions">
          <button
            className="btn btn--primary"
            type="button"
            onClick={handleSubmit}
            disabled={!isValid}
          >
            {initialCommand ? 'Save Changes' : 'Add Command'}
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
