/**
 * ToolCallCard - Compatibility wrapper that delegates to the new ToolCallPart component.
 * Kept for any remaining imports; new code should use ToolCallPart directly.
 */

import React from 'react';
import type { ToolPart } from '../types/opencode';
import { ToolCallPart } from './message/parts/ToolCallPart';

interface ToolCallCardProps {
  part: ToolPart;
}

export function ToolCallCard({ part }: ToolCallCardProps) {
  return <ToolCallPart part={part} />;
}
