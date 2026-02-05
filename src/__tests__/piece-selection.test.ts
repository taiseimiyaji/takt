/**
 * Tests for piece selection helpers
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PieceDirEntry } from '../infra/config/loaders/pieceLoader.js';
import type { CategorizedPieces } from '../infra/config/loaders/pieceCategories.js';
import type { PieceWithSource } from '../infra/config/loaders/pieceResolver.js';

const selectOptionMock = vi.fn();
const bookmarkState = vi.hoisted(() => ({
  bookmarks: [] as string[],
}));

vi.mock('../shared/prompt/index.js', () => ({
  selectOption: selectOptionMock,
}));

vi.mock('../shared/ui/index.js', () => ({
  info: vi.fn(),
  warn: vi.fn(),
}));

vi.mock('../infra/config/global/index.js', () => ({
  getBookmarkedPieces: () => bookmarkState.bookmarks,
  addBookmark: vi.fn(),
  removeBookmark: vi.fn(),
  toggleBookmark: vi.fn(),
}));

vi.mock('../infra/config/index.js', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  return actual;
});

const { selectPieceFromEntries, selectPieceFromCategorizedPieces } = await import('../features/pieceSelection/index.js');

describe('selectPieceFromEntries', () => {
  beforeEach(() => {
    selectOptionMock.mockReset();
    bookmarkState.bookmarks = [];
  });

  it('should select from custom pieces when source is chosen', async () => {
    const entries: PieceDirEntry[] = [
      { name: 'custom-flow', path: '/tmp/custom.yaml', source: 'user' },
      { name: 'builtin-flow', path: '/tmp/builtin.yaml', source: 'builtin' },
    ];

    selectOptionMock
      .mockResolvedValueOnce('custom')
      .mockResolvedValueOnce('custom-flow');

    const selected = await selectPieceFromEntries(entries, '');
    expect(selected).toBe('custom-flow');
    expect(selectOptionMock).toHaveBeenCalledTimes(2);
  });

  it('should skip source selection when only builtin pieces exist', async () => {
    const entries: PieceDirEntry[] = [
      { name: 'builtin-flow', path: '/tmp/builtin.yaml', source: 'builtin' },
    ];

    selectOptionMock.mockResolvedValueOnce('builtin-flow');

    const selected = await selectPieceFromEntries(entries, '');
    expect(selected).toBe('builtin-flow');
    expect(selectOptionMock).toHaveBeenCalledTimes(1);
  });
});

function createPieceMap(entries: { name: string; source: 'user' | 'builtin' }[]): Map<string, PieceWithSource> {
  const map = new Map<string, PieceWithSource>();
  for (const e of entries) {
    map.set(e.name, {
      source: e.source,
      config: {
        name: e.name,
        movements: [],
        initialMovement: 'start',
        maxIterations: 1,
      },
    });
  }
  return map;
}

describe('selectPieceFromCategorizedPieces', () => {
  beforeEach(() => {
    selectOptionMock.mockReset();
    bookmarkState.bookmarks = [];
  });

  it('should show categories at top level', async () => {
    const categorized: CategorizedPieces = {
      categories: [
        { name: 'My Pieces', pieces: ['my-piece'], children: [] },
        { name: 'Quick Start', pieces: ['default'], children: [] },
      ],
      allPieces: createPieceMap([
        { name: 'my-piece', source: 'user' },
        { name: 'default', source: 'builtin' },
      ]),
      missingPieces: [],
    };

    selectOptionMock.mockResolvedValueOnce('__current__');

    await selectPieceFromCategorizedPieces(categorized, 'my-piece');

    const firstCallOptions = selectOptionMock.mock.calls[0]![1] as { label: string; value: string }[];
    const labels = firstCallOptions.map((o) => o.label);

    expect(labels[0]).toBe('🎼 my-piece (current)');
    expect(labels.some((l) => l.includes('My Pieces'))).toBe(true);
    expect(labels.some((l) => l.includes('Quick Start'))).toBe(true);
  });

  it('should show current piece and bookmarks above categories', async () => {
    bookmarkState.bookmarks = ['research'];

    const categorized: CategorizedPieces = {
      categories: [
        { name: 'Quick Start', pieces: ['default'], children: [] },
      ],
      allPieces: createPieceMap([
        { name: 'default', source: 'builtin' },
        { name: 'research', source: 'builtin' },
      ]),
      missingPieces: [],
    };

    selectOptionMock.mockResolvedValueOnce('__current__');

    const selected = await selectPieceFromCategorizedPieces(categorized, 'default');
    expect(selected).toBe('default');

    const firstCallOptions = selectOptionMock.mock.calls[0]![1] as { label: string; value: string }[];
    const labels = firstCallOptions.map((o) => o.label);

    // Current piece first, bookmarks second, categories after
    expect(labels[0]).toBe('🎼 default (current)');
    expect(labels[1]).toBe('🎼 research [*]');
  });

  it('should navigate into a category and select a piece', async () => {
    const categorized: CategorizedPieces = {
      categories: [
        { name: 'Dev', pieces: ['my-piece'], children: [] },
      ],
      allPieces: createPieceMap([
        { name: 'my-piece', source: 'user' },
      ]),
      missingPieces: [],
    };

    // Select category, then select piece inside it
    selectOptionMock
      .mockResolvedValueOnce('__custom_category__:Dev')
      .mockResolvedValueOnce('my-piece');

    const selected = await selectPieceFromCategorizedPieces(categorized, '');
    expect(selected).toBe('my-piece');
  });
});
