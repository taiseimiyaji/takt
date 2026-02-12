/**
 * TAKT - TAKT Agent Koordination Topology
 *
 * This module exports the public API for programmatic usage.
 */

// Models
export * from './core/models/index.js';

// Configuration (PermissionMode excluded to avoid name conflict with core/models PermissionMode)
export * from './infra/config/paths.js';
export * from './infra/config/loaders/index.js';
export * from './infra/config/global/index.js';
export {
  loadProjectConfig,
  saveProjectConfig,
  updateProjectConfig,
  getCurrentPiece,
  setCurrentPiece,
  isVerboseMode,
  type ProjectLocalConfig,
  writeFileAtomic,
  getInputHistoryPath,
  MAX_INPUT_HISTORY,
  loadInputHistory,
  saveInputHistory,
  addToInputHistory,
  type PersonaSessionData,
  getPersonaSessionsPath,
  loadPersonaSessions,
  savePersonaSessions,
  updatePersonaSession,
  clearPersonaSessions,
  getWorktreeSessionsDir,
  encodeWorktreePath,
  getWorktreeSessionPath,
  loadWorktreeSessions,
  updateWorktreeSession,
  getClaudeProjectSessionsDir,
  clearClaudeProjectSessions,
} from './infra/config/project/index.js';

// Claude integration
export {
  ClaudeClient,
  ClaudeProcess,
  QueryExecutor,
  QueryRegistry,
  executeClaudeCli,
  executeClaudeQuery,
  generateQueryId,
  hasActiveProcess,
  isQueryActive,
  getActiveQueryCount,
  registerQuery,
  unregisterQuery,
  interruptQuery,
  interruptAllQueries,
  interruptCurrentProcess,
  sdkMessageToStreamEvent,
  createCanUseToolCallback,
  createAskUserQuestionHooks,
  buildSdkOptions,
} from './infra/claude/index.js';
export type {
  StreamEvent,
  StreamCallback,
  PermissionRequest,
  PermissionHandler,
  AskUserQuestionInput,
  AskUserQuestionHandler,
  ClaudeResult,
  ClaudeResultWithQueryId,
  ClaudeCallOptions,
  ClaudeSpawnOptions,
  InitEventData,
  ToolUseEventData,
  ToolResultEventData,
  ToolOutputEventData,
  TextEventData,
  ThinkingEventData,
  ResultEventData,
  ErrorEventData,
} from './infra/claude/index.js';

// Codex integration
export { CodexClient, mapToCodexSandboxMode } from './infra/codex/index.js';
export type { CodexCallOptions, CodexSandboxMode } from './infra/codex/index.js';

// Agent execution
export * from './agents/index.js';

// Piece engine
export {
  PieceEngine,
  COMPLETE_MOVEMENT,
  ABORT_MOVEMENT,
  ERROR_MESSAGES,
  determineNextMovementByRules,
  extractBlockedPrompt,
  LoopDetector,
  createInitialState,
  addUserInput,
  getPreviousOutput,
  handleBlocked,
  ParallelLogger,
  InstructionBuilder,
  isOutputContractItem,
  ReportInstructionBuilder,
  StatusJudgmentBuilder,
  buildEditRule,
  RuleEvaluator,
  evaluateAggregateConditions,
  AggregateEvaluator,
  needsStatusJudgmentPhase,
  executeAgent,
  generateReport,
  executePart,
  judgeStatus,
  evaluateCondition,
  decomposeTask,
} from './core/piece/index.js';
export type {
  PieceEvents,
  UserInputRequest,
  IterationLimitRequest,
  SessionUpdateCallback,
  IterationLimitCallback,
  PieceEngineOptions,
  LoopCheckResult,
  ProviderType,
  RuleMatch,
  RuleEvaluatorContext,
  JudgeStatusResult,
  ReportInstructionContext,
  StatusJudgmentContext,
  InstructionContext,
  StatusRulesComponents,
  BlockedHandlerResult,
} from './core/piece/index.js';

// Utilities
export * from './shared/utils/index.js';
export * from './shared/ui/index.js';
export * from './shared/prompt/index.js';
export * from './shared/constants.js';
export * from './shared/context.js';
export * from './shared/exitCodes.js';

// Resources (embedded prompts and templates)
export * from './infra/resources/index.js';
