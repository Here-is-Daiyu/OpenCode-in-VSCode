/**
 * Permissions settings tab.
 *
 * Shows a table of permission rules (read, edit, bash, glob, grep, etc.)
 * with allow/ask/deny dropdowns.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { SettingGroup } from '../../../components/settings/SettingGroup';
import { ListEditor } from '../../../components/settings/ListEditor';
import type { OpenCodeConfig, PermissionRuleset, PermissionValue } from '../../../types/opencode';

/** Well-known permission keys. */
const KNOWN_PERMISSIONS = [
  { key: 'read', label: 'Read files', description: 'Read file contents' },
  { key: 'edit', label: 'Edit files', description: 'Create or modify files' },
  { key: 'bash', label: 'Run commands', description: 'Execute shell commands' },
  { key: 'glob', label: 'Glob search', description: 'Search for files by pattern' },
  { key: 'grep', label: 'Grep search', description: 'Search file contents' },
  { key: 'fetch', label: 'Fetch URLs', description: 'Make HTTP requests' },
  { key: 'mcp', label: 'MCP tools', description: 'Use MCP server tools' },
];

interface PermissionsTabProps {
  config: OpenCodeConfig;
  onUpdateConfig: (partial: Record<string, unknown>) => void;
}

export function PermissionsTab({ config, onUpdateConfig }: PermissionsTabProps) {
  const permission = config.permission ?? {};

  const handlePermissionChange = useCallback(
    (key: string, value: PermissionValue) => {
      const updated = { ...permission, [key]: value };
      onUpdateConfig({ permission: updated });
    },
    [permission, onUpdateConfig],
  );

  // Bash sub-permissions (patterns)
  const bashPerms = useMemo(() => {
    const bash = permission['bash'];
    if (typeof bash === 'object' && bash !== null) {
      return bash as Record<string, PermissionValue>;
    }
    return {};
  }, [permission]);

  const [bashPatterns, setBashPatterns] = useState<Array<{ pattern: string; value: PermissionValue }>>(
    () =>
      Object.entries(bashPerms).map(([pattern, value]) => ({
        pattern,
        value: value as PermissionValue,
      })),
  );

  const handleBashPatternChange = useCallback(
    (index: number, field: 'pattern' | 'value', newValue: string) => {
      const updated = [...bashPatterns];
      if (field === 'pattern') {
        updated[index] = { ...updated[index], pattern: newValue };
      } else {
        updated[index] = { ...updated[index], value: newValue as PermissionValue };
      }
      setBashPatterns(updated);

      // Build the bash permissions object
      const bashObj: Record<string, PermissionValue> = {};
      for (const bp of updated) {
        if (bp.pattern.trim()) {
          bashObj[bp.pattern.trim()] = bp.value;
        }
      }
      const updatedPerms = { ...permission, bash: bashObj };
      onUpdateConfig({ permission: updatedPerms });
    },
    [bashPatterns, permission, onUpdateConfig],
  );

  const addBashPattern = useCallback(() => {
    setBashPatterns((prev) => [...prev, { pattern: '', value: 'ask' }]);
  }, []);

  const removeBashPattern = useCallback(
    (index: number) => {
      const updated = bashPatterns.filter((_, i) => i !== index);
      setBashPatterns(updated);

      const bashObj: Record<string, PermissionValue> = {};
      for (const bp of updated) {
        if (bp.pattern.trim()) {
          bashObj[bp.pattern.trim()] = bp.value;
        }
      }
      const updatedPerms = { ...permission, bash: bashObj };
      onUpdateConfig({ permission: updatedPerms });
    },
    [bashPatterns, permission, onUpdateConfig],
  );

  return (
    <>
      {/* Basic Permissions */}
      <SettingGroup
        title="Permission Rules"
        description="Control what actions the AI agent can perform. 'Allow' grants permission automatically, 'Ask' prompts you each time, and 'Deny' blocks the action."
      >
        <table className="permission-table">
          <thead>
            <tr>
              <th>Permission</th>
              <th>Level</th>
            </tr>
          </thead>
          <tbody>
            {KNOWN_PERMISSIONS.map(({ key, label, description }) => {
              const value = permission[key];
              const currentValue =
                typeof value === 'string'
                  ? (value as PermissionValue)
                  : 'ask';

              // Skip bash if it has sub-patterns (handled below)
              if (key === 'bash' && typeof permission['bash'] === 'object') {
                return null;
              }

              return (
                <tr key={key}>
                  <td title={description}>{label}</td>
                  <td>
                    <select
                      value={currentValue}
                      onChange={(e) =>
                        handlePermissionChange(key, e.target.value as PermissionValue)
                      }
                    >
                      <option value="allow">Allow</option>
                      <option value="ask">Ask</option>
                      <option value="deny">Deny</option>
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </SettingGroup>

      {/* Bash Pattern Permissions */}
      <SettingGroup
        title="Bash Command Patterns"
        description="Fine-grained permissions for shell commands. Use glob patterns to match specific commands (e.g. 'git *' to allow all git commands)."
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 500 }}>
          {bashPatterns.map((bp, i) => (
            <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input
                className="setting-text-input setting-text-input--mono"
                style={{ flex: 1, maxWidth: 'none' }}
                placeholder="Pattern (e.g. git *)"
                value={bp.pattern}
                onChange={(e) => handleBashPatternChange(i, 'pattern', e.target.value)}
              />
              <select
                style={{
                  padding: '4px 6px',
                  background: 'var(--vscode-input-background)',
                  color: 'var(--vscode-input-foreground)',
                  border: '1px solid var(--vscode-input-border)',
                  borderRadius: 3,
                  fontSize: 11,
                }}
                value={bp.value}
                onChange={(e) => handleBashPatternChange(i, 'value', e.target.value)}
              >
                <option value="allow">Allow</option>
                <option value="ask">Ask</option>
                <option value="deny">Deny</option>
              </select>
              <button
                className="kv-editor__remove-btn"
                onClick={() => removeBashPattern(i)}
                title="Remove"
              >
                ×
              </button>
            </div>
          ))}
          <button className="kv-editor__add-btn" onClick={addBashPattern}>
            + Add bash pattern
          </button>
        </div>
      </SettingGroup>
    </>
  );
}
