/**
 * AgentSelector - Compact dropdown to switch between available agents
 *
 * Shows current agent name as a trigger button. On click, opens an
 * upward-positioned dropdown listing all agents from the server.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useChatStore } from '../stores/chatStore';
import { postMessage } from '../utils/vscodeApi';

/** Capitalize the first letter of a string */
function capitalize(str: string): string {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export function AgentSelector() {
  const agents = useChatStore((s) => s.agents);
  const selectedAgent = useChatStore((s) => s.selectedAgent);
  const setSelectedAgent = useChatStore((s) => s.setSelectedAgent);

  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Derive current agent label
  const currentAgent = agents.find((a) => a.name === selectedAgent);
  const displayName = currentAgent ? capitalize(currentAgent.name) : selectedAgent ? capitalize(selectedAgent) : 'Agent';

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const handleToggle = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  const handleSelect = useCallback(
    (agentId: string) => {
      setSelectedAgent(agentId);
      postMessage({ type: 'agent:select', data: { id: agentId } });
      setIsOpen(false);
      triggerRef.current?.focus();
    },
    [setSelectedAgent]
  );

  // Don't render if no agents available
  if (agents.length === 0) {
    return null;
  }

  return (
    <div className="agent-selector" ref={containerRef}>
      <button
        ref={triggerRef}
        className="agent-selector__trigger"
        onClick={handleToggle}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        title="Select agent"
      >
        <svg
          className="agent-selector__icon"
          width="14"
          height="14"
          viewBox="0 0 16 16"
          fill="currentColor"
        >
          <path d="M8 1a2 2 0 0 1 2 2v1h1.5A1.5 1.5 0 0 1 13 5.5v1A1.5 1.5 0 0 1 11.5 8H11v1.5a2.5 2.5 0 0 1-2.5 2.5h-1A2.5 2.5 0 0 1 5 9.5V8h-.5A1.5 1.5 0 0 1 3 6.5v-1A1.5 1.5 0 0 1 4.5 4H6V3a2 2 0 0 1 2-2zm0 1a1 1 0 0 0-1 1v1.5a.5.5 0 0 1-.5.5h-2a.5.5 0 0 0-.5.5v1a.5.5 0 0 0 .5.5H5a.5.5 0 0 1 .5.5v2a1.5 1.5 0 0 0 1.5 1.5h2A1.5 1.5 0 0 0 10.5 9.5v-2a.5.5 0 0 1 .5-.5h.5a.5.5 0 0 0 .5-.5v-1a.5.5 0 0 0-.5-.5H10a.5.5 0 0 1-.5-.5V3a1 1 0 0 0-1-1z" />
          <circle cx="6.5" cy="7" r="0.75" />
          <circle cx="9.5" cy="7" r="0.75" />
          <path d="M6.5 13.5a.5.5 0 0 1 .5-.5h2a.5.5 0 0 1 0 1H7a.5.5 0 0 1-.5-.5z" />
        </svg>
        <span className="agent-selector__name">{displayName}</span>
        <svg
          className="agent-selector__chevron"
          width="10"
          height="10"
          viewBox="0 0 16 16"
          fill="currentColor"
        >
          <path d="M8 5.5l4 4H4l4-4z" />
        </svg>
      </button>

      {isOpen && (
        <div className="agent-selector__dropdown" role="listbox">
          {agents.map((agent) => {
            const isSelected = agent.name === selectedAgent;
            return (
              <div
                key={agent.name}
                className={`agent-selector__item${isSelected ? ' agent-selector__item--selected' : ''}`}
                role="option"
                aria-selected={isSelected}
                onClick={() => handleSelect(agent.name)}
              >
                <span className="agent-selector__item-name">{capitalize(agent.name)}</span>
                {agent.description && (
                  <span className="agent-selector__item-desc">{agent.description}</span>
                )}
                {isSelected && (
                  <span className="agent-selector__item-check">&#x2713;</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
