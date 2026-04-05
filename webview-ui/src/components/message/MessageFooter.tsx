/**
 * MessageFooter - Inline meta for completed assistant turns.
 */

import React, { useMemo } from 'react';
import type { AssistantMessage } from '../../types/opencode';

interface MessageFooterProps {
  info: AssistantMessage;
  /** The agent name for this turn (from the assistant message's `agent` field) */
  agentName?: string;
  /** Total turn duration in seconds (computed by parent from user msg created → last assistant msg completed) */
  turnDuration?: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Format a duration in seconds to a human-readable string. */
function formatDuration(seconds: number): string {
  if (seconds < 1) return '< 1s';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.round(seconds % 60);
  return remaining > 0 ? `${minutes}m ${remaining}s` : `${minutes}m`;
}

function capitalizeFirst(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  return `${trimmed.charAt(0).toUpperCase()}${trimmed.slice(1)}`;
}

export const MessageFooter = React.memo(function MessageFooter({
  info,
  agentName,
  turnDuration,
}: MessageFooterProps) {
  const meta = useMemo(() => {
    const pieces: string[] = [];
    const displayAgent = capitalizeFirst(agentName ?? info.agent ?? '');
    const modelID = typeof info.modelID === 'string' ? info.modelID.trim() : '';
    const durationLabel = turnDuration != null ? formatDuration(turnDuration) : undefined;

    if (displayAgent) {
      pieces.push(displayAgent);
    }
    if (modelID) {
      pieces.push(modelID);
    }
    if (durationLabel) {
      pieces.push(durationLabel);
    }

    return pieces.join(' · ');
  }, [agentName, info.agent, info.modelID, turnDuration]);

  if (!meta) return null;

  return (
    <div className="msg-footer">
      <div className="msg-footer__meta">{meta}</div>
    </div>
  );
});
