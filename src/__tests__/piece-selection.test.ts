/**
 * Tests for piece selection helpers
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PieceDirEntry } from '../infra/config/loaders/pieceLoader.js';

const selectOptionMock = vi.fn();

vi.mock('../shared/prompt/index.js', () => ({
  selectOption: selectOptionMock,
}));

vi.mock('../infra/config/global/index.js', () => ({
  getBookmarkedPieces: () => [],
  toggleBookmark: vi.fn(),
}));

const { selectPieceFromEntries } = await import('../features/pieceSelection/index.js');

describe('selectPieceFromEntries', () => {
  beforeEach(() => {
    selectOptionMock.mockReset();
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
