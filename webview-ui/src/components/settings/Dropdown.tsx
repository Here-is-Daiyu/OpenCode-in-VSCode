/**
 * Dropdown select with options.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Field } from './Field';

export interface DropdownOption {
  value: string;
  label: string;
  disabled?: boolean;
  group?: string;
}

interface DropdownProps {
  label: string;
  description?: string;
  value: string;
  options: DropdownOption[];
  placeholder?: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}

export function Dropdown({
  label,
  description,
  value,
  options,
  placeholder,
  disabled,
  onChange,
}: DropdownProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleSelect = useCallback(
    (nextValue: string) => {
      onChange(nextValue);
      setOpen(false);
    },
    [onChange],
  );

  // Group options if any have a group property
  const { groups, ungrouped } = useMemo(() => {
    const grouped = new Map<string, DropdownOption[]>();
    const standalone: DropdownOption[] = [];

    for (const option of options) {
      if (option.group) {
        const list = grouped.get(option.group) ?? [];
        list.push(option);
        grouped.set(option.group, list);
      } else {
        standalone.push(option);
      }
    }

    return { groups: grouped, ungrouped: standalone };
  }, [options]);

  const selectedOption = useMemo(
    () => options.find((option) => option.value === value),
    [options, value],
  );

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  const handleTriggerKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (disabled) {
        return;
      }

      if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown') {
        event.preventDefault();
        setOpen(true);
      }

      if (event.key === 'Escape') {
        setOpen(false);
      }
    },
    [disabled],
  );

  return (
    <Field label={label} description={description}>
      <div className="setting-select" ref={containerRef}>
        <button
          type="button"
          className={`setting-select__trigger${open ? ' setting-select__trigger--open' : ''}`}
          aria-haspopup="listbox"
          aria-expanded={open}
          disabled={disabled}
          onClick={() => setOpen((current) => !current)}
          onKeyDown={handleTriggerKeyDown}
        >
          <span className="setting-select__value">
            <span className="setting-select__text">
              {selectedOption?.label ?? placeholder ?? 'Select an option'}
            </span>
          </span>
          <span className="setting-select__chevron">⌄</span>
        </button>

        {open && (
          <div className="setting-select__menu" role="listbox">
            {ungrouped.map((option) => {
              const selected = option.value === value;

              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  disabled={option.disabled}
                  className={[
                    'setting-select__option',
                    selected && 'setting-select__option--selected',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => handleSelect(option.value)}
                >
                  <span className="setting-select__option-label">{option.label}</span>
                  {selected && <span className="setting-select__option-check">✓</span>}
                </button>
              );
            })}

            {Array.from(groups.entries()).map(([group, opts]) => (
              <div key={group} className="setting-select__group">
                <div className="setting-select__group-label">{group}</div>
                {opts.map((option) => {
                  const selected = option.value === value;

                  return (
                    <button
                      key={option.value}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      disabled={option.disabled}
                      className={[
                        'setting-select__option',
                        selected && 'setting-select__option--selected',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      onClick={() => handleSelect(option.value)}
                    >
                      <span className="setting-select__option-label">{option.label}</span>
                      {selected && (
                        <span className="setting-select__option-check">✓</span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>
    </Field>
  );
}
