/**
 * Task execution module
 */

export {
  TaskRunner,
  type TaskInfo,
  type TaskResult,
} from './runner.js';

export { showTaskList } from './display.js';

export { TaskFileSchema, type TaskFileData } from './schema.js';
export { parseTaskFile, parseTaskFiles, type ParsedTask } from './parser.js';
export {
  createSharedClone,
  removeClone,
  createTempCloneForBranch,
  detectDefaultBranch,
  listTaktBranches,
  parseTaktBranches,
  getFilesChanged,
  extractTaskSlug,
  buildReviewItems,
  type WorktreeOptions,
  type WorktreeResult,
  type BranchInfo,
  type BranchReviewItem,
} from './worktree.js';
export { autoCommitAndPush, type AutoCommitResult } from './autoCommit.js';
export { TaskWatcher, type TaskWatcherOptions } from './watcher.js';
