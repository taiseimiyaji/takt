/**
 * Workflow module public API
 *
 * This file exports all public types, functions, and classes
 * from the workflow module.
 */

// Main engine
export { WorkflowEngine } from './engine/index.js';

// Constants
export { COMPLETE_STEP, ABORT_STEP, ERROR_MESSAGES } from './constants.js';

// Types
export type {
  WorkflowEvents,
  UserInputRequest,
  IterationLimitRequest,
  SessionUpdateCallback,
  IterationLimitCallback,
  WorkflowEngineOptions,
  LoopCheckResult,
} from './types.js';

// Transitions
export { determineNextStepByRules, extractBlockedPrompt } from './transitions.js';

// Loop detection
export { LoopDetector } from './loop-detector.js';

// State management
export {
  createInitialState,
  addUserInput,
  getPreviousOutput,
} from './state-manager.js';

// Instruction building
export { InstructionBuilder, isReportObjectConfig } from './instruction/InstructionBuilder.js';
export { ReportInstructionBuilder, type ReportInstructionContext } from './instruction/ReportInstructionBuilder.js';
export { StatusJudgmentBuilder, type StatusJudgmentContext } from './instruction/StatusJudgmentBuilder.js';
export { buildExecutionMetadata, renderExecutionMetadata, type InstructionContext, type ExecutionMetadata } from './instruction-context.js';

// Rule evaluation
export { RuleEvaluator, type RuleMatch, type RuleEvaluatorContext, detectMatchedRule, evaluateAggregateConditions } from './evaluation/index.js';
export { AggregateEvaluator } from './evaluation/AggregateEvaluator.js';

// Blocked handling
export { handleBlocked, type BlockedHandlerResult } from './blocked-handler.js';
