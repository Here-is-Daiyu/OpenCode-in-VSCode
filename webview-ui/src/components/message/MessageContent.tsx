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
} from '../../types/opencode';

import { TextPart } from './parts/TextPart';
import { ReasoningPart } from './parts/ReasoningPart';
import { ToolCallPart } from './parts/ToolCallPart';
import { ContextToolGroup, isContextTool } from './parts/ContextToolGroup';
import { StepStartIndicator, StepFinishIndicator } from './parts/StepIndicator';
import { FilePart } from './parts/FilePart';

interface MessageContentProps {
  parts: Part[];
  isUser: boolean;
  isStreaming?: boolean;
}

/** Represents a renderable chunk after grouping. */
type RenderChunk =
  | { kind: 'text'; id: string; text: string }
  | { kind: 'reasoning'; id: string; text: string; isStreaming?: boolean }
  | { kind: 'tool'; id: string; part: ToolPart }
  | { kind: 'context-group'; id: string; tools: ToolPart[] }
  | { kind: 'step-start'; id: string; part: StepStartPart }
  | { kind: 'step-finish'; id: string; part: StepFinishPart }
  | { kind: 'file'; id: string; part: FilePartType };

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
    if (textBuffer) {
      chunks.push({ kind: 'text', id: textId || 'text', text: textBuffer });
      textBuffer = '';
      textId = '';
    }
  };

  const flushReasoning = () => {
    if (reasoningBuffer) {
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
        flushReasoning();
        flushContext();
        if (!textId) textId = part.id;
        textBuffer += (textBuffer ? '\n\n' : '') + part.text;
        break;

      case 'reasoning':
        flushText();
        flushContext();
        if (!reasoningId) reasoningId = part.id;
        reasoningBuffer += part.text;
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

      default:
        // subtask, snapshot, patch, agent, retry, compaction — skip for now
        break;
    }
  }

  flushText();
  flushReasoning();
  flushContext();

  return chunks;
}

export const MessageContent = React.memo(function MessageContent({
  parts,
  isUser,
  isStreaming,
}: MessageContentProps) {
  const chunks = useMemo(
    () => buildRenderChunks(parts ?? [], isStreaming),
    [parts, isStreaming],
  );

  return (
    <div className={`msg-content ${isUser ? 'msg-content--user' : 'msg-content--assistant'}`}>
      {chunks.map((chunk) => {
        switch (chunk.kind) {
          case 'text':
            return <TextPart key={chunk.id} text={chunk.text} />;
          case 'reasoning':
            return (
              <ReasoningPart
                key={chunk.id}
                text={chunk.text}
                isStreaming={chunk.isStreaming}
              />
            );
          case 'tool':
            return <ToolCallPart key={chunk.id} part={chunk.part} />;
          case 'context-group':
            return <ContextToolGroup key={chunk.id} tools={chunk.tools} />;
          case 'step-start':
            return <StepStartIndicator key={chunk.id} part={chunk.part} />;
          case 'step-finish':
            return <StepFinishIndicator key={chunk.id} part={chunk.part} />;
          case 'file':
            return <FilePart key={chunk.id} part={chunk.part} />;
          default:
            return null;
        }
      })}
    </div>
  );
});
