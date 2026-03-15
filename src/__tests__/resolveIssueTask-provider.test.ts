/**
 * Tests for resolveIssueTask in git/index.ts
 *
 * ARCH-003: resolveIssueTask was inlined into git/index.ts.
 * It uses getGitProvider() internally instead of accepting a callback.
 * Tests mock getGitProvider via vi.mock of the detect module and provider classes.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockExecFileSync = vi.fn();
vi.mock('node:child_process', () => ({
  execFileSync: (...args: unknown[]) => mockExecFileSync(...args),
}));

vi.mock('../shared/utils/index.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  createLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  }),
  getErrorMessage: (e: unknown) => String(e),
}));

// Mock config resolution to avoid file system access
vi.mock('../infra/config/resolveConfigValue.js', () => ({
  resolveConfigValue: () => undefined,
}));

// Mock detect to control which provider is returned
vi.mock('../infra/git/detect.js', () => ({
  detectVcsProvider: vi.fn().mockReturnValue('github'),
  VCS_PROVIDER_TYPES: ['github', 'gitlab'] as const,
}));

let resolveIssueTask: typeof import('../infra/git/index.js').resolveIssueTask;

beforeEach(async () => {
  vi.clearAllMocks();
  vi.resetModules();
  const mod = await import('../infra/git/index.js');
  resolveIssueTask = mod.resolveIssueTask;
});

describe('resolveIssueTask (inlined in git/index.ts)', () => {
  it('イシュー参照を解決する際に getGitProvider() 経由でプロバイダーを取得する', () => {
    // Given: gh auth status succeeds, gh issue view returns issue data
    mockExecFileSync
      .mockReturnValueOnce('') // gh auth status
      .mockReturnValueOnce(JSON.stringify({
        number: 42,
        title: 'Test Issue',
        body: 'Body text',
        labels: [],
        comments: [],
      }));

    // When
    const result = resolveIssueTask('#42');

    // Then
    expect(result).toContain('#42');
    expect(result).toContain('Test Issue');
  });

  it('CLI が利用不可の場合にエラーをスローする', () => {
    // Given: gh auth status fails, gh --version also fails
    mockExecFileSync
      .mockImplementationOnce(() => { throw new Error('not logged in'); })
      .mockImplementationOnce(() => { throw new Error('command not found'); });

    // When / Then
    expect(() => resolveIssueTask('#10')).toThrow();
  });

  it('イシュー参照でない文字列はプロバイダーを呼び出さずそのまま返す', () => {
    // When
    const result = resolveIssueTask('Fix the bug');

    // Then
    expect(result).toBe('Fix the bug');
    // No execFileSync calls for provider operations
    expect(mockExecFileSync).not.toHaveBeenCalled();
  });

  it('複数のイシュー参照を解決する', () => {
    // Given
    mockExecFileSync
      .mockReturnValueOnce('') // gh auth status
      .mockReturnValueOnce(JSON.stringify({
        number: 1,
        title: 'First issue',
        body: 'Body 1',
        labels: [],
        comments: [],
      }))
      .mockReturnValueOnce(JSON.stringify({
        number: 2,
        title: 'Second issue',
        body: 'Body 2',
        labels: [],
        comments: [],
      }));

    // When
    const result = resolveIssueTask('#1 #2');

    // Then
    expect(result).toContain('Issue #1');
    expect(result).toContain('Issue #2');
    expect(result).toContain('---');
  });
});
