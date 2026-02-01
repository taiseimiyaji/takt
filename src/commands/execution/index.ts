/**
 * Task/workflow execution commands.
 */

export { executeWorkflow, type WorkflowExecutionResult, type WorkflowExecutionOptions } from './workflowExecution.js';
export { executeTask, runAllTasks, executeAndCompleteTask, resolveTaskExecution, type TaskExecutionOptions } from './taskExecution.js';
export {
  selectAndExecuteTask,
  confirmAndCreateWorktree,
  type SelectAndExecuteOptions,
  type WorktreeConfirmationResult,
} from './selectAndExecute.js';
export { executePipeline, type PipelineExecutionOptions } from './pipelineExecution.js';
export { withAgentSession } from './session.js';
