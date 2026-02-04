/**
 * Shared rule utility functions used by both engine.ts and instruction-builder.ts.
 */

import type { PieceMovement } from '../../models/types.js';

/**
 * Check whether a movement has tag-based rules (i.e., rules that require
 * [MOVEMENT:N] tag output for detection).
 *
 * Returns false when all rules are ai() or aggregate conditions,
 * meaning no tag-based status output is needed.
 */
export function hasTagBasedRules(step: PieceMovement): boolean {
  if (!step.rules || step.rules.length === 0) return false;
  const allNonTagConditions = step.rules.every((r) => r.isAiCondition || r.isAggregateCondition);
  return !allNonTagConditions;
}
