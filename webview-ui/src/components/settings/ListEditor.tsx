/**
 * Dynamic list editor (for external directories, command arrays, etc.).
 */

import React, { useCallback } from 'react';

interface ListEditorProps {
  label: string;
  description?: string;
  items: string[];
  placeholder?: string;
  onChange: (items: string[]) => void;
}

export function ListEditor({
  label,
  description,
  items,
  placeholder = 'Enter value',
  onChange,
}: ListEditorProps) {
  const handleChange = useCallback(
    (index: number, value: string) => {
      const updated = [...items];
      updated[index] = value;
      onChange(updated);
    },
    [items, onChange],
  );

  const handleRemove = useCallback(
    (index: number) => {
      onChange(items.filter((_, i) => i !== index));
    },
    [items, onChange],
  );

  const handleAdd = useCallback(() => {
    onChange([...items, '']);
  }, [items, onChange]);

  return (
    <div className="setting-row">
      <label className="setting-row__label">{label}</label>
      {description && (
        <span className="setting-row__description">{description}</span>
      )}
      <div className="setting-row__control">
        <div className="list-editor">
          {items.map((item, i) => (
            <div key={i} className="list-editor__row">
              <input
                className="list-editor__input"
                placeholder={placeholder}
                value={item}
                onChange={(e) => handleChange(i, e.target.value)}
              />
              <button
                className="list-editor__remove-btn"
                onClick={() => handleRemove(i)}
                title="Remove"
              >
                ×
              </button>
            </div>
          ))}
          <button className="list-editor__add-btn" onClick={handleAdd}>
            + Add item
          </button>
        </div>
      </div>
    </div>
  );
}
