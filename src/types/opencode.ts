/**
 * OpenCode API type definitions
 * Based on the OpenCode REST API specification
 */

// Session types
export interface Session {
  id: string;
  slug: string;
  projectID: string;
  directory: string;
  parentID?: string;
  summary?: SessionSummary;
  share?: { url: string };
  title: string;
  version: string;
  time: SessionTime;
  permission?: PermissionRuleset;
  revert?: RevertInfo;
}

export interface SessionSummary {
  additions: number;
  deletions: number;
  files: number;
  diffs?: FileDiff[];
}

export interface SessionTime {
  created: number;
  updated: number;
  compacting?: number;
  archived?: number;
}

export interface RevertInfo {
  messageID: string;
  partID?: string;
  snapshot?: string;
  diff?: string;
}

export interface SessionStatus {
  status: 'idle' | 'active' | 'error' | 'compacting';
  error?: string;
}

// Message types
export type Message = UserMessage | AssistantMessage;

export interface UserMessage {
  id: string;
  sessionID: string;
  role: 'user';
  time: { created: number };
  format?: OutputFormat;
  agent: string;
  model: ModelRef;
  system?: string;
  tools?: Record<string, boolean>;
}

export interface AssistantMessage {
  id: string;
  sessionID: string;
  role: 'assistant';
  time: { created: number; completed?: number };
  error?: MessageError;
  parentID: string;
  modelID: string;
  providerID: string;
  mode: string;
  agent: string;
  path: { cwd: string; root: string };
  summary?: boolean;
  cost: number;
  tokens: TokenUsage;
  structured?: unknown;
  finish?: string;
}

export interface TokenUsage {
  total?: number;
  input: number;
  output: number;
  reasoning: number;
  cache: { read: number; write: number };
}

export interface ModelRef {
  providerID: string;
  modelID: string;
}

export type OutputFormat = unknown; // TODO: Define structured output format
export type MessageError = { type: string; message: string };

// Part types
export type Part =
  | TextPart
  | FilePart
  | ToolPart
  | ReasoningPart
  | SubtaskPart
  | StepStartPart
  | StepFinishPart
  | SnapshotPart
  | PatchPart
  | AgentPart
  | RetryPart
  | CompactionPart;

export interface TextPart {
  type: 'text';
  id: string;
  text: string;
}

export interface FilePart {
  type: 'file';
  id: string;
  mediaType: string;
  filename: string;
  url?: string;
}

export interface ToolPart {
  type: 'tool';
  id: string;
  tool: string;
  state: 'pending' | 'running' | 'completed' | 'error';
  input: Record<string, unknown>;
  output?: string;
  error?: string;
  duration?: number;
}

export interface ReasoningPart {
  type: 'reasoning';
  id: string;
  text: string;
}

export interface SubtaskPart {
  type: 'subtask';
  id: string;
  sessionID: string;
  input: string;
  output?: string;
}

export interface StepStartPart {
  type: 'step-start';
  id: string;
}

export interface StepFinishPart {
  type: 'step-finish';
  id: string;
  tokens: TokenUsage;
  cost: number;
}

export interface SnapshotPart {
  type: 'snapshot';
  id: string;
  path: string;
  content: string;
}

export interface PatchPart {
  type: 'patch';
  id: string;
  path: string;
  content: string;
}

export interface AgentPart {
  type: 'agent';
  id: string;
  agent: string;
}

export interface RetryPart {
  type: 'retry';
  id: string;
  reason: string;
}

export interface CompactionPart {
  type: 'compaction';
  id: string;
  summary: string;
}

// MessageWithParts
export interface MessageWithParts {
  info: Message;
  parts: Part[];
}

// Provider types
export interface Provider {
  id: string;
  name: string;
  models: ProviderModel[];
}

export interface ProviderModel {
  id: string;
  name: string;
  limit?: { context: number; output: number };
  reasoning?: boolean;
  attachment?: boolean;
}

// Config types
export interface OpenCodeConfig {
  model?: string;
  agent?: string;
  theme?: 'dark' | 'light' | 'system';
  permission?: PermissionRuleset;
  mcp?: Record<string, MCPServerConfig>;
  command?: Record<string, CustomCommand>;
}

export type PermissionRuleset = Record<string, PermissionValue | Record<string, PermissionValue>>;
export type PermissionValue = 'allow' | 'ask' | 'deny';

export interface MCPServerConfig {
  type: 'local' | 'remote';
  command?: string[];
  environment?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  enabled?: boolean;
  timeout?: number;
}

export interface CustomCommand {
  template: string;
  description?: string;
  agent?: string;
  subtask?: boolean;
  model?: string;
}

// Agent types
export interface Agent {
  id: string;
  name: string;
  description?: string;
}

// File types
export interface FileDiff {
  path: string;
  status: 'added' | 'modified' | 'deleted';
  additions: number;
  deletions: number;
  diff?: string;
}

// Todo types
export interface Todo {
  id: string;
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
  priority: 'low' | 'medium' | 'high';
}

// Permission request
export interface PermissionRequest {
  id: string;
  tool: string;
  description: string;
  input: Record<string, unknown>;
}

// Question
export interface Question {
  id: string;
  text: string;
  options?: string[];
  type: 'text' | 'choice';
}

// MCP Status
export interface MCPStatus {
  name: string;
  status: 'connected' | 'connecting' | 'disconnected' | 'error';
  tools?: number;
  error?: string;
}

// LSP Status
export interface LSPStatus {
  name: string;
  status: 'running' | 'stopped' | 'error';
  languages?: string[];
}

// Health
export interface HealthResponse {
  healthy: boolean;
  version: string;
}
