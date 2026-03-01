/**
 * ToolCallCard - Renders a tool call with collapsible input/output
 */

import React, { useState } from 'react';
import type { ToolPart } from '../types/opencode';

interface ToolCallCardProps {
  part: ToolPart;
}

export function ToolCallCard({ part }: ToolCallCardProps) {
  const [expanded, setExpanded] = useState(false);

  const stateClass = `tool-card--${part.state}`;
  const stateIcon = getStateIcon(part.state);

  return (
    <div className={`tool-card ${stateClass}`}>
      <div
        className="tool-card__header"
        onClick={() => setExpanded(!expanded)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setExpanded(!expanded);
          }
        }}
      >
        <span className="tool-card__icon">{stateIcon}</span>
        <span className="tool-card__name">{part.tool}</span>
        <span className="tool-card__state">{part.state}</span>
        {part.duration !== undefined && (
          <span className="tool-card__duration">
            {formatDuration(part.duration)}
          </span>
        )}
        <span className={`tool-card__chevron ${expanded ? 'tool-card__chevron--open' : ''}`}>
          &#x25B6;
        </span>
      </div>

      {expanded && (
        <div className="tool-card__body">
          {/* Input */}
          <div className="tool-card__section">
            <div className="tool-card__section-label">Input</div>
            <pre className="tool-card__code">
              <code>{formatInput(part.input)}</code>
            </pre>
          </div>

          {/* Output */}
          {part.output && (
            <div className="tool-card__section">
              <div className="tool-card__section-label">Output</div>
              <pre className="tool-card__code">
                <code>{part.output}</code>
              </pre>
            </div>
          )}

          {/* Error */}
          {part.error && (
            <div className="tool-card__section tool-card__section--error">
              <div className="tool-card__section-label">Error</div>
              <pre className="tool-card__code tool-card__code--error">
                <code>{part.error}</code>
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function getStateIcon(state: ToolPart['state']): React.ReactNode {
  switch (state) {
    case 'pending':
      return <span className="tool-card__icon--pending">&#x25CB;</span>;
    case 'running':
      return <span className="tool-card__icon--running tool-card__spinner">&#x25CE;</span>;
    case 'completed':
      return <span className="tool-card__icon--completed">&#x2713;</span>;
    case 'error':
      return <span className="tool-card__icon--error">&#x2717;</span>;
  }
}

function formatInput(input: Record<string, unknown>): string {
  try {
    return JSON.stringify(input, null, 2);
  } catch {
    return String(input);
  }
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}
