/**
 * Custom Commands settings tab.
 *
 * Shows configured custom commands with add/edit/delete UI.
 */

import React, { useCallback, useState } from 'react';
import { SettingGroup } from '../../../components/settings/SettingGroup';
import type { OpenCodeConfig, CustomCommand, Provider } from '../../../types/opencode';

interface CommandsTabProps {
  config: OpenCodeConfig;
  providers: Provider[];
  onUpdateConfig: (partial: Record<string, unknown>) => void;
}

export function CommandsTab({ config, providers, onUpdateConfig }: CommandsTabProps) {
  const commands = config.command ?? {};
  const [showForm, setShowForm] = useState(false);
  const [editingName, setEditingName] = useState<string | null>(null);

  const handleDelete = useCallback(
    (name: string) => {
      const updated = { ...commands };
      delete updated[name];
      onUpdateConfig({ command: updated });
    },
    [commands, onUpdateConfig],
  );

  const handleSave = useCallback(
    (name: string, cmd: CustomCommand) => {
      const updated = { ...commands, [name]: cmd };
      onUpdateConfig({ command: updated });
      setShowForm(false);
      setEditingName(null);
    },
    [commands, onUpdateConfig],
  );

  const handleEdit = useCallback((name: string) => {
    setEditingName(name);
    setShowForm(true);
  }, []);

  return (
    <>
      <SettingGroup
        title="Custom Commands"
        description="Define reusable prompt templates that can be invoked with slash commands."
      >
        {/* Existing commands */}
        {Object.entries(commands).length === 0 && !showForm && (
          <div className="empty-state">
            <div className="empty-state__icon">&#9889;</div>
            <div className="empty-state__text">
              No custom commands defined. Add one to create reusable prompt templates.
            </div>
          </div>
        )}

        {Object.entries(commands).map(([name, cmd]) => {
          if (editingName === name && showForm) return null;
          return (
            <CommandCard
              key={name}
              name={name}
              command={cmd}
              onEdit={() => handleEdit(name)}
              onDelete={() => handleDelete(name)}
            />
          );
        })}

        {/* Add / Edit form */}
        {showForm ? (
          <CommandForm
            initialName={editingName ?? ''}
            initialCommand={editingName ? commands[editingName] : undefined}
            providers={providers}
            onSave={handleSave}
            onCancel={() => {
              setShowForm(false);
              setEditingName(null);
            }}
          />
        ) : (
          <button
            className="btn btn--primary"
            onClick={() => {
              setEditingName(null);
              setShowForm(true);
            }}
          >
            + Add Command
          </button>
        )}
      </SettingGroup>
    </>
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
        <span className="command-card__name">/{name}</span>
        {command.agent && (
          <span className="command-card__badge">{command.agent}</span>
        )}
        {command.subtask && (
          <span className="command-card__badge">subtask</span>
        )}
        <div className="command-card__actions">
          <button className="mcp-card__action-btn" onClick={onEdit} title="Edit">
            &#9998;
          </button>
          {confirmDelete ? (
            <>
              <button
                className="mcp-card__action-btn mcp-card__action-btn--danger"
                onClick={onDelete}
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
  const [agent, setAgent] = useState(initialCommand?.agent ?? '');
  const [model, setModel] = useState(initialCommand?.model ?? '');
  const [subtask, setSubtask] = useState(initialCommand?.subtask ?? false);

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
        <div className="mcp-form__row">
          <label className="mcp-form__label">Name</label>
          <input
            className="setting-text-input setting-text-input--mono"
            placeholder="my-command"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={!!initialName}
          />
        </div>

        <div className="mcp-form__row">
          <label className="mcp-form__label">Template</label>
          <textarea
            className="command-form__textarea"
            placeholder="Write the prompt template here. Use {{input}} for user input."
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
          />
        </div>

        <div className="mcp-form__row">
          <label className="mcp-form__label">Description</label>
          <input
            className="setting-text-input"
            placeholder="Optional description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div className="mcp-form__row">
          <label className="mcp-form__label">Agent</label>
          <div className="setting-dropdown" style={{ maxWidth: 300 }}>
            <select
              className="setting-dropdown__select"
              value={agent}
              onChange={(e) => setAgent(e.target.value)}
            >
              <option value="">Default</option>
              <option value="code">Code</option>
              <option value="task">Task</option>
            </select>
            <span className="setting-dropdown__arrow">&#9662;</span>
          </div>
        </div>

        <div className="mcp-form__row">
          <label className="mcp-form__label">Model</label>
          <div className="setting-dropdown" style={{ maxWidth: 400 }}>
            <select
              className="setting-dropdown__select"
              value={model}
              onChange={(e) => setModel(e.target.value)}
            >
              <option value="">Default</option>
              {providers.map((p) =>
                p.models.map((m) => (
                  <option key={`${p.id}/${m.id}`} value={`${p.id}/${m.id}`}>
                    {p.name} / {m.name}
                  </option>
                )),
              )}
            </select>
            <span className="setting-dropdown__arrow">&#9662;</span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12 }}>
            <input
              type="checkbox"
              checked={subtask}
              onChange={(e) => setSubtask(e.target.checked)}
              style={{ accentColor: 'var(--vscode-focusBorder)' }}
            />
            Run as subtask
          </label>
        </div>

        <div className="command-form__actions">
          <button
            className="btn btn--primary"
            onClick={handleSubmit}
            disabled={!isValid}
          >
            {initialCommand ? 'Save Changes' : 'Add Command'}
          </button>
          <button className="btn btn--secondary" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
