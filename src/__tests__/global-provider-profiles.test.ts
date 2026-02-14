import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { vi } from 'vitest';

const testHomeDir = join(tmpdir(), `takt-gpp-test-${Date.now()}`);

vi.mock('node:os', async () => {
  const actual = await vi.importActual('node:os');
  return {
    ...actual,
    homedir: () => testHomeDir,
  };
});

const { loadGlobalConfig, saveGlobalConfig, invalidateGlobalConfigCache } = await import('../infra/config/global/globalConfig.js');
const { getGlobalConfigPath } = await import('../infra/config/paths.js');

describe('global provider_profiles', () => {
  beforeEach(() => {
    invalidateGlobalConfigCache();
    mkdirSync(testHomeDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testHomeDir)) {
      rmSync(testHomeDir, { recursive: true });
    }
  });

  it('loads provider_profiles from yaml', () => {
    const taktDir = join(testHomeDir, '.takt');
    mkdirSync(taktDir, { recursive: true });
    writeFileSync(
      getGlobalConfigPath(),
      [
        'language: en',
        'provider_profiles:',
        '  codex:',
        '    default_permission_mode: full',
        '    movement_permission_overrides:',
        '      ai_fix: edit',
      ].join('\n'),
      'utf-8',
    );

    const config = loadGlobalConfig();

    expect(config.providerProfiles?.codex?.defaultPermissionMode).toBe('full');
    expect(config.providerProfiles?.codex?.movementPermissionOverrides?.ai_fix).toBe('edit');
  });

  it('saves provider_profiles to yaml', () => {
    const taktDir = join(testHomeDir, '.takt');
    mkdirSync(taktDir, { recursive: true });
    writeFileSync(getGlobalConfigPath(), 'language: en\n', 'utf-8');

    const config = loadGlobalConfig();
    config.providerProfiles = {
      codex: {
        defaultPermissionMode: 'full',
        movementPermissionOverrides: {
          supervise: 'full',
        },
      },
    };
    saveGlobalConfig(config);
    invalidateGlobalConfigCache();

    const reloaded = loadGlobalConfig();
    expect(reloaded.providerProfiles?.codex?.defaultPermissionMode).toBe('full');
    expect(reloaded.providerProfiles?.codex?.movementPermissionOverrides?.supervise).toBe('full');
  });
});
