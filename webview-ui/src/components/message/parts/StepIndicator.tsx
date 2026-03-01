/**
 * StepIndicator - Renders step-start / step-finish boundaries.
 *
 * step-start: thin divider line
 * step-finish: token usage summary (subtle)
 */

import React from 'react';
import type { StepStartPart, StepFinishPart } from '../../../types/opencode';

// ---------------------------------------------------------------------------
// StepStart
// ---------------------------------------------------------------------------

export const StepStartIndicator = React.memo(function StepStartIndicator(
  _props: { part: StepStartPart },
) {
  return <div className="msg-step-start" />;
});

// ---------------------------------------------------------------------------
// StepFinish
// ---------------------------------------------------------------------------

interface StepFinishIndicatorProps {
  part: StepFinishPart;
}

export const StepFinishIndicator = React.memo(function StepFinishIndicator({
  part,
}: StepFinishIndicatorProps) {
  const { tokens, cost } = part;
  if (!tokens) return null;

  return (
    <div className="msg-step-finish">
      <span className="msg-step-finish__tokens">
        {formatTokens(tokens.input)} in / {formatTokens(tokens.output)} out
      </span>
      {(tokens?.reasoning ?? 0) > 0 && (
        <span className="msg-step-finish__reasoning">
          {formatTokens(tokens.reasoning)} reasoning
        </span>
      )}
      {(cost ?? 0) > 0 && (
        <span className="msg-step-finish__cost">${cost!.toFixed(4)}</span>
      )}
    </div>
  );
});

function formatTokens(count: number): string {
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}k`;
  }
  return String(count);
}
