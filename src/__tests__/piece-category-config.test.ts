/**
 * Tests for piece category configuration loading and building
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import type { PieceWithSource } from '../infra/config/index.js';

const pathsState = vi.hoisted(() => ({
  globalConfigPath: '',
  projectConfigPath: '',
  resourcesDir: '',
}));

vi.mock('../infra/config/paths.js', async (importOriginal) => {
  const original = await importOriginal() as Record<string, unknown>;
  return {
    ...original,
    getGlobalConfigPath: () => pathsState.globalConfigPath,
    getProjectConfigPath: () => pathsState.projectConfigPath,
  };
});

vi.mock('../infra/resources/index.js', async (importOriginal) => {
  const original = await importOriginal() as Record<string, unknown>;
  return {
    ...original,
    getLanguageResourcesDir: () => pathsState.resourcesDir,
  };
});

const pieceCategoriesState = vi.hoisted(() => ({
  categories: undefined as any,
  showOthersCategory: undefined as boolean | undefined,
  othersCategoryName: undefined as string | undefined,
}));

vi.mock('../infra/config/global/globalConfig.js', async (importOriginal) => {
  const original = await importOriginal() as Record<string, unknown>;
  return {
    ...original,
    getLanguage: () => 'en',
  };
});

vi.mock('../infra/config/global/pieceCategories.js', async (importOriginal) => {
  const original = await importOriginal() as Record<string, unknown>;
  return {
    ...original,
    getPieceCategoriesConfig: () => pieceCategoriesState.categories,
    getShowOthersCategory: () => pieceCategoriesState.showOthersCategory,
    getOthersCategoryName: () => pieceCategoriesState.othersCategoryName,
  };
});

const {
  getPieceCategories,
  loadDefaultCategories,
  buildCategorizedPieces,
  findPieceCategories,
} = await import('../infra/config/loaders/pieceCategories.js');

function writeYaml(path: string, content: string): void {
  writeFileSync(path, content.trim() + '\n', 'utf-8');
}

function createPieceMap(entries: { name: string; source: 'builtin' | 'user' | 'project' }[]):
  Map<string, PieceWithSource> {
  const pieces = new Map<string, PieceWithSource>();
  for (const entry of entries) {
    pieces.set(entry.name, {
      source: entry.source,
      config: {
        name: entry.name,
        movements: [],
        initialMovement: 'start',
        maxIterations: 1,
      },
    });
  }
  return pieces;
}

describe('piece category config loading', () => {
  let testDir: string;
  let resourcesDir: string;
  let globalConfigPath: string;
  let projectConfigPath: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `takt-cat-config-${randomUUID()}`);
    resourcesDir = join(testDir, 'resources');
    globalConfigPath = join(testDir, 'global-config.yaml');
    projectConfigPath = join(testDir, 'project-config.yaml');

    mkdirSync(resourcesDir, { recursive: true });
    pathsState.globalConfigPath = globalConfigPath;
    pathsState.projectConfigPath = projectConfigPath;
    pathsState.resourcesDir = resourcesDir;

    // Reset piece categories state
    pieceCategoriesState.categories = undefined;
    pieceCategoriesState.showOthersCategory = undefined;
    pieceCategoriesState.othersCategoryName = undefined;
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('should load default categories when no configs define piece_categories', () => {
    writeYaml(join(resourcesDir, 'default-categories.yaml'), `
piece_categories:
  Default:
    pieces:
      - simple
show_others_category: true
others_category_name: "Others"
`);

    const config = getPieceCategories(testDir);
    expect(config).not.toBeNull();
    expect(config!.pieceCategories).toEqual([
      { name: 'Default', pieces: ['simple'], children: [] },
    ]);
  });

  it('should prefer project config over default when piece_categories is defined', () => {
    writeYaml(join(resourcesDir, 'default-categories.yaml'), `
piece_categories:
  Default:
    pieces:
      - simple
`);

    writeYaml(projectConfigPath, `
piece_categories:
  Project:
    pieces:
      - custom
show_others_category: false
`);

    const config = getPieceCategories(testDir);
    expect(config).not.toBeNull();
    expect(config!.pieceCategories).toEqual([
      { name: 'Project', pieces: ['custom'], children: [] },
    ]);
    expect(config!.showOthersCategory).toBe(false);
  });

  it('should prefer user config over project config when piece_categories is defined', () => {
    writeYaml(join(resourcesDir, 'default-categories.yaml'), `
piece_categories:
  Default:
    pieces:
      - simple
`);

    writeYaml(projectConfigPath, `
piece_categories:
  Project:
    pieces:
      - custom
`);

    // Simulate user config from separate file
    pieceCategoriesState.categories = {
      User: {
        pieces: ['preferred'],
      },
    };

    const config = getPieceCategories(testDir);
    expect(config).not.toBeNull();
    expect(config!.pieceCategories).toEqual([
      { name: 'User', pieces: ['preferred'], children: [] },
    ]);
  });

  it('should ignore configs without piece_categories and fall back to default', () => {
    writeYaml(join(resourcesDir, 'default-categories.yaml'), `
piece_categories:
  Default:
    pieces:
      - simple
`);

    writeYaml(globalConfigPath, `
show_others_category: false
`);

    const config = getPieceCategories(testDir);
    expect(config).not.toBeNull();
    expect(config!.pieceCategories).toEqual([
      { name: 'Default', pieces: ['simple'], children: [] },
    ]);
  });

  it('should return null when default categories file is missing', () => {
    const config = loadDefaultCategories();
    expect(config).toBeNull();
  });
});

describe('buildCategorizedPieces', () => {
  it('should warn for missing pieces and generate Others', () => {
    const allPieces = createPieceMap([
      { name: 'a', source: 'user' },
      { name: 'b', source: 'user' },
      { name: 'c', source: 'builtin' },
    ]);
    const config = {
      pieceCategories: [
        {
          name: 'Cat',
          pieces: ['a', 'missing', 'c'],
          children: [],
        },
      ],
      showOthersCategory: true,
      othersCategoryName: 'Others',
    };

    const categorized = buildCategorizedPieces(allPieces, config);
    expect(categorized.categories).toEqual([
      { name: 'Cat', pieces: ['a'], children: [] },
      { name: 'Others', pieces: ['b'], children: [] },
    ]);
    expect(categorized.builtinCategories).toEqual([
      { name: 'Cat', pieces: ['c'], children: [] },
    ]);
    expect(categorized.missingPieces).toEqual([
      { categoryPath: ['Cat'], pieceName: 'missing' },
    ]);
  });

  it('should skip empty categories', () => {
    const allPieces = createPieceMap([
      { name: 'a', source: 'user' },
    ]);
    const config = {
      pieceCategories: [
        { name: 'Empty', pieces: [], children: [] },
      ],
      showOthersCategory: false,
      othersCategoryName: 'Others',
    };

    const categorized = buildCategorizedPieces(allPieces, config);
    expect(categorized.categories).toEqual([]);
    expect(categorized.builtinCategories).toEqual([]);
  });

  it('should find categories containing a piece', () => {
    const categories = [
      { name: 'A', pieces: ['shared'], children: [] },
      { name: 'B', pieces: ['shared'], children: [] },
    ];

    const paths = findPieceCategories('shared', categories).sort();
    expect(paths).toEqual(['A', 'B']);
  });

  it('should handle nested category paths', () => {
    const categories = [
      {
        name: 'Parent',
        pieces: [],
        children: [
          { name: 'Child', pieces: ['nested'], children: [] },
        ],
      },
    ];

    const paths = findPieceCategories('nested', categories);
    expect(paths).toEqual(['Parent / Child']);
  });
});
