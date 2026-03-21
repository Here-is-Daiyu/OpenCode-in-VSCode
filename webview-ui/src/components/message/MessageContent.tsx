/**
 * MessageContent - Dispatches parts to the appropriate renderers.
 *
 * Groups consecutive context tools (read/glob/grep/list) into a
 * ContextToolGroup for cleaner display.
 */

import React, { useMemo } from 'react';
import type {
  Part,
  ToolPart,
  StepStartPart,
  StepFinishPart,
  FilePart as FilePartType,
  SubtaskPart as SubtaskPartType,
  SnapshotPart,
  PatchPart,
  AgentPart,
  RetryPart,
  CompactionPart,
} from '../../types/opencode';

import { TextPart } from './parts/TextPart';
import { ReasoningPart } from './parts/ReasoningPart';
import { ToolCallPart } from './parts/ToolCallPart';
import { ContextToolGroup, isContextTool } from './parts/ContextToolGroup';
import { StepStartIndicator, StepFinishIndicator } from './parts/StepIndicator';
import { FilePart } from './parts/FilePart';
import { SubtaskPartComponent } from './parts/SubtaskPart';
import { SnapshotPartView } from './parts/SnapshotPart';
import { PatchPartView } from './parts/PatchPartView';
import { AgentPartView } from './parts/AgentPartView';
import { RetryPartView } from './parts/RetryPartView';
import { CompactionPartView } from './parts/CompactionPartView';

interface MessageContentProps {
  parts: Part[];
  isUser: boolean;
  isStreaming?: boolean;
}

/** Represents a renderable chunk after grouping. */
type RenderChunk =
  | { kind: 'text'; id: string; text: string; isStreaming?: boolean }
  | { kind: 'reasoning'; id: string; text: string; isStreaming?: boolean }
  | { kind: 'tool'; id: string; part: ToolPart }
  | { kind: 'context-group'; id: string; tools: ToolPart[] }
  | { kind: 'tool-group'; id: string; tools: ToolPart[] }
  | { kind: 'step-start'; id: string; part: StepStartPart }
  | { kind: 'step-finish'; id: string; part: StepFinishPart }
  | { kind: 'file'; id: string; part: FilePartType }
  | { kind: 'subtask'; id: string; part: SubtaskPartType }
  | { kind: 'snapshot'; id: string; part: SnapshotPart }
  | { kind: 'patch'; id: string; part: PatchPart }
  | { kind: 'agent-marker'; id: string; part: AgentPart }
  | { kind: 'retry'; id: string; part: RetryPart }
  | { kind: 'compaction'; id: string; part: CompactionPart };

function getPartText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/**
 * Groups consecutive context-tool parts into ContextToolGroup chunks,
 * and merges adjacent text/reasoning parts.
 */
function buildRenderChunks(parts: Part[], isStreaming?: boolean): RenderChunk[] {
  if (!parts || !Array.isArray(parts)) return [];
  const chunks: RenderChunk[] = [];
  let contextBuffer: ToolPart[] = [];
  let textBuffer = '';
  let textId = '';
  let reasoningBuffer = '';
  let reasoningId = '';

  const flushText = () => {
    if (textBuffer.trim()) {
      chunks.push({ kind: 'text', id: textId || 'text', text: textBuffer, isStreaming });
      textBuffer = '';
      textId = '';
    }
  };

  const flushReasoning = () => {
    if (reasoningBuffer.trim()) {
      chunks.push({
        kind: 'reasoning',
        id: reasoningId || 'reasoning',
        text: reasoningBuffer,
        isStreaming,
      });
      reasoningBuffer = '';
      reasoningId = '';
    }
  };

  const flushContext = () => {
    if (contextBuffer.length > 0) {
      if (contextBuffer.length === 1) {
        // Single context tool: render inline, not grouped
        chunks.push({ kind: 'tool', id: contextBuffer[0].id, part: contextBuffer[0] });
      } else {
        chunks.push({
          kind: 'context-group',
          id: `ctx_${contextBuffer[0].id}`,
          tools: [...contextBuffer],
        });
      }
      contextBuffer = [];
    }
  };

  for (const part of parts) {
    switch (part.type) {
      case 'text':
        if (!getPartText(part.text).trim()) {
          break;
        }
        flushReasoning();
        flushContext();
        if (!textId) textId = part.id;
        textBuffer += (textBuffer ? '\n\n' : '') + getPartText(part.text);
        break;

      case 'reasoning':
        if (!getPartText(part.text).trim()) {
          break;
        }
        flushText();
        flushContext();
        if (!reasoningId) reasoningId = part.id;
        reasoningBuffer += getPartText(part.text);
        break;

      case 'tool': {
        flushText();
        flushReasoning();
        if (isContextTool(part)) {
          contextBuffer.push(part);
        } else {
          flushContext();
          chunks.push({ kind: 'tool', id: part.id, part });
        }
        break;
      }

      case 'step-start':
        flushText();
        flushReasoning();
        flushContext();
        chunks.push({ kind: 'step-start', id: part.id, part });
        break;

      case 'step-finish':
        flushText();
        flushReasoning();
        flushContext();
        chunks.push({ kind: 'step-finish', id: part.id, part });
        break;

      case 'file':
        flushText();
        flushReasoning();
        flushContext();
        chunks.push({ kind: 'file', id: part.id, part });
        break;

      case 'subtask':
        flushText();
        flushReasoning();
        flushContext();
        chunks.push({ kind: 'subtask', id: part.id, part });
        break;

      case 'snapshot':
        flushText();
        flushReasoning();
        flushContext();
        chunks.push({ kind: 'snapshot', id: part.id, part });
        break;

      case 'patch':
        flushText();
        flushReasoning();
        flushContext();
        chunks.push({ kind: 'patch', id: part.id, part });
        break;

      case 'agent':
        flushText();
        flushReasoning();
        flushContext();
        chunks.push({ kind: 'agent-marker', id: part.id, part });
        break;

      case 'retry':
        flushText();
        flushReasoning();
        flushContext();
        chunks.push({ kind: 'retry', id: part.id, part });
        break;

      case 'compaction':
        flushText();
        flushReasoning();
        flushContext();
        chunks.push({ kind: 'compaction', id: part.id, part });
        break;

      default:
        break;
    }
  }

  flushText();
  flushReasoning();
  flushContext();

  return chunks;
}

/**
 * Groups 2+ consecutive non-context `tool` chunks into `tool-group` chunks
 * for timeline layout rendering. Single tool chunks remain as-is.
 */
function groupConsecutiveTools(chunks: RenderChunk[]): RenderChunk[] {
  const result: RenderChunk[] = [];
  let toolBuffer: ToolPart[] = [];

  const flushTools = () => {
    if (toolBuffer.length >= 2) {
      result.push({
        kind: 'tool-group',
        id: `tg_${toolBuffer[0].id}`,
        tools: [...toolBuffer],
      });
    } else if (toolBuffer.length === 1) {
      result.push({ kind: 'tool', id: toolBuffer[0].id, part: toolBuffer[0] });
    }
    toolBuffer = [];
  };

  for (const chunk of chunks) {
    if (chunk.kind === 'tool') {
      toolBuffer.push(chunk.part);
    } else {
      flushTools();
      result.push(chunk);
    }
  }
  flushTools();

  return result;
}

/**
 * Filter parts before rendering (matching official OpenCode web UI).
 * Removes step-finish, duplicate step-starts, etc.
 */
function filterParts(parts: Part[]): Part[] {
  return parts.filter((part, index) => {
    if (part.type === 'step-finish') return false;
    if (part.type === 'tool' && part.tool === 'todoread') return false;
    if (part.type === 'step-start' && index > 0) return false; // Only first step-start
    if (part.type === 'text' && 'synthetic' in part && (part as Record<string, unknown>).synthetic) return false;
    if (part.type === 'text' && !part.text) return false; // Empty text
    // Note: we still show running tools for streaming UX
    return true;
  });
}

export const MessageContent = React.memo(function MessageContent({
  parts,
  isUser,
  isStreaming,
}: MessageContentProps) {
  const filtered = useMemo(() => filterParts(parts ?? []), [parts]);
  const chunks = useMemo(
    () => groupConsecutiveTools(buildRenderChunks(filtered, isStreaming)),
    [filtered, isStreaming],
  );

  return (
    <div className={`msg-content ${isUser ? 'msg-content--user' : 'msg-content--assistant'}`}>
      {chunks.map((chunk) => {
        switch (chunk.kind) {
          case 'text':
            return (
              <TextPart
                key={chunk.id}
                text={chunk.text}
                cacheKey={chunk.id}
                isStreaming={chunk.isStreaming}
              />
            );
          case 'reasoning':
            return (
              <ReasoningPart
                key={chunk.id}
                text={chunk.text}
                isStreaming={chunk.isStreaming}
                cacheKey={chunk.id}
              />
            );
          case 'tool':
            return <ToolCallPart key={chunk.id} part={chunk.part} />;
          case 'tool-group':
            return (
              <div key={chunk.id} className="msg-tool-timeline">
                {chunk.tools.map((tool, i) => (
                  <ToolCallPart
                    key={tool.id}
                    part={tool}
                    isFirst={i === 0}
                    isLast={i === chunk.tools.length - 1}
                    timelineMode
                  />
                ))}
              </div>
            );
          case 'context-group':
            return <ContextToolGroup key={chunk.id} tools={chunk.tools} />;
          case 'step-start':
            return <StepStartIndicator key={chunk.id} part={chunk.part} />;
          case 'step-finish':
            return <StepFinishIndicator key={chunk.id} part={chunk.part} />;
          case 'file':
            return <FilePart key={chunk.id} part={chunk.part} />;
          case 'subtask':
            return <SubtaskPartComponent key={chunk.id} part={chunk.part} />;
          case 'snapshot':
            return <SnapshotPartView key={chunk.id} part={chunk.part} />;
          case 'patch':
            return <PatchPartView key={chunk.id} part={chunk.part} />;
          case 'agent-marker':
            return <AgentPartView key={chunk.id} part={chunk.part} />;
          case 'retry':
            return <RetryPartView key={chunk.id} part={chunk.part} isStreaming={isStreaming} />;
          case 'compaction':
            return <CompactionPartView key={chunk.id} part={chunk.part} />;
          default:
            return null;
        }
      })}
    </div>
  );
});
