/**
 * Custom Commands section of the Integrations tab.
 *
 * Contains the command list, individual command cards, and the add/edit command form.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { Dropdown, type DropdownOption } from '../../../../components/settings/Dropdown';
import { Field } from '../../../../components/settings/Field';
import { SegmentedControl } from '../../../../components/settings/SegmentedControl';
import { SettingGroup } from '../../../../components/settings/SettingGroup';
import { TextInput } from '../../../../components/settings/TextInput';
import { Textarea } from '../../../../components/settings/Textarea';
import { Toggle } from '../../../../components/settings/Toggle';
import type { CustomCommand, Provider } from '../../../../types/opencode';

// ---------------------------------------------------------------------------
//  Props
// ---------------------------------------------------------------------------

export interface CommandsSectionProps {
  commands: Record<string, CustomCommand>;
  providers: Provider[];
  onUpdateConfig: (partial: Record<string, unknown>) => void;
}

// ---------------------------------------------------------------------------
//  Commands Section
// ---------------------------------------------------------------------------

export function CommandsSection({
  commands,
  providers,
  onUpdateConfig,
}: CommandsSectionProps) {
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

  return (
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
