import React, { useCallback, useMemo } from 'react';
import { useChatStore } from '../stores/chatStore';
import { useModelStore } from '../stores/modelStore';
import type { Provider } from '../types/opencode';
import { getConfiguredModel } from '../utils/opencodeConfig';
import { postMessage } from '../utils/vscodeApi';

interface DisplayModel {
  providerID: string;
  modelID: string;
  providerName: string;
  modelName: string;
}

function parseConfiguredModel(configuredModel: string | undefined): {
  providerID: string;
  modelID: string;
} | null {
  if (!configuredModel) {
    return null;
  }

  const slashIndex = configuredModel.indexOf('/');
  if (slashIndex <= 0 || slashIndex >= configuredModel.length - 1) {
    return null;
  }

  return {
    providerID: configuredModel.slice(0, slashIndex),
    modelID: configuredModel.slice(slashIndex + 1),
  };
}

function resolveDisplayModel(
  providers: Provider[],
  providerID: string,
  modelID: string,
): DisplayModel {
  const provider = providers.find((item) => item.id === providerID);
  const model = provider?.models[modelID];

  return {
    providerID,
    modelID,
    providerName: provider?.name || providerID,
    modelName: model?.name || modelID,
  };
}

export function CurrentModelBadge() {
  const visibleMessages = useChatStore((s) => s.visibleMessages);
  const config = useModelStore((s) => s.config);
  const providers = useModelStore((s) => s.providers);
  const getCurrentModel = useModelStore((s) => s.getCurrentModel);

  const currentModel = useMemo(() => {
    for (let index = visibleMessages.length - 1; index >= 0; index -= 1) {
      const message = visibleMessages[index]?.info;
      if (message?.role !== 'assistant') {
        continue;
      }

      const providerID = message.providerID.trim();
      const modelID = message.modelID.trim();
      if (!providerID || !modelID) {
        continue;
      }

      return resolveDisplayModel(providers, providerID, modelID);
    }

    const configuredModel = getCurrentModel();
    if (configuredModel) {
      return {
        providerID: configuredModel.providerID,
        modelID: configuredModel.modelID,
        providerName: configuredModel.providerName,
        modelName: configuredModel.modelName,
      } satisfies DisplayModel;
    }

    const configuredModelRef = parseConfiguredModel(getConfiguredModel(config));
    if (!configuredModelRef) {
      return null;
    }

    return resolveDisplayModel(providers, configuredModelRef.providerID, configuredModelRef.modelID);
  }, [config, getCurrentModel, providers, visibleMessages]);

  const handleClick = useCallback(() => {
    postMessage({
      type: 'command:execute',
      data: { command: 'opencode.selectModel' },
    });
  }, []);

  if (!currentModel) {
    return null;
  }

  const label = `${currentModel.providerName} / ${currentModel.modelName}`;

  return (
    <button
      aria-label={`Current model: ${label}. Click to change model.`}
      className="current-model-badge"
      onClick={handleClick}
      title={`Current model: ${label}. Click to change model.`}
      type="button"
    >
      <span className="current-model-badge__text">{label}</span>
    </button>
  );
}
