/**
 * Agent state management using Zustand
 *
 * Stores the list of available agents fetched from the server
 * and the currently selected agent ID (from config).
 */

import { create } from 'zustand';
import type { Agent } from '../types/opencode';

export interface AgentState {
  agents: Agent[];
  selectedAgentId: string | undefined;

  setAgents: (agents: Agent[]) => void;
  setSelectedAgent: (id: string | undefined) => void;

  /** Get the currently selected agent object, or undefined */
  getSelectedAgent: () => Agent | undefined;
}

export const useAgentStore = create<AgentState>((set, get) => ({
  agents: [],
  selectedAgentId: undefined,

  setAgents: (agents) => set({ agents }),

  setSelectedAgent: (id) => set({ selectedAgentId: id }),

  getSelectedAgent: () => {
    const { agents, selectedAgentId } = get();
    if (!selectedAgentId) return undefined;
    return agents.find((a) => a.name === selectedAgentId);
  },
}));
