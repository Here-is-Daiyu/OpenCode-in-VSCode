/**
 * AgentPartView - Compact inline badge showing an agent transition marker.
 *
 * Layout: robot icon + "Agent: {agent name}"
 */

import React from 'react';
import type { AgentPart } from '../../../types/opencode';

// ---------------------------------------------------------------------------
// Icon
// ---------------------------------------------------------------------------

function RobotIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 1a1 1 0 0 1 1 1v1h2a2 2 0 0 1 2 2v1h1a1 1 0 1 1 0 2h-1v2a2 2 0 0 1-2 2h-1v2a1 1 0 1 1-2 0v-2H6v2a1 1 0 1 1-2 0v-2H3a2 2 0 0 1-2-2V8H0a1 1 0 0 1 0-2h1V5a2 2 0 0 1 2-2h2V2a1 1 0 0 1 1-1zM3 5v5a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1zm2 1.5a1 1 0 1 1 2 0 1 1 0 0 1-2 0zm5 0a1 1 0 1 1 2 0 1 1 0 0 1-2 0zM6 9h4v1H6V9z" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface AgentPartViewProps {
  part: AgentPart;
}

export const AgentPartView = React.memo(function AgentPartView({
  part,
}: AgentPartViewProps) {
  return (
    <div className="msg-agent-marker">
      <span className="msg-agent-marker__icon">
        <RobotIcon />
      </span>
      <span className="msg-agent-marker__label">
        Agent: <span className="msg-agent-marker__name">{part.agent}</span>
      </span>
    </div>
  );
});
