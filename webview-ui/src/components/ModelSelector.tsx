/**
 * ModelSelector - Compact inline model + variant selector with grouped dropdown
 *
 * Shows current model as clickable text. On click, transforms into a
 * filtered dropdown for model switching with grouped sections (favorites,
 * recent, by provider). Variant badges cycle on click.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useModelStore, type ResolvedModel } from '../stores/modelStore';
import { postMessage } from '../utils/vscodeApi';
import {
  groupModels,
  isFavoriteModel,
  formatContextLimit,
  isModelFree,
  getCapabilityTags,
  type ModelGroup,
} from '../utils/modelUtils';
import { getConfiguredModel } from '../utils/opencodeConfig';

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
  const modelPrefs = useModelStore((s) => s.modelPrefs);

  const [isOpen, setIsOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const [highlightIndex, setHighlightIndex] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const currentModel = getCurrentModel();
  const availableModels = getAvailableModels();
  const configuredModel = getConfiguredModel(config);
  const currentModelKey = currentModel ? `${currentModel.providerID}/${currentModel.modelID}` : null;

  // Grouped models (when no filter) or filtered flat list
  const { groups, flatItems } = useMemo(() => {
    if (filter.trim()) {
      // Filtered mode: flat list, no groups
      const lower = filter.toLowerCase();
      const filtered = availableModels.filter(
        (m) =>
          m.modelName.toLowerCase().includes(lower) ||
          m.modelID.toLowerCase().includes(lower) ||
          m.providerName.toLowerCase().includes(lower) ||
          m.providerID.toLowerCase().includes(lower),
      );
      return { groups: null, flatItems: filtered };
    }
    // Grouped mode
    const grouped = groupModels(availableModels, currentModel, modelPrefs);
    const flat: ResolvedModel[] = [];
    for (const group of grouped) {
      for (const model of group.models) {
        flat.push(model);
      }
    }
    return { groups: grouped, flatItems: flat };
  }, [availableModels, currentModel, filter, modelPrefs]);

  // Variant list for current model
  const variants = useMemo(() => {
    if (!currentModel?.model.variants) return [];
    return Object.keys(currentModel.model.variants);
  }, [currentModel]);

  // Restore persisted variant when model or prefs change
  useEffect(() => {
    if (!currentModelKey || !modelPrefs) return;
    const saved = modelPrefs.variant?.[currentModelKey];
    if (saved && variants.includes(saved)) {
      setSelectedVariant(saved);
    }
  }, [currentModelKey, modelPrefs, variants, setSelectedVariant]);

  // Clamp highlight index when list changes
  useEffect(() => {
    setHighlightIndex((prev) => Math.min(prev, Math.max(0, flatItems.length - 1)));
  }, [flatItems.length]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (!isOpen || !dropdownRef.current) return;
    const el = dropdownRef.current.querySelector(
      `[data-flat-index="${highlightIndex}"]`,
    ) as HTMLElement | null;
    el?.scrollIntoView({ block: 'nearest' });
  }, [highlightIndex, isOpen]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setFilter('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen]);

  const openDropdown = useCallback(() => {
    setIsOpen(true);
    setFilter('');
    setHighlightIndex(0);
    // Focus input and scroll to current model after render
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      if (dropdownRef.current) {
        const active = dropdownRef.current.querySelector(
          '.model-selector__option--active',
        ) as HTMLElement | null;
        active?.scrollIntoView({ block: 'nearest' });
      }
    });
  }, []);

  const selectModel = useCallback(
    (model: ResolvedModel) => {
      postMessage({ type: 'model-prefs:add-recent', data: { providerID: model.providerID, modelID: model.modelID } });
      postMessage({
        type: 'model:select',
        data: { providerID: model.providerID, modelID: model.modelID },
      });
      setIsOpen(false);
      setFilter('');
      setSelectedVariant(undefined);
    },
    [setSelectedVariant],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setHighlightIndex((prev) => Math.min(prev + 1, flatItems.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setHighlightIndex((prev) => Math.max(prev - 1, 0));
          break;
        case 'Tab':
        case 'Enter':
          e.preventDefault();
          if (flatItems[highlightIndex]) {
            selectModel(flatItems[highlightIndex]);
          }
          break;
        case 'Escape':
          e.preventDefault();
          setIsOpen(false);
          setFilter('');
          break;
      }
    },
    [flatItems, highlightIndex, selectModel],
  );

  const cycleVariant = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (variants.length === 0 || !currentModel) return;
      const currentIdx = selectedVariant ? variants.indexOf(selectedVariant) : -1;
      const nextIdx = (currentIdx + 1) % variants.length;
      const nextVariant = variants[nextIdx];
      setSelectedVariant(nextVariant);
      postMessage({
        type: 'model-prefs:set-variant',
        data: {
          key: `${currentModel.providerID}/${currentModel.modelID}`,
          variant: nextVariant,
        },
      });
    },
    [variants, selectedVariant, setSelectedVariant, currentModel],
  );

  // Don't render if no config
  if (!config) return null;

  const displayName = currentModel
    ? `${currentModel.providerName} / ${currentModel.modelName}`
    : configuredModel ?? 'Auto';

  const fallbackProvider = configuredModel?.split('/')[0] ?? 'AI';
  const abbr = currentModel
    ? providerAbbr(currentModel.providerName)
    : providerAbbr(fallbackProvider);

  /** Render a single model option row */
  const renderOption = (m: ResolvedModel, flatIndex: number) => {
    const isActive =
      currentModel &&
      m.providerID === currentModel.providerID &&
      m.modelID === currentModel.modelID;
    const capTags = getCapabilityTags(m.model);
    const ctxLimit = formatContextLimit(m.model.limit);
    const free = isModelFree(m.model, m.providerID);
    const isFav = isFavoriteModel(modelPrefs, m.providerID, m.modelID);

    return (
      <div
        key={`${m.providerID}/${m.modelID}`}
        data-flat-index={flatIndex}
        className={
          'model-selector__option' +
          (flatIndex === highlightIndex ? ' model-selector__option--highlighted' : '') +
          (isActive ? ' model-selector__option--active' : '')
        }
        onMouseEnter={() => setHighlightIndex(flatIndex)}
        onMouseDown={(e: React.MouseEvent) => {
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
        <span className="model-selector__option-meta">
          {capTags.map((tag) => (
            <span key={tag} className="model-selector__cap-tag">
              {tag}
            </span>
          ))}
          {ctxLimit && <span className="model-selector__ctx">{ctxLimit}</span>}
          {free && <span className="model-selector__free">Free</span>}
          <button
            className={`model-selector__fav ${isFav ? 'model-selector__fav--active' : ''}`}
            onClick={(e: React.MouseEvent) => {
              e.preventDefault();
              e.stopPropagation();
              postMessage({ type: 'model-prefs:toggle-favorite', data: { providerID: m.providerID, modelID: m.modelID } });
            }}
            title="Toggle favorite"
            type="button"
          >
            {isFav ? '\u2605' : '\u2606'}
          </button>
        </span>
        {isActive && <span className="model-selector__option-check">{'\u2713'}</span>}
      </div>
    );
  };

  /** Render grouped dropdown content */
  const renderGrouped = (groupList: ModelGroup[]) => {
    let flatIndex = 0;
    return groupList.map((group) => (
      <React.Fragment key={`group-${group.type}-${group.label}`}>
        <div className="model-selector__group-header">
          <span className="model-selector__group-label">{group.label}</span>
        </div>
        {group.models.map((m) => {
          const idx = flatIndex;
          flatIndex += 1;
          return renderOption(m, idx);
        })}
      </React.Fragment>
    ));
  };

  /** Render flat filtered dropdown content */
  const renderFlat = (models: ResolvedModel[]) =>
    models.map((m, i) => renderOption(m, i));

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
          {flatItems.length > 0 && (
            <div className="model-selector__dropdown" ref={dropdownRef}>
              {groups ? renderGrouped(groups) : renderFlat(flatItems)}
            </div>
          )}
          {flatItems.length === 0 && filter.trim() && (
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
          <svg
            className="model-selector__chevron"
            width="10"
            height="10"
            viewBox="0 0 16 16"
            fill="currentColor"
          >
            <path
              d="M4.5 5.5l3.5 3.5 3.5-3.5"
              stroke="currentColor"
              strokeWidth="1.5"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      )}
    </div>
  );
}
