import { describe, expect, it } from 'vitest';
import { OptionsBuilder } from '../core/piece/engine/OptionsBuilder.js';
import type { PieceMovement } from '../core/models/types.js';
import type { PieceEngineOptions } from '../core/piece/types.js';

function createMovement(overrides: Partial<PieceMovement> = {}): PieceMovement {
  return {
    name: 'reviewers',
    personaDisplayName: 'Reviewers',
    instructionTemplate: 'review',
    passPreviousResponse: false,
    ...overrides,
  };
}

function createBuilder(step: PieceMovement, engineOverrides: Partial<PieceEngineOptions> = {}): OptionsBuilder {
  const engineOptions: PieceEngineOptions = {
    projectCwd: '/project',
    globalProvider: 'codex',
    globalProviderProfiles: {
      codex: {
        defaultPermissionMode: 'full',
      },
    },
    ...engineOverrides,
  };

  return new OptionsBuilder(
    engineOptions,
    () => '/project',
    () => '/project',
    () => undefined,
    () => '.takt/runs/sample/reports',
    () => 'ja',
    () => [{ name: step.name }],
    () => 'default',
    () => 'test piece',
  );
}

describe('OptionsBuilder.buildBaseOptions', () => {
  it('resolves permission mode using provider profiles', () => {
    const step = createMovement();
    const builder = createBuilder(step);

    const options = builder.buildBaseOptions(step);

    expect(options.permissionMode).toBe('full');
  });

  it('applies movement requiredPermissionMode as minimum floor', () => {
    const step = createMovement({ requiredPermissionMode: 'full' });
    const builder = createBuilder(step);

    const options = builder.buildBaseOptions(step);

    expect(options.permissionMode).toBe('full');
  });

  it('uses default profile when provider_profiles are not provided', () => {
    const step = createMovement();
    const builder = createBuilder(step, {
      globalProvider: undefined,
      globalProviderProfiles: undefined,
      projectProvider: undefined,
      provider: undefined,
    });

    const options = builder.buildBaseOptions(step);
    expect(options.permissionMode).toBe('edit');
  });
});

describe('OptionsBuilder.buildResumeOptions', () => {
  it('should enforce readonly permission and empty allowedTools for report/status phases', () => {
    // Given
    const step = createMovement({ requiredPermissionMode: 'full' });
    const builder = createBuilder(step);

    // When
    const options = builder.buildResumeOptions(step, 'session-123', { maxTurns: 3 });

    // Then
    expect(options.permissionMode).toBe('readonly');
    expect(options.allowedTools).toEqual([]);
    expect(options.maxTurns).toBe(3);
    expect(options.sessionId).toBe('session-123');
  });
});
