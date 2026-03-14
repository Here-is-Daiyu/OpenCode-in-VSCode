/**
 * Model utility functions for the ModelSelector component.
 *
 * Pure functions that operate on preferences data passed as parameters.
 * Preferences are stored on disk (model.json) by the extension host,
 * shared with the official OpenCode TUI.
 */

import type { ResolvedModel } from '../stores/modelStore';
import type { ProviderModel } from '../types/opencode';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Lightweight reference to a specific provider + model combination. */
export interface ModelRef {
  providerID: string;
  modelID: string;
}

/** A labelled group of models shown in the selector dropdown. */
export interface ModelGroup {
  type: 'favorites' | 'recent' | 'provider';
  label: string;
  models: ResolvedModel[];
}

/** Model preferences from file. */
export interface ModelPrefs {
  recent: ModelRef[];
  favorite: ModelRef[];
  variant: Record<string, string | undefined>;
}

// ---------------------------------------------------------------------------
// Model matching
// ---------------------------------------------------------------------------

/**
 * Returns `true` when `model` matches the given lightweight `ref`.
 */
export function modelMatchesRef(model: ResolvedModel, ref: ModelRef): boolean {
  return model.providerID === ref.providerID && model.modelID === ref.modelID;
}

// ---------------------------------------------------------------------------
// Favorite check (pure)
// ---------------------------------------------------------------------------

/**
 * Check whether a model is currently marked as a favorite.
 */
export function isFavoriteModel(prefs: ModelPrefs, providerID: string, modelID: string): boolean {
  return prefs.favorite.some((r) => r.providerID === providerID && r.modelID === modelID);
}

// ---------------------------------------------------------------------------
// Provider grouping
// ---------------------------------------------------------------------------

/**
 * Group a flat list of available models into display sections.
 *
 * Sections produced (in order):
 * 1. **Favorites** — models the user has explicitly starred.
 * 2. **Recent** — recently-used models that are *not* already in Favorites.
 * 3. **Provider groups** — remaining models grouped by provider, with the
 *    `opencode` provider listed first and the rest sorted alphabetically.
 *
 * Models that appear in Favorites or Recent are **not** repeated in
 * provider groups.
 */
export function groupModels(
  models: ResolvedModel[],
  _currentModel: ResolvedModel | null,
  prefs: ModelPrefs,
): ModelGroup[] {
  const seen = new Set<string>();
  const makeKey = (m: ResolvedModel) => `${m.providerID}\0${m.modelID}`;

  // --- Favorites ---
  const favoriteModels: ResolvedModel[] = [];
  for (const ref of prefs.favorite) {
    const match = models.find((m) => modelMatchesRef(m, ref));
    if (match) {
      favoriteModels.push(match);
      seen.add(makeKey(match));
    }
  }

  // --- Recent (exclude those already in favorites) ---
  const recentModels: ResolvedModel[] = [];
  for (const ref of prefs.recent) {
    const match = models.find((m) => modelMatchesRef(m, ref));
    if (match && !seen.has(makeKey(match))) {
      recentModels.push(match);
      seen.add(makeKey(match));
    }
  }

  // --- Provider groups ---
  const providerMap = new Map<string, { providerName: string; models: ResolvedModel[] }>();

  for (const model of models) {
    if (seen.has(makeKey(model))) continue;

    let entry = providerMap.get(model.providerID);
    if (!entry) {
      entry = { providerName: model.providerName, models: [] };
      providerMap.set(model.providerID, entry);
    }
    entry.models.push(model);
  }

  // Sort models within each provider group.
  for (const entry of providerMap.values()) {
    entry.models.sort((a, b) => {
      const aFree = isModelFree(a.model, a.providerID);
      const bFree = isModelFree(b.model, b.providerID);
      if (aFree !== bFree) return aFree ? -1 : 1;
      return a.modelName.localeCompare(b.modelName);
    });
  }

  // Sort provider groups: "opencode" first, then alphabetical.
  const sortedProviderIDs = [...providerMap.keys()].sort((a, b) => {
    const aIsOC = a.toLowerCase() === 'opencode';
    const bIsOC = b.toLowerCase() === 'opencode';
    if (aIsOC !== bIsOC) return aIsOC ? -1 : 1;
    const nameA = providerMap.get(a)!.providerName;
    const nameB = providerMap.get(b)!.providerName;
    return nameA.localeCompare(nameB);
  });

  // --- Assemble groups ---
  const groups: ModelGroup[] = [];

  if (favoriteModels.length > 0) {
    groups.push({ type: 'favorites', label: 'Favorites', models: favoriteModels });
  }

  if (recentModels.length > 0) {
    groups.push({ type: 'recent', label: 'Recent', models: recentModels });
  }

  for (const pid of sortedProviderIDs) {
    const entry = providerMap.get(pid)!;
    groups.push({ type: 'provider', label: entry.providerName, models: entry.models });
  }

  return groups;
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

/**
 * Format a model's context-window limit as a human-readable string.
 *
 * - `>= 1 000 000` → `"1M"`, `"2M"` etc.
 * - `>= 1 000` → `"128k"`, `"200k"` etc.
 * - `< 1 000` → raw number as a string.
 * - `null` / `undefined` → `null`.
 */
export function formatContextLimit(limit?: { context: number; output: number }): string | null {
  if (!limit) return null;

  const ctx = limit.context;
  if (ctx >= 1_000_000) {
    return `${Math.round(ctx / 1_000_000)}M`;
  }
  if (ctx >= 1_000) {
    return `${Math.round(ctx / 1_000)}k`;
  }
  return String(ctx);
}

/**
 * Returns `true` when the model is considered free.
 *
 * A model is free when its input cost is `0` **and** the provider is
 * `"opencode"` (case-insensitive).
 */
export function isModelFree(model: ProviderModel, providerID: string): boolean {
  return model.cost?.input === 0 && providerID.toLowerCase() === 'opencode';
}

/**
 * Derive short capability tags suitable for badge display.
 *
 * Only capabilities that are truthy on the model are included.
 */
export function getCapabilityTags(model: ProviderModel): string[] {
  const tags: string[] = [];
  const caps = model.capabilities;
  if (!caps) return tags;

  if (caps.reasoning) tags.push('reasoning');
  if (caps.input?.image) tags.push('vision');
  if (caps.attachment) tags.push('attachment');
  if (caps.input?.pdf) tags.push('pdf');

  return tags;
}
