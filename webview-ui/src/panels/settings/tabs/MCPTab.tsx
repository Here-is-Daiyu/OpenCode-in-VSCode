/**
 * MCP Servers settings tab.
 *
 * Lists configured MCP servers with their status, and provides a form
 * to add new servers or edit/delete existing ones.
 */

import React, { useCallback, useState } from 'react';
import { Field } from '../../../components/settings/Field';
import { SettingGroup } from '../../../components/settings/SettingGroup';
import { KeyValueEditor } from '../../../components/settings/KeyValueEditor';
import { NumberInput } from '../../../components/settings/NumberInput';
import { SegmentedControl } from '../../../components/settings/SegmentedControl';
import { TextInput } from '../../../components/settings/TextInput';
import { Toggle } from '../../../components/settings/Toggle';
import type { OpenCodeConfig, MCPServerConfig, MCPStatus } from '../../../types/opencode';

interface MCPTabProps {
  config: OpenCodeConfig;
  mcpStatus: Record<string, MCPStatus>;
  onAdd: (name: string, config: MCPServerConfig) => void;
  onRemove: (name: string) => void;
  onToggle: (name: string, enabled: boolean) => void;
}

export function MCPTab({
  config,
  mcpStatus,
  onAdd,
  onRemove,
  onToggle,
}: MCPTabProps) {
  const mcpServers = config.mcp ?? {};
  const [showForm, setShowForm] = useState(false);

  return (
    <>
      <SettingGroup
        title="MCP Servers"
        description="Model Context Protocol servers extend the AI's capabilities with external tools."
      >
        {/* Existing servers */}
        {Object.entries(mcpServers).length === 0 && !showForm && (
          <div className="empty-state">
            <div className="empty-state__icon">&#128268;</div>
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
              onRemove={() => onRemove(name)}
              onToggle={(enabled) => onToggle(name, enabled)}
            />
          );
        })}

        {/* Add server form */}
        {showForm ? (
          <AddMCPForm
            onAdd={(name, cfg) => {
              onAdd(name, cfg);
              setShowForm(false);
            }}
            onCancel={() => setShowForm(false)}
          />
        ) : (
          <button className="btn btn--primary" type="button" onClick={() => setShowForm(true)}>
            + Add MCP Server
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

      {/* Details */}
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
