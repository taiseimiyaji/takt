import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runAgent } from '../agents/runner.js';
import { parseParts } from '../core/piece/engine/task-decomposer.js';
import { detectJudgeIndex } from '../agents/judge-utils.js';
import {
  executeAgent,
  generateReport,
  executePart,
  evaluateCondition,
  judgeStatus,
  decomposeTask,
} from '../core/piece/agent-usecases.js';

vi.mock('../agents/runner.js', () => ({
  runAgent: vi.fn(),
}));

vi.mock('../core/piece/schema-loader.js', () => ({
  loadJudgmentSchema: vi.fn(() => ({ type: 'judgment' })),
  loadEvaluationSchema: vi.fn(() => ({ type: 'evaluation' })),
  loadDecompositionSchema: vi.fn((maxParts: number) => ({ type: 'decomposition', maxParts })),
}));

vi.mock('../core/piece/engine/task-decomposer.js', () => ({
  parseParts: vi.fn(),
}));

vi.mock('../agents/judge-utils.js', () => ({
  buildJudgePrompt: vi.fn(() => 'judge prompt'),
  detectJudgeIndex: vi.fn(() => -1),
}));

function doneResponse(content: string, structuredOutput?: Record<string, unknown>) {
  return {
    persona: 'tester',
    status: 'done' as const,
    content,
    timestamp: new Date('2026-02-12T00:00:00Z'),
    structuredOutput,
  };
}

describe('agent-usecases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('executeAgent/generateReport/executePart は runAgent に委譲する', async () => {
    vi.mocked(runAgent).mockResolvedValue(doneResponse('ok'));

    await executeAgent('coder', 'do work', { cwd: '/tmp' });
    await generateReport('coder', 'write report', { cwd: '/tmp' });
    await executePart('coder', 'part work', { cwd: '/tmp' });

    expect(runAgent).toHaveBeenCalledTimes(3);
    expect(runAgent).toHaveBeenNthCalledWith(1, 'coder', 'do work', { cwd: '/tmp' });
    expect(runAgent).toHaveBeenNthCalledWith(2, 'coder', 'write report', { cwd: '/tmp' });
    expect(runAgent).toHaveBeenNthCalledWith(3, 'coder', 'part work', { cwd: '/tmp' });
  });

  it('evaluateCondition は構造化出力の matched_index を優先する', async () => {
    vi.mocked(runAgent).mockResolvedValue(doneResponse('ignored', { matched_index: 2 }));

    const result = await evaluateCondition('agent output', [
      { index: 0, text: 'first' },
      { index: 1, text: 'second' },
    ], { cwd: '/repo' });

    expect(result).toBe(1);
    expect(runAgent).toHaveBeenCalledWith(undefined, 'judge prompt', expect.objectContaining({
      cwd: '/repo',
      outputSchema: { type: 'evaluation' },
    }));
  });

  it('evaluateCondition は構造化出力が使えない場合にタグ検出へフォールバックする', async () => {
    vi.mocked(runAgent).mockResolvedValue(doneResponse('[JUDGE:2]'));
    vi.mocked(detectJudgeIndex).mockReturnValue(1);

    const result = await evaluateCondition('agent output', [
      { index: 0, text: 'first' },
      { index: 1, text: 'second' },
    ], { cwd: '/repo' });

    expect(result).toBe(1);
    expect(detectJudgeIndex).toHaveBeenCalledWith('[JUDGE:2]');
  });

  it('judgeStatus は単一ルール時に auto_select を返す', async () => {
    const result = await judgeStatus('instruction', [{ condition: 'always', next: 'done' }], {
      cwd: '/repo',
      movementName: 'review',
    });

    expect(result).toEqual({ ruleIndex: 0, method: 'auto_select' });
    expect(runAgent).not.toHaveBeenCalled();
  });

  it('judgeStatus は構造化出力 step を採用する', async () => {
    vi.mocked(runAgent).mockResolvedValue(doneResponse('x', { step: 2 }));

    const result = await judgeStatus('instruction', [
      { condition: 'a', next: 'one' },
      { condition: 'b', next: 'two' },
    ], {
      cwd: '/repo',
      movementName: 'review',
    });

    expect(result).toEqual({ ruleIndex: 1, method: 'structured_output' });
  });

  it('judgeStatus はタグフォールバックを使う', async () => {
    vi.mocked(runAgent).mockResolvedValue(doneResponse('[REVIEW:2]'));

    const result = await judgeStatus('instruction', [
      { condition: 'a', next: 'one' },
      { condition: 'b', next: 'two' },
    ], {
      cwd: '/repo',
      movementName: 'review',
    });

    expect(result).toEqual({ ruleIndex: 1, method: 'phase3_tag' });
  });

  it('judgeStatus は最終手段として AI Judge を使う', async () => {
    vi.mocked(runAgent)
      .mockResolvedValueOnce(doneResponse('no match'))
      .mockResolvedValueOnce(doneResponse('ignored', { matched_index: 2 }));

    const result = await judgeStatus('instruction', [
      { condition: 'a', next: 'one' },
      { condition: 'b', next: 'two' },
    ], {
      cwd: '/repo',
      movementName: 'review',
    });

    expect(result).toEqual({ ruleIndex: 1, method: 'ai_judge' });
    expect(runAgent).toHaveBeenCalledTimes(2);
  });

  it('decomposeTask は構造化出力 parts を返す', async () => {
    vi.mocked(runAgent).mockResolvedValue(doneResponse('x', {
      parts: [
        { id: 'p1', title: 'Part 1', instruction: 'Do 1', timeout_ms: 1000 },
      ],
    }));

    const result = await decomposeTask('instruction', 3, { cwd: '/repo', persona: 'team-leader' });

    expect(result).toEqual([
      { id: 'p1', title: 'Part 1', instruction: 'Do 1', timeoutMs: 1000 },
    ]);
    expect(parseParts).not.toHaveBeenCalled();
  });

  it('decomposeTask は構造化出力がない場合 parseParts にフォールバックする', async () => {
    vi.mocked(runAgent).mockResolvedValue(doneResponse('```json [] ```'));
    vi.mocked(parseParts).mockReturnValue([
      { id: 'p1', title: 'Part 1', instruction: 'fallback', timeoutMs: undefined },
    ]);

    const result = await decomposeTask('instruction', 2, { cwd: '/repo' });

    expect(parseParts).toHaveBeenCalledWith('```json [] ```', 2);
    expect(result).toEqual([
      { id: 'p1', title: 'Part 1', instruction: 'fallback', timeoutMs: undefined },
    ]);
  });

  it('decomposeTask は done 以外をエラーにする', async () => {
    vi.mocked(runAgent).mockResolvedValue({
      persona: 'team-leader',
      status: 'error',
      content: 'failure',
      error: 'bad output',
      timestamp: new Date('2026-02-12T00:00:00Z'),
    });

    await expect(decomposeTask('instruction', 2, { cwd: '/repo' }))
      .rejects.toThrow('Team leader failed: bad output');
  });
});
