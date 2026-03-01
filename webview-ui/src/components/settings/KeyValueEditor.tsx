/**
 * Dynamic key-value pair editor (for environment variables, headers, etc.).
 */

import React, { useCallback } from 'react';

interface KeyValueEditorProps {
  label: string;
  description?: string;
  pairs: Array<{ key: string; value: string }>;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
  onChange: (pairs: Array<{ key: string; value: string }>) => void;
}

export function KeyValueEditor({
  label,
  description,
  pairs,
  keyPlaceholder = 'Key',
  valuePlaceholder = 'Value',
  onChange,
}: KeyValueEditorProps) {
  const handleKeyChange = useCallback(
    (index: number, key: string) => {
      const updated = [...pairs];
      updated[index] = { ...updated[index], key };
      onChange(updated);
    },
    [pairs, onChange],
  );

  const handleValueChange = useCallback(
    (index: number, value: string) => {
      const updated = [...pairs];
      updated[index] = { ...updated[index], value };
      onChange(updated);
    },
    [pairs, onChange],
  );

  const handleRemove = useCallback(
    (index: number) => {
      onChange(pairs.filter((_, i) => i !== index));
    },
    [pairs, onChange],
  );

  const handleAdd = useCallback(() => {
    onChange([...pairs, { key: '', value: '' }]);
  }, [pairs, onChange]);

  return (
    <div className="setting-row">
      <label className="setting-row__label">{label}</label>
      {description && (
        <span className="setting-row__description">{description}</span>
      )}
      <div className="setting-row__control">
        <div className="kv-editor">
          {pairs.map((pair, i) => (
            <div key={i} className="kv-editor__row">
              <input
                className="kv-editor__key"
                placeholder={keyPlaceholder}
                value={pair.key}
                onChange={(e) => handleKeyChange(i, e.target.value)}
              />
              <input
                className="kv-editor__value"
                placeholder={valuePlaceholder}
                value={pair.value}
                onChange={(e) => handleValueChange(i, e.target.value)}
              />
              <button
                className="kv-editor__remove-btn"
                onClick={() => handleRemove(i)}
                title="Remove"
              >
                ×
              </button>
            </div>
          ))}
          <button className="kv-editor__add-btn" onClick={handleAdd}>
            + Add entry
          </button>
        </div>
      </div>
    </div>
  );
}
