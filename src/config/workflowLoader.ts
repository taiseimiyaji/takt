/**
 * Re-export shim — actual implementation in loaders/workflowLoader.ts
 */
export {
  getBuiltinWorkflow,
  loadWorkflow,
  loadWorkflowByIdentifier,
  isWorkflowPath,
  loadAllWorkflows,
  listWorkflows,
} from './loaders/workflowLoader.js';
