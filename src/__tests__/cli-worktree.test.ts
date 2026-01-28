/**
 * Tests for confirmAndCreateWorktree (CLI worktree confirmation flow)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies before importing the module under test
vi.mock('../prompt/index.js', () => ({
  confirm: vi.fn(),
  selectOptionWithDefault: vi.fn(),
}));

vi.mock('../task/worktree.js', () => ({
  createWorktree: vi.fn(),
}));

vi.mock('../task/autoCommit.js', () => ({
  autoCommitWorktree: vi.fn(),
}));

vi.mock('../task/summarize.js', () => ({
  summarizeTaskName: vi.fn(),
}));

vi.mock('../utils/ui.js', () => ({
  info: vi.fn(),
  error: vi.fn(),
  success: vi.fn(),
  header: vi.fn(),
  status: vi.fn(),
  setLogLevel: vi.fn(),
}));

vi.mock('../utils/debug.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  }),
  initDebugLogger: vi.fn(),
  setVerboseConsole: vi.fn(),
  getDebugLogFile: vi.fn(),
}));

vi.mock('../config/index.js', () => ({
  initGlobalDirs: vi.fn(),
  initProjectDirs: vi.fn(),
  loadGlobalConfig: vi.fn(() => ({ logLevel: 'info' })),
  getEffectiveDebugConfig: vi.fn(),
}));

vi.mock('../config/paths.js', () => ({
  clearAgentSessions: vi.fn(),
  getCurrentWorkflow: vi.fn(() => 'default'),
  isVerboseMode: vi.fn(() => false),
}));

vi.mock('../commands/index.js', () => ({
  executeTask: vi.fn(),
  runAllTasks: vi.fn(),
  showHelp: vi.fn(),
  switchWorkflow: vi.fn(),
  switchConfig: vi.fn(),
  addTask: vi.fn(),
  refreshBuiltin: vi.fn(),
  watchTasks: vi.fn(),
  reviewTasks: vi.fn(),
}));

vi.mock('../config/workflowLoader.js', () => ({
  listWorkflows: vi.fn(() => []),
}));

vi.mock('../constants.js', () => ({
  DEFAULT_WORKFLOW_NAME: 'default',
}));

import { confirm } from '../prompt/index.js';
import { createWorktree } from '../task/worktree.js';
import { summarizeTaskName } from '../task/summarize.js';
import { info } from '../utils/ui.js';
import { confirmAndCreateWorktree } from '../cli.js';

const mockConfirm = vi.mocked(confirm);
const mockCreateWorktree = vi.mocked(createWorktree);
const mockSummarizeTaskName = vi.mocked(summarizeTaskName);
const mockInfo = vi.mocked(info);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('confirmAndCreateWorktree', () => {
  it('should return original cwd when user declines worktree creation', async () => {
    // Given: user says "no" to worktree creation
    mockConfirm.mockResolvedValue(false);

    // When
    const result = await confirmAndCreateWorktree('/project', 'fix-auth');

    // Then
    expect(result.execCwd).toBe('/project');
    expect(result.isWorktree).toBe(false);
    expect(mockCreateWorktree).not.toHaveBeenCalled();
    expect(mockSummarizeTaskName).not.toHaveBeenCalled();
  });

  it('should create worktree and return worktree path when user confirms', async () => {
    // Given: user says "yes" to worktree creation
    mockConfirm.mockResolvedValue(true);
    mockSummarizeTaskName.mockResolvedValue('fix-auth');
    mockCreateWorktree.mockReturnValue({
      path: '/project/.takt/worktrees/20260128T0504-fix-auth',
      branch: 'takt/20260128T0504-fix-auth',
    });

    // When
    const result = await confirmAndCreateWorktree('/project', 'fix-auth');

    // Then
    expect(result.execCwd).toBe('/project/.takt/worktrees/20260128T0504-fix-auth');
    expect(result.isWorktree).toBe(true);
    expect(mockSummarizeTaskName).toHaveBeenCalledWith('fix-auth', { cwd: '/project' });
    expect(mockCreateWorktree).toHaveBeenCalledWith('/project', {
      worktree: true,
      taskSlug: 'fix-auth',
    });
  });

  it('should display worktree info when created', async () => {
    // Given
    mockConfirm.mockResolvedValue(true);
    mockSummarizeTaskName.mockResolvedValue('my-task');
    mockCreateWorktree.mockReturnValue({
      path: '/project/.takt/worktrees/20260128T0504-my-task',
      branch: 'takt/20260128T0504-my-task',
    });

    // When
    await confirmAndCreateWorktree('/project', 'my-task');

    // Then
    expect(mockInfo).toHaveBeenCalledWith(
      'Worktree created: /project/.takt/worktrees/20260128T0504-my-task (branch: takt/20260128T0504-my-task)'
    );
  });

  it('should call confirm with default=false', async () => {
    // Given
    mockConfirm.mockResolvedValue(false);

    // When
    await confirmAndCreateWorktree('/project', 'task');

    // Then
    expect(mockConfirm).toHaveBeenCalledWith('Create worktree?', false);
  });

  it('should summarize Japanese task name to English slug', async () => {
    // Given: Japanese task name, AI summarizes to English
    mockConfirm.mockResolvedValue(true);
    mockSummarizeTaskName.mockResolvedValue('add-auth');
    mockCreateWorktree.mockReturnValue({
      path: '/project/.takt/worktrees/20260128T0504-add-auth',
      branch: 'takt/20260128T0504-add-auth',
    });

    // When
    await confirmAndCreateWorktree('/project', '認証機能を追加する');

    // Then
    expect(mockSummarizeTaskName).toHaveBeenCalledWith('認証機能を追加する', { cwd: '/project' });
    expect(mockCreateWorktree).toHaveBeenCalledWith('/project', {
      worktree: true,
      taskSlug: 'add-auth',
    });
  });

  it('should show generating message when creating worktree', async () => {
    // Given
    mockConfirm.mockResolvedValue(true);
    mockSummarizeTaskName.mockResolvedValue('test-task');
    mockCreateWorktree.mockReturnValue({
      path: '/project/.takt/worktrees/20260128T0504-test-task',
      branch: 'takt/20260128T0504-test-task',
    });

    // When
    await confirmAndCreateWorktree('/project', 'テストタスク');

    // Then
    expect(mockInfo).toHaveBeenCalledWith('Generating branch name...');
  });
});
