/**
 * Dynamic list editor (for external directories, command arrays, etc.).
 */

import React, { useCallback } from 'react';
import { Field } from './Field';

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
    <Field label={label} description={description}>
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
                type="button"
                onClick={() => handleRemove(i)}
                title="Remove"
              >
                ×
              </button>
            </div>
          ))}
          <button className="list-editor__add-btn" type="button" onClick={handleAdd}>
            + Add item
          </button>
        </div>
    </Field>
  );
}
