/**
 * Integrations settings tab.
 *
 * Combines MCP Servers, Custom Commands, and Custom Providers (CRUD only)
 * into a single unified tab for managing external integrations.
 *
 * Each section is implemented in its own module under `./integrations/`.
 */

import React from 'react';
import type {
  OpenCodeConfig,
  MCPServerConfig,
  MCPStatus,
  Provider,
} from '../../../types/opencode';
import { MCPSection } from './integrations/MCPSection';
import { CommandsSection } from './integrations/CommandsSection';
import { ProvidersSection } from './integrations/ProvidersSection';

// ---------------------------------------------------------------------------
//  Props
// ---------------------------------------------------------------------------

interface IntegrationsTabProps {
  config: OpenCodeConfig;
  providers: Provider[];
  connectedProviders: string[];
  mcpStatus: Record<string, MCPStatus>;
  onUpdateConfig: (partial: Record<string, unknown>) => void;
  onMCPAdd: (name: string, config: MCPServerConfig) => void;
  onMCPRemove: (name: string) => void;
  onMCPToggle: (name: string, enabled: boolean) => void;
}

// ---------------------------------------------------------------------------
//  Main component
// ---------------------------------------------------------------------------

export function IntegrationsTab({
  config,
  providers,
  connectedProviders,
  mcpStatus,
  onUpdateConfig,
  onMCPAdd,
  onMCPRemove,
  onMCPToggle,
}: IntegrationsTabProps) {
  const mcpServers = config.mcp ?? {};
  const commands = config.command ?? {};
  const customProviders = config.provider ?? {};

  return (
    <>
      <MCPSection
        mcpServers={mcpServers}
        mcpStatus={mcpStatus}
        onMCPAdd={onMCPAdd}
        onMCPRemove={onMCPRemove}
        onMCPToggle={onMCPToggle}
      />

      <CommandsSection
        commands={commands}
        providers={providers}
        onUpdateConfig={onUpdateConfig}
      />

      <ProvidersSection
        customProviders={customProviders}
        onUpdateConfig={onUpdateConfig}
      />
    </>
  );
}
