/**
 * StepIndicator - Renders step-start / step-finish boundaries.
 *
 * step-start: thin divider line
 * step-finish: intentionally hidden to avoid noisy inline token stats
 */

import React from 'react';
import type { StepStartPart, StepFinishPart } from '../../../types/opencode';

// ---------------------------------------------------------------------------
// StepStart
// ---------------------------------------------------------------------------

export const StepStartIndicator = React.memo(function StepStartIndicator(
  _props: { part: StepStartPart },
) {
  return null;
});

// ---------------------------------------------------------------------------
// StepFinish
// ---------------------------------------------------------------------------

interface StepFinishIndicatorProps {
  part: StepFinishPart;
}

export const StepFinishIndicator = React.memo(function StepFinishIndicator({
  part: _part,
}: StepFinishIndicatorProps) {
  return null;
});
