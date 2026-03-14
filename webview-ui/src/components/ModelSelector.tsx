/**
 * ModelSelector - Compact inline model + variant selector
 *
 * Shows current model as clickable text. On click, transforms into a
 * filtered dropdown for model switching. Variant badges cycle on click.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useModelStore, type ResolvedModel } from '../stores/modelStore';
import { postMessage } from '../utils/vscodeApi';

/** Abbreviate provider name to 2-3 chars */
function providerAbbr(name: string): string {
  if (name.length <= 3) return name.toUpperCase();
  // Use first letters of words, or first 2 chars
  const words = name.split(/[\s-_]+/);
  if (words.length >= 2) {
    return words
      .slice(0, 2)
      .map((w) => w[0])
      .join('')
      .toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

export function ModelSelector() {
  const config = useModelStore((s) => s.config);
  const selectedVariant = useModelStore((s) => s.selectedVariant);
  const setSelectedVariant = useModelStore((s) => s.setSelectedVariant);
  const getCurrentModel = useModelStore((s) => s.getCurrentModel);
  const getAvailableModels = useModelStore((s) => s.getAvailableModels);

  const [isOpen, setIsOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const [highlightIndex, setHighlightIndex] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const currentModel = getCurrentModel();
  const availableModels = getAvailableModels();

  const filteredModels = useMemo(() => {
    if (!filter.trim()) return availableModels;
    const lower = filter.toLowerCase();
    return availableModels.filter(
      (m) =>
        m.modelName.toLowerCase().includes(lower) ||
        m.modelID.toLowerCase().includes(lower) ||
        m.providerName.toLowerCase().includes(lower) ||
        m.providerID.toLowerCase().includes(lower),
    );
  }, [availableModels, filter]);

  // Variant list for current model
  const variants = useMemo(() => {
    if (!currentModel?.model.variants) return [];
    return Object.keys(currentModel.model.variants);
  }, [currentModel]);

  // Clamp highlight index when filtered list changes
  useEffect(() => {
    setHighlightIndex((prev) => Math.min(prev, Math.max(0, filteredModels.length - 1)));
  }, [filteredModels.length]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (!isOpen || !dropdownRef.current) return;
    const item = dropdownRef.current.children[highlightIndex] as HTMLElement | undefined;
    item?.scrollIntoView({ block: 'nearest' });
  }, [highlightIndex, isOpen]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen]);

  const openDropdown = useCallback(() => {
    setIsOpen(true);
    setFilter('');
    setHighlightIndex(0);
    // Focus input after render
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  const selectModel = useCallback(
    (model: ResolvedModel) => {
      postMessage({
        type: 'model:select',
        data: { providerID: model.providerID, modelID: model.modelID },
      });
      setIsOpen(false);
      setSelectedVariant(undefined);
    },
    [setSelectedVariant],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setHighlightIndex((prev) => Math.min(prev + 1, filteredModels.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setHighlightIndex((prev) => Math.max(prev - 1, 0));
          break;
        case 'Tab':
        case 'Enter':
          e.preventDefault();
          if (filteredModels[highlightIndex]) {
            selectModel(filteredModels[highlightIndex]);
          }
          break;
        case 'Escape':
          e.preventDefault();
          setIsOpen(false);
          break;
      }
    },
    [filteredModels, highlightIndex, selectModel],
  );

  const cycleVariant = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (variants.length === 0) return;
      const currentIdx = selectedVariant ? variants.indexOf(selectedVariant) : -1;
      const nextIdx = (currentIdx + 1) % variants.length;
      setSelectedVariant(variants[nextIdx]);
    },
    [variants, selectedVariant, setSelectedVariant],
  );

  // Don't render if no config
  if (!config) return null;

  const displayName = currentModel
    ? `${currentModel.providerName} / ${currentModel.modelName}`
    : config.model ?? 'No model';

  const abbr = currentModel ? providerAbbr(currentModel.providerName) : '??';

  return (
    <div className="model-selector" ref={containerRef}>
      {isOpen ? (
        <div className="model-selector__input-wrapper" onKeyDown={handleKeyDown}>
          <input
            ref={inputRef}
            className="model-selector__input"
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search models..."
            spellCheck={false}
            autoComplete="off"
          />
          {filteredModels.length > 0 && (
            <div className="model-selector__dropdown" ref={dropdownRef}>
              {filteredModels.map((m, i) => {
                const isActive =
                  currentModel &&
                  m.providerID === currentModel.providerID &&
                  m.modelID === currentModel.modelID;
                return (
                  <div
                    key={`${m.providerID}/${m.modelID}`}
                    className={
                      'model-selector__option' +
                      (i === highlightIndex ? ' model-selector__option--highlighted' : '') +
                      (isActive ? ' model-selector__option--active' : '')
                    }
                    onMouseEnter={() => setHighlightIndex(i)}
                    onMouseDown={(e) => {
                      e.preventDefault(); // keep input focused
                      selectModel(m);
                    }}
                  >
                    <span className="model-selector__option-abbr">
                      {providerAbbr(m.providerName)}
                    </span>
                    <span className="model-selector__option-text">
                      <span className="model-selector__option-provider">{m.providerName}</span>
                      <span className="model-selector__option-sep">/</span>
                      <span className="model-selector__option-model">{m.modelName}</span>
                    </span>
                    {isActive && (
                      <span className="model-selector__option-check">✓</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {filteredModels.length === 0 && filter.trim() && (
            <div className="model-selector__dropdown">
              <div className="model-selector__empty">No matching models</div>
            </div>
          )}
        </div>
      ) : (
        <button
          className="model-selector__display"
          onClick={openDropdown}
          type="button"
          title="Click to change model"
        >
          <span className="model-selector__abbr">{abbr}</span>
          <span className="model-selector__name">{displayName}</span>
          {variants.length > 0 && (
            <span
              className="model-selector__variant"
              onClick={cycleVariant}
              title={`Variant: ${selectedVariant ?? 'default'} (click to cycle)`}
            >
              {selectedVariant ?? variants[0]}
            </span>
          )}
          <svg className="model-selector__chevron" width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
            <path d="M4.5 5.5l3.5 3.5 3.5-3.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}
    </div>
  );
}
