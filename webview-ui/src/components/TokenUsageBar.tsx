/**
 * TokenUsageBar - Thin horizontal bar showing token distribution
 *
 * Displays colored segments for input/output/reasoning/cache tokens
 * with a tooltip breakdown on hover, and a label showing used/limit.
 */

import React, { useMemo, useState } from 'react';
import { useChatStore } from '../stores/chatStore';
import { useModelStore } from '../stores/modelStore';
import type { TokenUsage, AssistantMessage, Provider } from '../types/opencode';

interface TokenSegment {
  key: string;
  label: string;
  value: number;
  color: string;
}

interface ModelStatus {
  label: string;
  title: string;
  contextLimit: number;
}

function formatTokenCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function getTokenSegments(tokens: TokenUsage): TokenSegment[] {
  const segments: TokenSegment[] = [];

  if (tokens.input > 0) {
    segments.push({ key: 'input', label: 'Input', value: tokens.input, color: '#4A9EF5' });
  }
  if (tokens.output > 0) {
    segments.push({ key: 'output', label: 'Output', value: tokens.output, color: '#4CAF50' });
  }
  if (tokens.reasoning > 0) {
    segments.push({ key: 'reasoning', label: 'Reasoning', value: tokens.reasoning, color: '#9C27B0' });
  }
  if (tokens.cache?.read > 0) {
    segments.push({ key: 'cache-read', label: 'Cache Read', value: tokens.cache.read, color: '#FF9800' });
  }
  if (tokens.cache?.write > 0) {
    segments.push({ key: 'cache-write', label: 'Cache Write', value: tokens.cache.write, color: '#FFC107' });
  }

  return segments;
}

function computeTotal(tokens: TokenUsage): number {
  return (
    tokens.input +
    tokens.output +
    tokens.reasoning +
    (tokens.cache?.read ?? 0) +
    (tokens.cache?.write ?? 0)
  );
}

function getLastAssistantWithTokens(
  messages: ReturnType<typeof useChatStore.getState>['visibleMessages'],
): { message: AssistantMessage; tokens: TokenUsage } | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i].info;
    if (msg.role !== 'assistant') {
      continue;
    }

    const assistantMsg = msg as AssistantMessage;
    if (assistantMsg.tokens && computeTotal(assistantMsg.tokens) > 0) {
      return { message: assistantMsg, tokens: assistantMsg.tokens };
    }
  }

  return null;
}

function resolveModelStatus(
  providers: Provider[],
  providerID?: string,
  modelID?: string,
): ModelStatus | null {
  const normalizedProviderID = typeof providerID === 'string' ? providerID.trim() : '';
  const normalizedModelID = typeof modelID === 'string' ? modelID.trim() : '';

  if (!normalizedProviderID && !normalizedModelID) {
    return null;
  }

  const provider = normalizedProviderID
    ? providers.find((candidate) => candidate.id === normalizedProviderID)
    : undefined;
  const model = provider && normalizedModelID ? provider.models[normalizedModelID] : undefined;
  const providerName = provider?.name ?? normalizedProviderID;
  const modelName = model?.name ?? normalizedModelID;
  const label = providerName && modelName ? `${providerName} / ${modelName}` : modelName || providerName;
  const title = normalizedProviderID && normalizedModelID
    ? `${normalizedProviderID}/${normalizedModelID}`
    : normalizedModelID || normalizedProviderID;

  if (!label) {
    return null;
  }

  return {
    label,
    title,
    contextLimit: model?.limit?.context ?? 0,
  };
}

export function TokenUsageBar() {
  const messages = useChatStore((s) => s.visibleMessages);
  const providers = useModelStore((s) => s.providers);
  const getCurrentModel = useModelStore((s) => s.getCurrentModel);
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const currentModel = getCurrentModel();

  const tokenSource = useMemo(() => getLastAssistantWithTokens(messages), [messages]);

  const contextLimit = useMemo(() => {
    if (tokenSource) {
      const resolved = resolveModelStatus(
        providers,
        tokenSource.message.providerID,
        tokenSource.message.modelID,
      );

      if (resolved?.contextLimit) {
        return resolved.contextLimit;
      }

      if (
        currentModel
        && currentModel.providerID === tokenSource.message.providerID
        && currentModel.modelID === tokenSource.message.modelID
      ) {
        return currentModel.model.limit?.context ?? 0;
      }
    }

    return currentModel?.model.limit?.context ?? 0;
  }, [currentModel, providers, tokenSource]);

  if (!tokenSource) return null;

  const { tokens: lastTokens } = tokenSource;
  const totalUsed = computeTotal(lastTokens);
  const segments = getTokenSegments(lastTokens);
  const limit = contextLimit > 0 ? contextLimit : totalUsed;

  // Context usage percentage and color coding
  const usagePercent = contextLimit > 0 ? (totalUsed / contextLimit) * 100 : 0;
  const trackClass =
    contextLimit > 0 && usagePercent >= 90
      ? 'token-bar__track token-bar__track--danger'
      : contextLimit > 0 && usagePercent >= 70
        ? 'token-bar__track token-bar__track--warning'
        : 'token-bar__track';

  return (
    <div
      className="token-bar"
      onMouseEnter={() => setTooltipVisible(true)}
      onMouseLeave={() => setTooltipVisible(false)}
    >
      <div className={trackClass}>
        {segments.map((seg) => (
          <div
            key={seg.key}
            className="token-bar__segment"
            style={{
              width: `${Math.max((seg.value / limit) * 100, 0.5)}%`,
              backgroundColor: seg.color,
            }}
          />
        ))}
      </div>
      <span className="token-bar__label">
        {formatTokenCount(totalUsed)}
        {contextLimit > 0 ? ` / ${formatTokenCount(contextLimit)}` : ''}
        {contextLimit > 0 && (
          <span className="token-bar__pct">
            {` (${Math.round(usagePercent)}%)`}
          </span>
        )}
      </span>

      {tooltipVisible && (
        <div className="token-bar__tooltip">
          {segments.map((seg) => (
            <div key={seg.key} className="token-bar__tooltip-row">
              <span
                className="token-bar__tooltip-dot"
                style={{ backgroundColor: seg.color }}
              />
              <span className="token-bar__tooltip-label">{seg.label}</span>
              <span className="token-bar__tooltip-value">
                {formatTokenCount(seg.value)}
              </span>
            </div>
          ))}
          {contextLimit > 0 && (
            <div className="token-bar__tooltip-row token-bar__tooltip-row--total">
              <span
                className="token-bar__tooltip-dot"
                style={{ backgroundColor: 'var(--text-weaker)' }}
              />
              <span className="token-bar__tooltip-label">Remaining</span>
              <span className="token-bar__tooltip-value">
                {formatTokenCount(Math.max(0, contextLimit - totalUsed))}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
