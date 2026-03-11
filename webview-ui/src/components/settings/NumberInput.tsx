/**
 * Number input with an optional slider.
 */

import React, { useCallback } from 'react';
import { Field } from './Field';

interface NumberInputProps {
  label: string;
  description?: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  showSlider?: boolean;
  onChange: (value: number) => void;
}

export function NumberInput({
  label,
  description,
  value,
  min,
  max,
  step = 1,
  showSlider,
  onChange,
}: NumberInputProps) {
  const handleFieldChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const n = Number(e.target.value);
      if (!isNaN(n)) {
        onChange(n);
      }
    },
    [onChange],
  );

  const handleSliderChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(Number(e.target.value));
    },
    [onChange],
  );

  return (
    <Field label={label} description={description}>
      <div className="setting-number-input">
        <div className="setting-number-input__field-row">
          <input
            type="number"
            className="setting-number-input__field"
            value={value}
            min={min}
            max={max}
            step={step}
            onChange={handleFieldChange}
          />
          {showSlider && (
            <span className="setting-number-input__value">{value}</span>
          )}
        </div>

        {showSlider && min !== undefined && max !== undefined && (
          <div className="setting-number-input__slider-shell">
            <span className="setting-number-input__range-label">{min}</span>
              <input
                type="range"
                className="setting-number-input__slider"
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={handleSliderChange}
              />
            <span className="setting-number-input__range-label">{max}</span>
          </div>
        )}
      </div>
    </Field>
  );
}
