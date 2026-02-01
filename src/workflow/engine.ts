/**
 * Re-export shim for backward compatibility.
 *
 * The actual implementation has been split into:
 * - engine/WorkflowEngine.ts — Main orchestration loop
 * - engine/StepExecutor.ts   — Single-step 3-phase execution
 * - engine/ParallelRunner.ts — Parallel step execution
 * - engine/OptionsBuilder.ts — RunAgentOptions construction
 */

export { WorkflowEngine } from './engine/WorkflowEngine.js';

// Re-export types for backward compatibility
export type {
  WorkflowEvents,
  UserInputRequest,
  IterationLimitRequest,
  SessionUpdateCallback,
  IterationLimitCallback,
  WorkflowEngineOptions,
} from './types.js';
export { COMPLETE_STEP, ABORT_STEP } from './constants.js';
