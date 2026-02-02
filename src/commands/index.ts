/**
 * Command exports
 */

export { executeWorkflow, type WorkflowExecutionResult, type WorkflowExecutionOptions } from './execution/workflowExecution.js';
export { executeTask, runAllTasks, type TaskExecutionOptions } from './execution/taskExecution.js';
export { addTask } from './management/addTask.js';
export { ejectBuiltin } from './management/eject.js';
export { watchTasks } from './management/watchTasks.js';
export { withAgentSession } from './execution/session.js';
export { switchWorkflow } from './management/workflow.js';
export { switchConfig, getCurrentPermissionMode, setPermissionMode, type PermissionMode } from './management/config.js';
export { listTasks } from './management/listTasks.js';
export { interactiveMode } from './interactive/interactive.js';
export { executePipeline, type PipelineExecutionOptions } from './execution/pipelineExecution.js';
export {
  selectAndExecuteTask,
  confirmAndCreateWorktree,
  type SelectAndExecuteOptions,
  type WorktreeConfirmationResult,
} from './execution/selectAndExecute.js';
