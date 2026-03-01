/**
 * Message types for Extension <-> Webview communication
 * These are the typed messages sent via postMessage
 */

import type { Session, MessageWithParts, OpenCodeConfig, Provider, Agent, Todo, PermissionRequest, Question, TokenUsage, MCPStatus, SessionStatus } from './opencode';

// Extension → Webview messages
export type ExtensionToWebviewMessage =
  | { type: 'session:loaded'; data: { session: Session; messages: MessageWithParts[] } }
  | { type: 'session:created'; data: Session }
  | { type: 'session:updated'; data: Session }
  | { type: 'session:deleted'; data: { id: string } }
  | { type: 'session:cleared'; data: undefined }
  | { type: 'session:status'; data: { sessionID: string; status: SessionStatus } }
  | { type: 'message:updated'; data: MessageWithParts }
  | { type: 'message:partUpdated'; data: { sessionID: string; messageID: string; part: import('./opencode').Part } }
  | { type: 'message:removed'; data: { sessionID: string; messageID: string } }
  | { type: 'permission:asked'; data: PermissionRequest }
  | { type: 'question:asked'; data: Question }
  | { type: 'config:updated'; data: OpenCodeConfig }
  | { type: 'providers:updated'; data: { providers: Provider[]; connected: string[] } }
  | { type: 'agents:updated'; data: Agent[] }
  | { type: 'todos:updated'; data: Todo[] }
  | { type: 'server:status'; data: { connected: boolean; version?: string } }
  | { type: 'error'; data: { message: string; details?: string } }
  | { type: 'chat:sendResult'; data: { success: boolean; messageID?: string; error?: string } }
  | { type: 'theme:changed'; data: { kind: 'light' | 'dark' | 'highContrast' } }
  | { type: 'file:added'; data: { path: string; name: string; content: string } }
  | { type: 'selection:added'; data: { path: string; name: string; content: string; startLine: number; endLine: number } };

// Webview → Extension messages
export type WebviewToExtensionMessage =
  | { type: 'chat:send'; data: { text: string; images?: string[] } }
  | { type: 'chat:abort' }
  | { type: 'session:create'; data?: { title?: string } }
  | { type: 'session:switch'; data: { id: string } }
  | { type: 'session:delete'; data: { id: string } }
  | { type: 'session:fork'; data: { messageID?: string } }
  | { type: 'session:share' }
  | { type: 'session:revert'; data: { messageID: string; partID?: string } }
  | { type: 'session:unrevert' }
  | { type: 'permission:respond'; data: { id: string; response: string; remember?: boolean } }
  | { type: 'question:respond'; data: { id: string; answer: string } }
  | { type: 'config:get' }
  | { type: 'config:update'; data: Partial<OpenCodeConfig> }
  | { type: 'model:select'; data: { providerID: string; modelID: string } }
  | { type: 'agent:select'; data: { id: string } }
  | { type: 'file:open'; data: { path: string } }
  | { type: 'diff:show'; data: { path: string; original: string; modified: string } }
  | { type: 'command:execute'; data: { command: string; args?: string } }
  | { type: 'ready' };

// Settings panel messages (Webview → Extension)
export type SettingsToExtensionMessage =
  | { type: 'settings:get' }
  | { type: 'settings:update'; data: { section: string; key: string; value: unknown } }
  | { type: 'settings:opencode:get' }
  | { type: 'settings:opencode:update'; data: Partial<OpenCodeConfig> }
  | { type: 'settings:mcp:add'; data: { name: string; config: import('./opencode').MCPServerConfig } }
  | { type: 'settings:mcp:remove'; data: { name: string } }
  | { type: 'settings:mcp:toggle'; data: { name: string; enabled: boolean } }
  | { type: 'ready' };

// Settings panel messages (Extension → Webview)
export type ExtensionToSettingsMessage =
  | { type: 'settings:loaded'; data: { vscode: Record<string, unknown>; opencode: OpenCodeConfig } }
  | { type: 'settings:updated'; data: { section: string; key: string; value: unknown } }
  | { type: 'providers:loaded'; data: { providers: Provider[]; connected: string[] } }
  | { type: 'mcp:status'; data: Record<string, MCPStatus> }
  | { type: 'error'; data: { message: string } };
