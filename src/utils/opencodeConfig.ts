import type { OpenCodeConfig } from '../types/opencode';

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
