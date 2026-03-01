/**
 * MCP Servers settings tab.
 *
 * Lists configured MCP servers with their status, and provides a form
 * to add new servers or edit/delete existing ones.
 */

import React, { useCallback, useState } from 'react';
import { SettingGroup } from '../../../components/settings/SettingGroup';
import { KeyValueEditor } from '../../../components/settings/KeyValueEditor';
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
          <button className="btn btn--primary" onClick={() => setShowForm(true)}>
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
        <span className="mcp-card__name">{name}</span>
        <span className="mcp-card__type">{config.type}</span>
        {status?.tools !== undefined && (
          <span className="mcp-card__tools">
            {status.tools} tool{status.tools !== 1 ? 's' : ''}
          </span>
        )}
        <div className="mcp-card__actions">
          <button
            className="mcp-card__action-btn"
            onClick={() => onToggle(!isEnabled)}
            title={isEnabled ? 'Disable' : 'Enable'}
          >
            {isEnabled ? '⏸' : '▶'}
          </button>
          {confirmDelete ? (
            <>
              <button
                className="mcp-card__action-btn mcp-card__action-btn--danger"
                onClick={onRemove}
                title="Confirm delete"
              >
                Confirm
              </button>
              <button
                className="mcp-card__action-btn"
                onClick={() => setConfirmDelete(false)}
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              className="mcp-card__action-btn mcp-card__action-btn--danger"
              onClick={() => setConfirmDelete(true)}
              title="Delete"
            >
              ✕
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

      {/* Error */}
      {status?.error && (
        <div className="mcp-card__error">{status.error}</div>
      )}
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
        {/* Name */}
        <div className="mcp-form__row">
          <label className="mcp-form__label">Server name</label>
          <input
            className="setting-text-input"
            placeholder="my-server"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        {/* Type */}
        <div className="mcp-form__row">
          <label className="mcp-form__label">Type</label>
          <div className="mcp-form__radio-group">
            <label className="mcp-form__radio">
              <input
                type="radio"
                checked={type === 'local'}
                onChange={() => setType('local')}
              />
              Local (command)
            </label>
            <label className="mcp-form__radio">
              <input
                type="radio"
                checked={type === 'remote'}
                onChange={() => setType('remote')}
              />
              Remote (URL)
            </label>
          </div>
        </div>

        {/* Local fields */}
        {type === 'local' && (
          <>
            <div className="mcp-form__row">
              <label className="mcp-form__label">Command</label>
              <input
                className="setting-text-input setting-text-input--mono"
                placeholder="npx -y @modelcontextprotocol/server-filesystem ."
                value={command}
                onChange={(e) => setCommand(e.target.value)}
              />
            </div>
            <KeyValueEditor
              label="Environment variables"
              pairs={envPairs}
              keyPlaceholder="VAR_NAME"
              valuePlaceholder="value"
              onChange={setEnvPairs}
            />
          </>
        )}

        {/* Remote fields */}
        {type === 'remote' && (
          <>
            <div className="mcp-form__row">
              <label className="mcp-form__label">URL</label>
              <input
                className="setting-text-input setting-text-input--mono"
                placeholder="https://example.com/mcp"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </div>
            <KeyValueEditor
              label="Headers"
              pairs={headerPairs}
              keyPlaceholder="Header"
              valuePlaceholder="Value"
              onChange={setHeaderPairs}
            />
          </>
        )}

        {/* Timeout */}
        <div className="mcp-form__row">
          <label className="mcp-form__label">Timeout (ms)</label>
          <input
            className="setting-number-input__field"
            type="number"
            value={timeout}
            min={1000}
            max={300000}
            onChange={(e) => setTimeout_(Number(e.target.value))}
          />
        </div>

        {/* Actions */}
        <div className="mcp-form__actions">
          <button
            className="btn btn--primary"
            onClick={handleSubmit}
            disabled={!isValid}
          >
            Add Server
          </button>
          <button className="btn btn--secondary" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
