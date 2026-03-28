import type { ModelRef, OpenCodeConfig } from '../types/opencode';

function pickConfigString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed || undefined;
}

export function getConfiguredModel(config?: OpenCodeConfig): string | undefined {
  return pickConfigString(config?.model);
}

export function getConfiguredAgent(config?: OpenCodeConfig): string | undefined {
  return pickConfigString(config?.default_agent) ?? pickConfigString(config?.agent);
}

export function parseConfiguredModel(config?: OpenCodeConfig): ModelRef | undefined {
  const model = getConfiguredModel(config);
  if (!model) {
    return undefined;
  }

  const [providerID, modelID, ...rest] = model.split('/');
  if (rest.length > 0 || !providerID?.trim() || !modelID?.trim()) {
    return undefined;
  }

  return {
    providerID: providerID.trim(),
    modelID: modelID.trim(),
  };
}
