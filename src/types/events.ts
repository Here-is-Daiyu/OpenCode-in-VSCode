/**
 * Internal event types for the extension's event bus
 */

import type { Session, MessageWithParts, SessionStatus, Part, PermissionRequest, Question, Todo, OpenCodeConfig, Provider } from './opencode';

export type EventType =
  | 'server:connected'
  | 'server:disconnected'
  | 'server:error'
  | 'session:created'
  | 'session:updated'
  | 'session:deleted'
  | 'session:status'
  | 'session:idle'
  | 'session:diff'
  | 'message:updated'
  | 'message:partUpdated'
  | 'message:partDelta'
  | 'message:removed'
  | 'permission:asked'
  | 'permission:replied'
  | 'question:asked'
  | 'question:replied'
  | 'todo:updated'
  | 'config:updated'
  | 'file:edited'
  | 'project:updated';

export interface EventPayloads {
  'server:connected': { version: string };
  'server:disconnected': { reason?: string };
  'server:error': { error: string };
  'session:created': Session;
  'session:updated': Session;
  'session:deleted': { id: string };
  'session:status': { sessionID: string; status: SessionStatus };
  'session:idle': { sessionID: string };
  'session:diff': { sessionID: string; diffs: import('./opencode').FileDiff[] };
  'message:updated': MessageWithParts;
  'message:partUpdated': { sessionID: string; messageID: string; part: Part };
  'message:partDelta': { sessionID: string; messageID: string; partID: string; delta: string };
  'message:removed': { sessionID: string; messageID: string };
  'permission:asked': PermissionRequest;
  'permission:replied': { id: string; response: string };
  'question:asked': Question;
  'question:replied': { id: string; answer: string };
  'todo:updated': { sessionID: string; todos: Todo[] };
  'config:updated': OpenCodeConfig;
  'file:edited': { path: string; content: string };
  'project:updated': { id: string; name: string };
}
