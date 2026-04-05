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
  permission?: PermissionRule[];
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

/** Internal normalized session status (after mapping from API's `type` field). */
export interface SessionStatus {
  status: 'idle' | 'active' | 'error' | 'compacting' | 'retry';
  error?: string;
}

// PTY types
export interface Pty {
  id: string;
  title: string;
  command: string;
  args: string[];
  cwd: string;
  status: 'running' | 'exited';
  pid: number;
}

export interface PtySize {
  rows: number;
  cols: number;
}

export interface PtyCreateOptions {
  command?: string;
  args?: string[];
  cwd?: string;
  title?: string;
  env?: Record<string, string>;
}

export interface PtyUpdateOptions {
  title?: string;
  size?: PtySize;
}

export interface PtyExitInfo {
  id: string;
  exitCode: number;
}

/** Raw session status as returned by `GET /session/status`. */
export interface RawSessionStatus {
  type: 'busy' | 'idle';
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
  time?: unknown;
  sessionID?: string;
  messageID?: string;
}

export interface FilePart {
  type: 'file';
  id: string;
  /** API returns 'mime' but some paths may use 'mediaType' */
  mime?: string;
  mediaType?: string;
  /** Runtime payloads may omit filename and only provide url + mime */
  filename?: string;
  url?: string;
}

export type ToolStatus = 'pending' | 'running' | 'completed' | 'error';

export interface ToolState {
  status: ToolStatus;
  input?: Record<string, unknown>;
  output?: string;
  error?: string;
  title?: string;
  metadata?: Record<string, unknown>;
  time?: { start?: number; end?: number };
}

export interface ToolPart {
  type: 'tool';
  id: string;
  callID?: string;
  tool: string;
  state: ToolState;
  sessionID?: string;
  messageID?: string;
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
  sessionID?: string;
  messageID?: string;
}

export interface StepFinishPart {
  type: 'step-finish';
  id: string;
  tokens?: TokenUsage;
  cost?: number;
  sessionID?: string;
  messageID?: string;
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
  source?: string;
  env?: string[];
  options?: Record<string, unknown>;
  models: Record<string, ProviderModel>;
}

export interface ProviderModel {
  id: string;
  name: string;
  providerID?: string;
  family?: string;
  api?: { id: string; url?: string; npm?: string };
  status?: 'active' | 'inactive' | string;
  headers?: Record<string, string>;
  options?: Record<string, unknown>;
  cost?: { input: number; output: number; cache: { read: number; write: number } };
  limit?: { context: number; output: number };
  capabilities?: ModelCapabilities;
  release_date?: string;
  variants?: Record<string, Record<string, unknown>>;
}

export interface ModelCapabilities {
  temperature?: boolean;
  reasoning?: boolean;
  attachment?: boolean;
  toolcall?: boolean;
  input?: { text?: boolean; audio?: boolean; image?: boolean; video?: boolean; pdf?: boolean };
  output?: { text?: boolean; audio?: boolean; image?: boolean; video?: boolean; pdf?: boolean };
  interleaved?: boolean | { field: string };
}

// Config types

/** Model definition within a provider config (as stored in opencode.json). */
export interface ProviderModelConfig {
  name: string;
  attachment?: boolean;
  reasoning?: boolean;
  tool_call?: boolean;
  limit?: { context: number; output: number };
  interleaved?: boolean | { field: string };
  modalities?: { input: string[]; output: string[] };
}

/** Provider configuration as stored in the opencode.json `provider` map. */
export interface ProviderConfig {
  name: string;
  npm: string;
  models: Record<string, ProviderModelConfig>;
  options?: Record<string, unknown>;
}

export interface OpenCodeConfig {
  model?: string | null;
  agent?: Record<string, unknown> | null;
  default_agent?: string | null;
  theme?: 'dark' | 'light' | 'system';
  permission?: PermissionRuleset;
  mcp?: Record<string, MCPServerConfig>;
  command?: Record<string, CustomCommand>;
  /** Custom provider configurations (provider ID → config). */
  provider?: Record<string, ProviderConfig>;
  /** List of provider IDs to disable. */
  disabled_providers?: string[];
}

export type PermissionRuleset = Record<string, PermissionValue | Record<string, PermissionValue>>;
export type PermissionValue = 'allow' | 'ask' | 'deny';

export interface PermissionRule {
  permission: string;
  pattern: string;
  action: PermissionValue;
}

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
  name: string;
  description?: string;
  options?: Record<string, unknown>;
  permission?: PermissionRule[];
  mode: 'primary' | 'subagent';
  native: boolean;
  prompt?: string;
  model?: string | ModelRef;
  hidden?: boolean;
  temperature?: number;
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
// Note: The MCP endpoint (`GET /mcp`) returns `Record<string, MCPStatus>` where
// each key is the server name and the value only contains `status`.
export type MCPStatus =
  | { status: 'connected' }
  | { status: 'disabled' }
  | { status: 'failed'; error: string }
  | { status: 'needs_auth'; error: string }
  | { status: 'needs_client_registration' };

// Provider info response from `GET /provider`
// (distinct from the configured-only response from `GET /config/providers`)
export interface ProviderInfoResponse {
  all: Provider[];
  default: Record<string, string>;
  connected: string[];
}

// Formatter status from `GET /formatter`
export interface FormatterStatus {
  name: string;
  extensions: string[];
  enabled: boolean;
}

// LSP Status
export interface LSPStatus {
  id: string;
  name: string;
  root: string;
  status: 'connected' | 'stopped' | 'error';
}

// Path info response from `GET /path`
export interface PathInfo {
  home: string;
  state: string;
  config: string;
  worktree: string;
  directory: string;
}

// Health
export interface HealthResponse {
  healthy: boolean;
  version: string;
}
