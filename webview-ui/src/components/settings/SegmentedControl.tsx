/**
 * Segmented control for compact option sets.
 */

import React from 'react';

export interface SegmentedControlOption<Value extends string = string> {
  value: Value;
  label: string;
  disabled?: boolean;
}

interface SegmentedControlProps<Value extends string = string> {
  value: Value;
  options: ReadonlyArray<SegmentedControlOption<Value>>;
  onChange: (value: Value) => void;
  size?: 'default' | 'compact';
}

export function SegmentedControl<Value extends string = string>({
  value,
  options,
  onChange,
  size = 'default',
}: SegmentedControlProps<Value>) {
  return (
    <div className={`segmented-control segmented-control--${size}`} role="radiogroup">
      {options.map((option) => {
        const selected = option.value === value;

        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={option.disabled}
            className={[
              'segmented-control__option',
              selected && 'segmented-control__option--selected',
            ]
              .filter(Boolean)
              .join(' ')}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
