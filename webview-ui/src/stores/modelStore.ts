/**
 * Model/provider state management using Zustand
 *
 * Stores config, provider list, connected providers, and local variant selection.
 * Populated from extension messages: `config:updated` and `providers:updated`.
 */

import { create } from 'zustand';
import type { OpenCodeConfig, Provider, ProviderModel } from '../types/opencode';

export interface ResolvedModel {
  providerID: string;
  providerName: string;
  modelID: string;
  modelName: string;
  model: ProviderModel;
}

export interface ModelState {
  config: OpenCodeConfig | null;
  providers: Provider[];
  connectedProviders: string[];
  selectedVariant: string | undefined;

  /** Model preferences (recent, favorite, variant) from file */
  modelPrefs: {
    recent: Array<{ providerID: string; modelID: string }>;
    favorite: Array<{ providerID: string; modelID: string }>;
    variant: Record<string, string | undefined>;
  };

  setConfig: (config: OpenCodeConfig) => void;
  setProviders: (providers: Provider[], connected: string[]) => void;
  setSelectedVariant: (variant: string | undefined) => void;
  setModelPrefs: (prefs: ModelState['modelPrefs']) => void;

  /** Resolve the current model from config + providers */
  getCurrentModel: () => ResolvedModel | null;

  /** Flat list of models from connected providers only */
  getAvailableModels: () => ResolvedModel[];
}

export const useModelStore = create<ModelState>((set, get) => ({
  config: null,
  providers: [],
  connectedProviders: [],
  selectedVariant: undefined,
  modelPrefs: { recent: [], favorite: [], variant: {} },

  setConfig: (config) => set({ config }),

  setProviders: (providers, connected) =>
    set({ providers, connectedProviders: connected }),

  setSelectedVariant: (variant) => set({ selectedVariant: variant }),

  setModelPrefs: (prefs) => set({ modelPrefs: prefs }),

  getCurrentModel: () => {
    const { config, providers } = get();
    if (!config?.model) return null;

    const slashIndex = config.model.indexOf('/');
    if (slashIndex === -1) return null;

    const providerID = config.model.slice(0, slashIndex);
    const modelID = config.model.slice(slashIndex + 1);

    const provider = providers.find((p) => p.id === providerID);
    if (!provider) return null;

    const model = provider.models[modelID];
    if (!model) return null;

    return {
      providerID,
      providerName: provider.name,
      modelID,
      modelName: model.name || modelID,
      model,
    };
  },

  getAvailableModels: () => {
    const { providers, connectedProviders } = get();
    const connected = new Set(connectedProviders);
    const result: ResolvedModel[] = [];

    for (const provider of providers) {
      if (!connected.has(provider.id)) continue;

      for (const [modelID, model] of Object.entries(provider.models)) {
        result.push({
          providerID: provider.id,
          providerName: provider.name,
          modelID,
          modelName: model.name || modelID,
          model,
        });
      }
    }

    return result;
  },
}));
