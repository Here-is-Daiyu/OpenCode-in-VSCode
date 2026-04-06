/**
 * Number input with an optional slider.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  const inputRef = useRef<HTMLInputElement>(null);
  const [displayValue, setDisplayValue] = useState(String(value));

  const clampValue = useCallback(
    (n: number) => Math.min(Math.max(n, min ?? -Infinity), max ?? Infinity),
    [max, min],
  );

  useEffect(() => {
    if (document.activeElement !== inputRef.current) {
      setDisplayValue(String(value));
    }
  }, [value]);

  const handleFieldChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      setDisplayValue(raw);

      if (raw === '' || raw === '-') return;

      const n = Number(raw);
      if (Number.isNaN(n)) return;

      onChange(clampValue(n));
    },
    [clampValue, onChange],
  );

  const handleBlur = useCallback(() => {
    if (displayValue.trim() === '' || displayValue === '-') {
      const fallback = min !== undefined ? min : 0;
      setDisplayValue(String(fallback));
      if (fallback !== value) {
        onChange(fallback);
      }
      return;
    }

    const n = Number(displayValue);
    if (Number.isNaN(n)) {
      const fallback = min !== undefined ? min : 0;
      setDisplayValue(String(fallback));
      if (fallback !== value) {
        onChange(fallback);
      }
      return;
    }

    const clamped = clampValue(n);
    setDisplayValue(String(clamped));
    if (clamped !== value) {
      onChange(clamped);
    }
  }, [clampValue, displayValue, min, onChange, value]);

  const handleSliderChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(Number(e.target.value));
    },
    [onChange],
  );

  const sliderProgress = useMemo(() => {
    if (min === undefined || max === undefined || max === min) return 0;
    return ((value - min) / (max - min)) * 100;
  }, [value, min, max]);

  return (
    <Field label={label} description={description}>
      <div className="setting-number-input">
        <div className="setting-number-input__field-row">
          <input
            ref={inputRef}
            type="number"
            className="setting-number-input__field"
            value={displayValue}
            min={min}
            max={max}
            step={step}
            onChange={handleFieldChange}
            onBlur={handleBlur}
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
                style={{
                  background: `linear-gradient(to right, var(--border-selected) ${sliderProgress}%, color-mix(in srgb, var(--text-weaker) 28%, transparent) ${sliderProgress}%)`,
                }}
              />
            <span className="setting-number-input__range-label">{max}</span>
          </div>
        )}
      </div>
    </Field>
  );
}
