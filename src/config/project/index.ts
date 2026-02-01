/**
 * Project configuration - barrel exports
 */

export {
  loadProjectConfig,
  saveProjectConfig,
  updateProjectConfig,
  getCurrentWorkflow,
  setCurrentWorkflow,
  isVerboseMode,
  type PermissionMode,
  type ProjectPermissionMode,
  type ProjectLocalConfig,
} from './projectConfig.js';

export {
  writeFileAtomic,
  getInputHistoryPath,
  MAX_INPUT_HISTORY,
  loadInputHistory,
  saveInputHistory,
  addToInputHistory,
  type AgentSessionData,
  getAgentSessionsPath,
  loadAgentSessions,
  saveAgentSessions,
  updateAgentSession,
  clearAgentSessions,
  getWorktreeSessionsDir,
  encodeWorktreePath,
  getWorktreeSessionPath,
  loadWorktreeSessions,
  updateWorktreeSession,
  getClaudeProjectSessionsDir,
  clearClaudeProjectSessions,
} from './sessionStore.js';
