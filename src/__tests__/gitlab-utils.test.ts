/**
 * Tests for gitlab/utils module
 *
 * Tests parseJson, checkGlabCli, and fetchAllPages.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockExecFileSync = vi.fn();
vi.mock('node:child_process', () => ({
  execFileSync: (...args: unknown[]) => mockExecFileSync(...args),
}));

import { parseJson, checkGlabCli, fetchAllPages } from '../infra/gitlab/utils.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('parseJson', () => {
  it('有効な JSON をパースする', () => {
    const result = parseJson<{ key: string }>('{"key":"value"}', 'test');
    expect(result).toEqual({ key: 'value' });
  });

  it('無効な JSON の場合はコンテキスト付きエラーをスローする', () => {
    expect(() => parseJson('not json', 'test context')).toThrow(
      'glab returned invalid JSON (test context)',
    );
  });
});

describe('checkGlabCli', () => {
  it('glab auth status が成功する場合は available: true を返す', () => {
    mockExecFileSync.mockReturnValue('');
    const result = checkGlabCli();
    expect(result).toEqual({ available: true });
  });

  it('glab auth status が失敗し glab --version が成功する場合は認証エラーを返す', () => {
    mockExecFileSync
      .mockImplementationOnce(() => { throw new Error('not logged in'); })
      .mockReturnValueOnce('glab version 1.36.0');
    const result = checkGlabCli();
    expect(result.available).toBe(false);
    expect(result.error).toContain('not authenticated');
  });

  it('両方失敗する場合はインストールエラーを返す', () => {
    mockExecFileSync
      .mockImplementationOnce(() => { throw new Error('command not found'); })
      .mockImplementationOnce(() => { throw new Error('command not found'); });
    const result = checkGlabCli();
    expect(result.available).toBe(false);
    expect(result.error).toContain('not installed');
  });
});

describe('fetchAllPages', () => {
  it('1ページで完了する場合はそのまま返す', () => {
    const items = [{ id: 1 }, { id: 2 }];
    mockExecFileSync.mockReturnValueOnce(JSON.stringify(items));

    const result = fetchAllPages<{ id: number }>('projects/:id/issues/1/notes', 100, 'test');

    expect(result).toEqual(items);
    expect(mockExecFileSync).toHaveBeenCalledTimes(1);
  });

  it('複数ページを取得する', () => {
    const page1 = Array.from({ length: 100 }, (_, i) => ({ id: i }));
    const page2 = [{ id: 100 }, { id: 101 }];
    mockExecFileSync
      .mockReturnValueOnce(JSON.stringify(page1))
      .mockReturnValueOnce(JSON.stringify(page2));

    const result = fetchAllPages<{ id: number }>('projects/:id/issues/1/notes', 100, 'test');

    expect(result).toHaveLength(102);
    expect(mockExecFileSync).toHaveBeenCalledTimes(2);
  });

  it('page パラメータが正しく増加する', () => {
    const page1 = Array.from({ length: 10 }, (_, i) => ({ id: i }));
    const page2 = [{ id: 10 }];
    mockExecFileSync
      .mockReturnValueOnce(JSON.stringify(page1))
      .mockReturnValueOnce(JSON.stringify(page2));

    fetchAllPages<{ id: number }>('projects/:id/test', 10, 'test');

    const call1 = mockExecFileSync.mock.calls[0];
    expect((call1[1] as string[])[1]).toContain('page=1');
    const call2 = mockExecFileSync.mock.calls[1];
    expect((call2[1] as string[])[1]).toContain('page=2');
  });

  it('MAX_PAGES(100) に達するとループを終了する', () => {
    // Every page returns exactly perPage items (would loop forever without MAX_PAGES)
    const fullPage = Array.from({ length: 5 }, (_, i) => ({ id: i }));
    mockExecFileSync.mockReturnValue(JSON.stringify(fullPage));

    const result = fetchAllPages<{ id: number }>('projects/:id/test', 5, 'test');

    // Should stop at 100 pages
    expect(mockExecFileSync).toHaveBeenCalledTimes(100);
    expect(result).toHaveLength(500); // 5 items * 100 pages
  });

  it('endpoint に既にクエリパラメータがある場合は & で結合する', () => {
    mockExecFileSync.mockReturnValueOnce(JSON.stringify([]));

    fetchAllPages<unknown>('projects/:id/test?sort=asc', 50, 'test');

    const call = mockExecFileSync.mock.calls[0];
    const apiPath = (call[1] as string[])[1];
    expect(apiPath).toContain('?sort=asc&per_page=50&page=1');
  });

  it('endpoint にクエリパラメータがない場合は ? で結合する', () => {
    mockExecFileSync.mockReturnValueOnce(JSON.stringify([]));

    fetchAllPages<unknown>('projects/:id/test', 50, 'test');

    const call = mockExecFileSync.mock.calls[0];
    const apiPath = (call[1] as string[])[1];
    expect(apiPath).toContain('projects/:id/test?per_page=50&page=1');
  });

  it('不正な JSON の場合はコンテキスト付きエラーをスローする', () => {
    mockExecFileSync.mockReturnValueOnce('invalid');

    expect(() => fetchAllPages<unknown>('endpoint', 50, 'my context')).toThrow(
      'glab returned invalid JSON (my context)',
    );
  });
});

describe('dead-reexport prevention', () => {
  it('issue.ts は checkGlabCli を re-export しない', async () => {
    const issueModule = await import('../infra/gitlab/issue.js');
    const exportedKeys = Object.keys(issueModule);
    expect(exportedKeys).not.toContain('checkGlabCli');
  });
});
