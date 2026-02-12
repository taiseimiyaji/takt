import { describe, expect, it } from 'vitest';

describe('public API exports', () => {
  it('should expose piece usecases and engine public APIs', async () => {
    // Given: パッケージの公開API
    const api = await import('../index.js');

    // When: 主要なユースケース関数とエンジン公開APIを参照する
    // Then: 必要な公開シンボルが利用できる
    expect(typeof api.executeAgent).toBe('function');
    expect(typeof api.generateReport).toBe('function');
    expect(typeof api.executePart).toBe('function');
    expect(typeof api.judgeStatus).toBe('function');
    expect(typeof api.evaluateCondition).toBe('function');
    expect(typeof api.decomposeTask).toBe('function');

    expect(typeof api.PieceEngine).toBe('function');
    expect(typeof api.createInitialState).toBe('function');
    expect(typeof api.addUserInput).toBe('function');
    expect(typeof api.getPreviousOutput).toBe('function');
    expect(api.COMPLETE_MOVEMENT).toBeDefined();
    expect(api.ABORT_MOVEMENT).toBeDefined();
  });

  it('should not expose internal engine implementation details', async () => {
    // Given: パッケージの公開API
    const api = await import('../index.js');

    // When: 非公開にすべき内部シンボルの有無を確認する
    // Then: 内部実装詳細は公開されていない
    expect('AgentRunner' in api).toBe(false);
    expect('RuleEvaluator' in api).toBe(false);
    expect('AggregateEvaluator' in api).toBe(false);
    expect('evaluateAggregateConditions' in api).toBe(false);
    expect('needsStatusJudgmentPhase' in api).toBe(false);
    expect('StatusJudgmentBuilder' in api).toBe(false);
    expect('buildEditRule' in api).toBe(false);
    expect('detectRuleIndex' in api).toBe(false);
  });
});
