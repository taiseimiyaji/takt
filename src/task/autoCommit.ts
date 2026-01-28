/**
 * Auto-commit for worktree tasks
 *
 * After a successful workflow completion in a worktree,
 * automatically stages all changes and creates a commit.
 * No co-author trailer is added.
 */

import { execFileSync } from 'node:child_process';
import { createLogger } from '../utils/debug.js';

const log = createLogger('autoCommit');

export interface AutoCommitResult {
  /** Whether the commit was created successfully */
  success: boolean;
  /** The short commit hash (if committed) */
  commitHash?: string;
  /** Human-readable message */
  message: string;
}

/**
 * Auto-commit all changes in a worktree directory.
 *
 * Steps:
 * 1. Stage all changes (git add -A)
 * 2. Check if there are staged changes (git status --porcelain)
 * 3. If changes exist, create a commit with "takt: {taskName}"
 *
 * @param worktreeCwd - The worktree directory
 * @param taskName - Task name used in commit message
 */
export function autoCommitWorktree(worktreeCwd: string, taskName: string): AutoCommitResult {
  log.info('Auto-commit starting', { cwd: worktreeCwd, taskName });

  try {
    // Stage all changes
    execFileSync('git', ['add', '-A'], {
      cwd: worktreeCwd,
      stdio: 'pipe',
    });

    // Check if there are staged changes
    const statusOutput = execFileSync('git', ['status', '--porcelain'], {
      cwd: worktreeCwd,
      stdio: 'pipe',
      encoding: 'utf-8',
    });

    if (!statusOutput.trim()) {
      log.info('No changes to commit');
      return { success: true, message: 'No changes to commit' };
    }

    // Create commit (no co-author)
    const commitMessage = `takt: ${taskName}`;
    execFileSync('git', ['commit', '-m', commitMessage], {
      cwd: worktreeCwd,
      stdio: 'pipe',
    });

    // Get the short commit hash
    const commitHash = execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      cwd: worktreeCwd,
      stdio: 'pipe',
      encoding: 'utf-8',
    }).trim();

    log.info('Auto-commit created', { commitHash, message: commitMessage });

    return {
      success: true,
      commitHash,
      message: `Committed: ${commitHash} - ${commitMessage}`,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    log.error('Auto-commit failed', { error: errorMessage });

    return {
      success: false,
      message: `Auto-commit failed: ${errorMessage}`,
    };
  }
}
