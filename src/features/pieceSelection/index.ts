/**
 * Piece selection helpers (UI layer).
 */

import { selectOption } from '../../shared/prompt/index.js';
import type { SelectOptionItem } from '../../shared/prompt/index.js';
import { info, warn } from '../../shared/ui/index.js';
import {
  getBookmarkedPieces,
  addBookmark,
  removeBookmark,
} from '../../infra/config/global/index.js';
import {
  findPieceCategories,
  type PieceDirEntry,
  type PieceCategoryNode,
  type CategorizedPieces,
  type MissingPiece,
  type PieceSource,
  type PieceWithSource,
} from '../../infra/config/index.js';

/** Top-level selection item: either a piece or a category containing pieces */
export type PieceSelectionItem =
  | { type: 'piece'; name: string }
  | { type: 'category'; name: string; pieces: string[] };

/** Option item for prompt UI */
export interface SelectionOption {
  label: string;
  value: string;
}

/**
 * Build top-level selection items for the piece chooser UI.
 * Root-level pieces and categories are displayed at the same level.
 */
export function buildPieceSelectionItems(entries: PieceDirEntry[]): PieceSelectionItem[] {
  const categories = new Map<string, string[]>();
  const items: PieceSelectionItem[] = [];

  for (const entry of entries) {
    if (entry.category) {
      let pieces = categories.get(entry.category);
      if (!pieces) {
        pieces = [];
        categories.set(entry.category, pieces);
      }
      pieces.push(entry.name);
    } else {
      items.push({ type: 'piece', name: entry.name });
    }
  }

  for (const [name, pieces] of categories) {
    items.push({ type: 'category', name, pieces: pieces.sort() });
  }

  return items.sort((a, b) => a.name.localeCompare(b.name));
}

const CATEGORY_VALUE_PREFIX = '__category__:';

/**
 * Build top-level select options from PieceSelectionItems.
 * Categories are encoded with a prefix in the value field.
 */
export function buildTopLevelSelectOptions(
  items: PieceSelectionItem[],
  currentPiece: string,
): SelectionOption[] {
  return items.map((item) => {
    if (item.type === 'piece') {
      const isCurrent = item.name === currentPiece;
      const label = isCurrent ? `${item.name} (current)` : item.name;
      return { label, value: item.name };
    }
    const containsCurrent = item.pieces.some((w) => w === currentPiece);
    const label = containsCurrent ? `📁 ${item.name}/ (current)` : `📁 ${item.name}/`;
    return { label, value: `${CATEGORY_VALUE_PREFIX}${item.name}` };
  });
}

/**
 * Parse a top-level selection result.
 * Returns the category name if a category was selected, or null if a piece was selected directly.
 */
export function parseCategorySelection(selected: string): string | null {
  if (selected.startsWith(CATEGORY_VALUE_PREFIX)) {
    return selected.slice(CATEGORY_VALUE_PREFIX.length);
  }
  return null;
}

/**
 * Build select options for pieces within a category.
 */
export function buildCategoryPieceOptions(
  items: PieceSelectionItem[],
  categoryName: string,
  currentPiece: string,
): SelectionOption[] | null {
  const categoryItem = items.find(
    (item) => item.type === 'category' && item.name === categoryName,
  );
  if (!categoryItem || categoryItem.type !== 'category') return null;

  return categoryItem.pieces.map((qualifiedName) => {
    const displayName = qualifiedName.split('/').pop() ?? qualifiedName;
    const isCurrent = qualifiedName === currentPiece;
    const label = isCurrent ? `${displayName} (current)` : displayName;
    return { label, value: qualifiedName };
  });
}

const BOOKMARK_MARK = ' [*]';

/**
 * Add [*] suffix to bookmarked items without changing order.
 * Pure function — does not mutate inputs.
 */
export function applyBookmarks(
  options: SelectionOption[],
  bookmarkedPieces: string[],
): SelectionOption[] {
  const bookmarkedSet = new Set(bookmarkedPieces);

  return options.map((opt) => {
    if (bookmarkedSet.has(opt.value)) {
      return { ...opt, label: `${opt.label}${BOOKMARK_MARK}` };
    }
    return opt;
  });
}

/**
 * Warn about missing pieces referenced by categories.
 */
export function warnMissingPieces(missing: MissingPiece[]): void {
  for (const { categoryPath, pieceName } of missing) {
    const pathLabel = categoryPath.join(' / ');
    warn(`Piece "${pieceName}" in category "${pathLabel}" not found`);
  }
}

function categoryContainsPiece(node: PieceCategoryNode, piece: string): boolean {
  if (node.pieces.includes(piece)) return true;
  for (const child of node.children) {
    if (categoryContainsPiece(child, piece)) return true;
  }
  return false;
}

function buildCategoryLevelOptions(
  categories: PieceCategoryNode[],
  pieces: string[],
  currentPiece: string,
  rootCategories: PieceCategoryNode[],
  currentPathLabel: string,
): {
  options: SelectionOption[];
  categoryMap: Map<string, PieceCategoryNode>;
} {
  const options: SelectionOption[] = [];
  const categoryMap = new Map<string, PieceCategoryNode>();

  for (const category of categories) {
    const containsCurrent = currentPiece.length > 0 && categoryContainsPiece(category, currentPiece);
    const label = containsCurrent
      ? `📁 ${category.name}/ (current)`
      : `📁 ${category.name}/`;
    const value = `${CATEGORY_VALUE_PREFIX}${category.name}`;
    options.push({ label, value });
    categoryMap.set(category.name, category);
  }

  for (const pieceName of pieces) {
    const isCurrent = pieceName === currentPiece;
    const alsoIn = findPieceCategories(pieceName, rootCategories)
      .filter((path) => path !== currentPathLabel);
    const alsoInLabel = alsoIn.length > 0 ? `also in ${alsoIn.join(', ')}` : '';

    let label = `🎼 ${pieceName}`;
    if (isCurrent && alsoInLabel) {
      label = `🎼 ${pieceName} (current, ${alsoInLabel})`;
    } else if (isCurrent) {
      label = `🎼 ${pieceName} (current)`;
    } else if (alsoInLabel) {
      label = `🎼 ${pieceName} (${alsoInLabel})`;
    }

    options.push({ label, value: pieceName });
  }

  return { options, categoryMap };
}

async function selectPieceFromCategoryTree(
  categories: PieceCategoryNode[],
  currentPiece: string,
  hasSourceSelection: boolean,
  rootPieces: string[] = [],
): Promise<string | null> {
  if (categories.length === 0 && rootPieces.length === 0) {
    info('No pieces available for configured categories.');
    return null;
  }

  const stack: PieceCategoryNode[] = [];

  while (true) {
    const currentNode = stack.length > 0 ? stack[stack.length - 1] : undefined;
    const currentCategories = currentNode ? currentNode.children : categories;
    const currentPieces = currentNode ? currentNode.pieces : rootPieces;
    const currentPathLabel = stack.map((node) => node.name).join(' / ');

    const { options, categoryMap } = buildCategoryLevelOptions(
      currentCategories,
      currentPieces,
      currentPiece,
      categories,
      currentPathLabel,
    );

    if (options.length === 0) {
      if (stack.length === 0) {
        info('No pieces available for configured categories.');
        return null;
      }
      stack.pop();
      continue;
    }

    const buildOptionsWithBookmarks = (): SelectionOption[] =>
      applyBookmarks(options, getBookmarkedPieces());

    const message = currentPathLabel.length > 0
      ? `Select piece in ${currentPathLabel}:`
      : 'Select piece category:';

    const selected = await selectOption<string>(message, buildOptionsWithBookmarks(), {
      cancelLabel: (stack.length > 0 || hasSourceSelection) ? '← Go back' : 'Cancel',
      onKeyPress: (key: string, value: string): SelectOptionItem<string>[] | null => {
        // Don't handle bookmark keys for categories
        if (parseCategorySelection(value)) {
          return null; // Delegate to default handler
        }

        if (key === 'b') {
          addBookmark(value);
          return buildOptionsWithBookmarks();
        }

        if (key === 'r') {
          removeBookmark(value);
          return buildOptionsWithBookmarks();
        }

        return null; // Delegate to default handler
      },
    });

    if (!selected) {
      if (stack.length > 0) {
        stack.pop();
        continue;
      }
      return null;
    }

    const categoryName = parseCategorySelection(selected);
    if (categoryName) {
      const nextNode = categoryMap.get(categoryName);
      if (!nextNode) continue;
      stack.push(nextNode);
      continue;
    }

    return selected;
  }
}

function countPiecesIncludingCategories(
  categories: PieceCategoryNode[],
  allPieces: Map<string, PieceWithSource>,
  sourceFilter: PieceSource,
): number {
  const categorizedPieces = new Set<string>();
  const visit = (nodes: PieceCategoryNode[]): void => {
    for (const node of nodes) {
      for (const w of node.pieces) {
        categorizedPieces.add(w);
      }
      if (node.children.length > 0) {
        visit(node.children);
      }
    }
  };
  visit(categories);

  let count = 0;
  for (const [, { source }] of allPieces) {
    if (source === sourceFilter) {
      count++;
    }
  }
  return count;
}

const CURRENT_PIECE_VALUE = '__current__';
const CUSTOM_UNCATEGORIZED_VALUE = '__custom_uncategorized__';
const BUILTIN_SOURCE_VALUE = '__builtin__';
const CUSTOM_CATEGORY_PREFIX = '__custom_category__:';

type TopLevelSelection =
  | { type: 'current' }
  | { type: 'piece'; name: string }
  | { type: 'custom_category'; node: PieceCategoryNode }
  | { type: 'custom_uncategorized' }
  | { type: 'builtin' };

async function selectTopLevelPieceOption(
  categorized: CategorizedPieces,
  currentPiece: string,
): Promise<TopLevelSelection | null> {
  const uncategorizedCustom = getRootLevelPieces(
    categorized.categories,
    categorized.allPieces,
    'user'
  );
  const builtinCount = countPiecesIncludingCategories(
    categorized.builtinCategories,
    categorized.allPieces,
    'builtin'
  );

  const buildOptions = (): SelectOptionItem<string>[] => {
    const options: SelectOptionItem<string>[] = [];
    const bookmarkedPieces = getBookmarkedPieces(); // Get fresh bookmarks on every build

    // 1. Current piece
    if (currentPiece) {
      options.push({
        label: `🎼 ${currentPiece} (current)`,
        value: CURRENT_PIECE_VALUE,
      });
    }

    // 2. Bookmarked pieces (individual items)
    for (const pieceName of bookmarkedPieces) {
      if (pieceName === currentPiece) continue; // Skip if already shown as current
      options.push({
        label: `🎼 ${pieceName} [*]`,
        value: pieceName,
      });
    }

    // 3. User-defined categories
    for (const category of categorized.categories) {
      options.push({
        label: `📁 ${category.name}/`,
        value: `${CUSTOM_CATEGORY_PREFIX}${category.name}`,
      });
    }

    // 4. Builtin pieces
    if (builtinCount > 0) {
      options.push({
        label: `📂 Builtin/ (${builtinCount})`,
        value: BUILTIN_SOURCE_VALUE,
      });
    }

    // 5. Uncategorized custom pieces
    if (uncategorizedCustom.length > 0) {
      options.push({
        label: `📂 Custom/ (${uncategorizedCustom.length})`,
        value: CUSTOM_UNCATEGORIZED_VALUE,
      });
    }

    return options;
  };

  if (buildOptions().length === 0) return null;

  const result = await selectOption<string>('Select piece:', buildOptions(), {
    onKeyPress: (key: string, value: string): SelectOptionItem<string>[] | null => {
      // Don't handle bookmark keys for special values
      if (value === CURRENT_PIECE_VALUE ||
          value === CUSTOM_UNCATEGORIZED_VALUE ||
          value === BUILTIN_SOURCE_VALUE ||
          value.startsWith(CUSTOM_CATEGORY_PREFIX)) {
        return null; // Delegate to default handler
      }

      if (key === 'b') {
        addBookmark(value);
        return buildOptions();
      }

      if (key === 'r') {
        removeBookmark(value);
        return buildOptions();
      }

      return null; // Delegate to default handler
    },
  });

  if (!result) return null;

  if (result === CURRENT_PIECE_VALUE) {
    return { type: 'current' };
  }

  if (result === CUSTOM_UNCATEGORIZED_VALUE) {
    return { type: 'custom_uncategorized' };
  }

  if (result === BUILTIN_SOURCE_VALUE) {
    return { type: 'builtin' };
  }

  if (result.startsWith(CUSTOM_CATEGORY_PREFIX)) {
    const categoryName = result.slice(CUSTOM_CATEGORY_PREFIX.length);
    const node = categorized.categories.find(c => c.name === categoryName);
    if (!node) return null;
    return { type: 'custom_category', node };
  }

  // Direct piece selection (bookmarked or other)
  return { type: 'piece', name: result };
}

function getRootLevelPieces(
  categories: PieceCategoryNode[],
  allPieces: Map<string, PieceWithSource>,
  sourceFilter: PieceSource,
): string[] {
  const categorizedPieces = new Set<string>();
  const visit = (nodes: PieceCategoryNode[]): void => {
    for (const node of nodes) {
      for (const w of node.pieces) {
        categorizedPieces.add(w);
      }
      if (node.children.length > 0) {
        visit(node.children);
      }
    }
  };
  visit(categories);

  const rootPieces: string[] = [];
  for (const [name, { source }] of allPieces) {
    if (source === sourceFilter && !categorizedPieces.has(name)) {
      rootPieces.push(name);
    }
  }
  return rootPieces.sort();
}

/**
 * Select piece from categorized pieces (hierarchical UI).
 */
export async function selectPieceFromCategorizedPieces(
  categorized: CategorizedPieces,
  currentPiece: string,
): Promise<string | null> {
  while (true) {
    const selection = await selectTopLevelPieceOption(categorized, currentPiece);
    if (!selection) {
      return null;
    }

    // 1. Current piece selected
    if (selection.type === 'current') {
      return currentPiece;
    }

    // 2. Direct piece selected (e.g., bookmarked piece)
    if (selection.type === 'piece') {
      return selection.name;
    }

    // 3. User-defined category selected
    if (selection.type === 'custom_category') {
      const piece = await selectPieceFromCategoryTree(
        [selection.node],
        currentPiece,
        true,
        selection.node.pieces
      );
      if (piece) {
        return piece;
      }
      // null → go back to top-level selection
      continue;
    }

    // 4. Builtin pieces selected
    if (selection.type === 'builtin') {
      const rootPieces = getRootLevelPieces(
        categorized.builtinCategories,
        categorized.allPieces,
        'builtin'
      );

      const piece = await selectPieceFromCategoryTree(
        categorized.builtinCategories,
        currentPiece,
        true,
        rootPieces
      );
      if (piece) {
        return piece;
      }
      // null → go back to top-level selection
      continue;
    }

    // 5. Custom uncategorized pieces selected
    if (selection.type === 'custom_uncategorized') {
      const uncategorizedCustom = getRootLevelPieces(
        categorized.categories,
        categorized.allPieces,
        'user'
      );

      const baseOptions: SelectionOption[] = uncategorizedCustom.map((name) => ({
        label: name === currentPiece ? `🎼 ${name} (current)` : `🎼 ${name}`,
        value: name,
      }));

      const buildFlatOptions = (): SelectionOption[] =>
        applyBookmarks(baseOptions, getBookmarkedPieces());

      const piece = await selectOption<string>('Select piece:', buildFlatOptions(), {
        cancelLabel: '← Go back',
        onKeyPress: (key: string, value: string): SelectOptionItem<string>[] | null => {
          if (key === 'b') {
            addBookmark(value);
            return buildFlatOptions();
          }
          if (key === 'r') {
            removeBookmark(value);
            return buildFlatOptions();
          }
          return null; // Delegate to default handler
        },
      });

      if (piece) {
        return piece;
      }
      // null → go back to top-level selection
      continue;
    }
  }
}

async function selectPieceFromEntriesWithCategories(
  entries: PieceDirEntry[],
  currentPiece: string,
): Promise<string | null> {
  if (entries.length === 0) return null;

  const items = buildPieceSelectionItems(entries);
  const availablePieces = entries.map((entry) => entry.name);
  const hasCategories = items.some((item) => item.type === 'category');

  if (!hasCategories) {
    const baseOptions: SelectionOption[] = availablePieces.map((name) => ({
      label: name === currentPiece ? `🎼 ${name} (current)` : `🎼 ${name}`,
      value: name,
    }));

    const buildFlatOptions = (): SelectionOption[] =>
      applyBookmarks(baseOptions, getBookmarkedPieces());

    return selectOption<string>('Select piece:', buildFlatOptions(), {
      onKeyPress: (key: string, value: string): SelectOptionItem<string>[] | null => {
        if (key === 'b') {
          addBookmark(value);
          return buildFlatOptions();
        }
        if (key === 'r') {
          removeBookmark(value);
          return buildFlatOptions();
        }
        return null; // Delegate to default handler
      },
    });
  }

  // Loop until user selects a piece or cancels at top level
  while (true) {
    const buildTopLevelOptions = (): SelectionOption[] =>
      applyBookmarks(buildTopLevelSelectOptions(items, currentPiece), getBookmarkedPieces());

    const selected = await selectOption<string>('Select piece:', buildTopLevelOptions(), {
      onKeyPress: (key: string, value: string): SelectOptionItem<string>[] | null => {
        // Don't handle bookmark keys for categories
        if (parseCategorySelection(value)) {
          return null; // Delegate to default handler
        }

        if (key === 'b') {
          addBookmark(value);
          return buildTopLevelOptions();
        }

        if (key === 'r') {
          removeBookmark(value);
          return buildTopLevelOptions();
        }

        return null; // Delegate to default handler
      },
    });
    if (!selected) return null;

    const categoryName = parseCategorySelection(selected);
    if (categoryName) {
      const categoryOptions = buildCategoryPieceOptions(items, categoryName, currentPiece);
      if (!categoryOptions) continue;

      const buildCategoryOptions = (): SelectionOption[] =>
        applyBookmarks(categoryOptions, getBookmarkedPieces());

      const pieceSelection = await selectOption<string>(`Select piece in ${categoryName}:`, buildCategoryOptions(), {
        cancelLabel: '← Go back',
        onKeyPress: (key: string, value: string): SelectOptionItem<string>[] | null => {
          if (key === 'b') {
            addBookmark(value);
            return buildCategoryOptions();
          }
          if (key === 'r') {
            removeBookmark(value);
            return buildCategoryOptions();
          }
          return null; // Delegate to default handler
        },
      });

      // If piece selected, return it. If cancelled (null), go back to top level
      if (pieceSelection) return pieceSelection;
      continue;
    }

    return selected;
  }
}

/**
 * Select piece from directory entries (builtin separated).
 */
export async function selectPieceFromEntries(
  entries: PieceDirEntry[],
  currentPiece: string,
): Promise<string | null> {
  const builtinEntries = entries.filter((entry) => entry.source === 'builtin');
  const customEntries = entries.filter((entry) => entry.source !== 'builtin');

  if (builtinEntries.length > 0 && customEntries.length > 0) {
    const selectedSource = await selectOption<'custom' | 'builtin'>('Select piece source:', [
      { label: `Custom pieces (${customEntries.length})`, value: 'custom' },
      { label: `Builtin pieces (${builtinEntries.length})`, value: 'builtin' },
    ]);
    if (!selectedSource) return null;
    const sourceEntries = selectedSource === 'custom' ? customEntries : builtinEntries;
    return selectPieceFromEntriesWithCategories(sourceEntries, currentPiece);
  }

  const entriesToUse = customEntries.length > 0 ? customEntries : builtinEntries;
  return selectPieceFromEntriesWithCategories(entriesToUse, currentPiece);
}
