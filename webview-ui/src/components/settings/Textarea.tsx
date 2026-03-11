/**
 * Textarea control styled for the settings surface.
 */

import React, { useCallback } from 'react';
import { Field } from './Field';

interface TextareaProps {
  label: string;
  description?: string;
  value: string;
  placeholder?: string;
  rows?: number;
  mono?: boolean;
  disabled?: boolean;
  onChange: (value: string) => void;
}

export function Textarea({
  label,
  description,
  value,
  placeholder,
  rows = 5,
  mono,
  disabled,
  onChange,
}: TextareaProps) {
  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      onChange(event.target.value);
    },
    [onChange],
  );

  return (
    <Field label={label} description={description}>
      <div className="setting-textarea-shell">
        <textarea
          className={`setting-textarea${mono ? ' setting-textarea--mono' : ''}`}
          value={value}
          placeholder={placeholder}
          rows={rows}
          disabled={disabled}
          onChange={handleChange}
        />
      </div>
    </Field>
  );
}
