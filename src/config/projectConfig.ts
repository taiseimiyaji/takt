/**
 * Re-export shim — actual implementation in project/projectConfig.ts
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
} from './project/projectConfig.js';
