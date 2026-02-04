/**
 * Piece category configuration loader and helpers.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod/v4';
import { getProjectConfigPath } from '../paths.js';
import { getLanguage, getBuiltinPiecesEnabled, getDisabledBuiltins } from '../global/globalConfig.js';
import {
  getPieceCategoriesConfig,
  getShowOthersCategory,
  getOthersCategoryName,
} from '../global/pieceCategories.js';
import { getLanguageResourcesDir } from '../../resources/index.js';
import { listBuiltinPieceNames } from './pieceResolver.js';
import type { PieceSource, PieceWithSource } from './pieceResolver.js';

const CategoryConfigSchema = z.object({
  piece_categories: z.record(z.string(), z.unknown()).optional(),
  show_others_category: z.boolean().optional(),
  others_category_name: z.string().min(1).optional(),
}).passthrough();

export interface PieceCategoryNode {
  name: string;
  pieces: string[];
  children: PieceCategoryNode[];
}

export interface CategoryConfig {
  pieceCategories: PieceCategoryNode[];
  showOthersCategory: boolean;
  othersCategoryName: string;
}

export interface CategorizedPieces {
  categories: PieceCategoryNode[];
  builtinCategories: PieceCategoryNode[];
  allPieces: Map<string, PieceWithSource>;
  missingPieces: MissingPiece[];
}

export interface MissingPiece {
  categoryPath: string[];
  pieceName: string;
}

interface RawCategoryConfig {
  piece_categories?: Record<string, unknown>;
  show_others_category?: boolean;
  others_category_name?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function parsePieces(raw: unknown, sourceLabel: string, path: string[]): string[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) {
    throw new Error(`pieces must be an array in ${sourceLabel} at ${path.join(' > ')}`);
  }
  const pieces: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string' || item.trim().length === 0) {
      throw new Error(`piece name must be a non-empty string in ${sourceLabel} at ${path.join(' > ')}`);
    }
    pieces.push(item);
  }
  return pieces;
}

function parseCategoryNode(
  name: string,
  raw: unknown,
  sourceLabel: string,
  path: string[],
): PieceCategoryNode {
  if (!isRecord(raw)) {
    throw new Error(`category "${name}" must be an object in ${sourceLabel} at ${path.join(' > ')}`);
  }

  const pieces = parsePieces(raw.pieces, sourceLabel, path);
  const children: PieceCategoryNode[] = [];

  for (const [key, value] of Object.entries(raw)) {
    if (key === 'pieces') continue;
    if (!isRecord(value)) {
      throw new Error(`category "${key}" must be an object in ${sourceLabel} at ${[...path, key].join(' > ')}`);
    }
    children.push(parseCategoryNode(key, value, sourceLabel, [...path, key]));
  }

  return { name, pieces, children };
}

function parseCategoryTree(raw: unknown, sourceLabel: string): PieceCategoryNode[] {
  if (!isRecord(raw)) {
    throw new Error(`piece_categories must be an object in ${sourceLabel}`);
  }
  const categories: PieceCategoryNode[] = [];
  for (const [name, value] of Object.entries(raw)) {
    categories.push(parseCategoryNode(name, value, sourceLabel, [name]));
  }
  return categories;
}

function parseCategoryConfig(raw: unknown, sourceLabel: string): CategoryConfig | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const hasPieceCategories = Object.prototype.hasOwnProperty.call(raw, 'piece_categories');
  if (!hasPieceCategories) {
    return null;
  }

  const parsed = CategoryConfigSchema.parse(raw) as RawCategoryConfig;
  if (!parsed.piece_categories) {
    throw new Error(`piece_categories is required in ${sourceLabel}`);
  }

  const showOthersCategory = parsed.show_others_category === undefined
    ? true
    : parsed.show_others_category;

  const othersCategoryName = parsed.others_category_name === undefined
    ? 'Others'
    : parsed.others_category_name;

  return {
    pieceCategories: parseCategoryTree(parsed.piece_categories, sourceLabel),
    showOthersCategory,
    othersCategoryName,
  };
}

function loadCategoryConfigFromPath(path: string, sourceLabel: string): CategoryConfig | null {
  if (!existsSync(path)) {
    return null;
  }
  const content = readFileSync(path, 'utf-8');
  const raw = parseYaml(content);
  return parseCategoryConfig(raw, sourceLabel);
}

/**
 * Load default categories from builtin resource file.
 * Returns null if file doesn't exist or has no piece_categories.
 */
export function loadDefaultCategories(): CategoryConfig | null {
  const lang = getLanguage();
  const filePath = join(getLanguageResourcesDir(lang), 'default-categories.yaml');
  return loadCategoryConfigFromPath(filePath, filePath);
}

/**
 * Get effective piece categories configuration.
 * Priority: user config -> project config -> default categories.
 */
export function getPieceCategories(cwd: string): CategoryConfig | null {
  // Check user config from separate file (~/.takt/piece-categories.yaml)
  const userCategoriesNode = getPieceCategoriesConfig();
  if (userCategoriesNode) {
    const showOthersCategory = getShowOthersCategory() ?? true;
    const othersCategoryName = getOthersCategoryName() ?? 'Others';
    return {
      pieceCategories: parseCategoryTree(userCategoriesNode, 'user config'),
      showOthersCategory,
      othersCategoryName,
    };
  }

  const projectConfig = loadCategoryConfigFromPath(getProjectConfigPath(cwd), 'project config');
  if (projectConfig) {
    return projectConfig;
  }

  return loadDefaultCategories();
}

function collectMissingPieces(
  categories: PieceCategoryNode[],
  allPieces: Map<string, PieceWithSource>,
  ignorePieces: Set<string>,
): MissingPiece[] {
  const missing: MissingPiece[] = [];
  const visit = (nodes: PieceCategoryNode[], path: string[]): void => {
    for (const node of nodes) {
      const nextPath = [...path, node.name];
      for (const pieceName of node.pieces) {
        if (ignorePieces.has(pieceName)) continue;
        if (!allPieces.has(pieceName)) {
          missing.push({ categoryPath: nextPath, pieceName });
        }
      }
      if (node.children.length > 0) {
        visit(node.children, nextPath);
      }
    }
  };

  visit(categories, []);
  return missing;
}

function buildCategoryTreeForSource(
  categories: PieceCategoryNode[],
  allPieces: Map<string, PieceWithSource>,
  sourceFilter: (source: PieceSource) => boolean,
  categorized: Set<string>,
): PieceCategoryNode[] {
  const result: PieceCategoryNode[] = [];

  for (const node of categories) {
    const pieces: string[] = [];
    for (const pieceName of node.pieces) {
      const entry = allPieces.get(pieceName);
      if (!entry) continue;
      if (!sourceFilter(entry.source)) continue;
      pieces.push(pieceName);
      categorized.add(pieceName);
    }

    const children = buildCategoryTreeForSource(node.children, allPieces, sourceFilter, categorized);
    if (pieces.length > 0 || children.length > 0) {
      result.push({ name: node.name, pieces, children });
    }
  }

  return result;
}

function appendOthersCategory(
  categories: PieceCategoryNode[],
  allPieces: Map<string, PieceWithSource>,
  categorized: Set<string>,
  sourceFilter: (source: PieceSource) => boolean,
  othersCategoryName: string,
): PieceCategoryNode[] {
  if (categories.some((node) => node.name === othersCategoryName)) {
    return categories;
  }

  const uncategorized: string[] = [];
  for (const [pieceName, entry] of allPieces.entries()) {
    if (!sourceFilter(entry.source)) continue;
    if (categorized.has(pieceName)) continue;
    uncategorized.push(pieceName);
  }

  if (uncategorized.length === 0) {
    return categories;
  }

  return [...categories, { name: othersCategoryName, pieces: uncategorized, children: [] }];
}

/**
 * Build categorized pieces map from configuration.
 */
export function buildCategorizedPieces(
  allPieces: Map<string, PieceWithSource>,
  config: CategoryConfig,
): CategorizedPieces {
  const ignoreMissing = new Set<string>();
  if (!getBuiltinPiecesEnabled()) {
    for (const name of listBuiltinPieceNames({ includeDisabled: true })) {
      ignoreMissing.add(name);
    }
  } else {
    for (const name of getDisabledBuiltins()) {
      ignoreMissing.add(name);
    }
  }

  const missingPieces = collectMissingPieces(
    config.pieceCategories,
    allPieces,
    ignoreMissing,
  );

  const isBuiltin = (source: PieceSource): boolean => source === 'builtin';
  const isCustom = (source: PieceSource): boolean => source !== 'builtin';

  const categorizedCustom = new Set<string>();
  const categories = buildCategoryTreeForSource(
    config.pieceCategories,
    allPieces,
    isCustom,
    categorizedCustom,
  );

  const categorizedBuiltin = new Set<string>();
  const builtinCategories = buildCategoryTreeForSource(
    config.pieceCategories,
    allPieces,
    isBuiltin,
    categorizedBuiltin,
  );

  const finalCategories = config.showOthersCategory
    ? appendOthersCategory(
      categories,
      allPieces,
      categorizedCustom,
      isCustom,
      config.othersCategoryName,
    )
    : categories;

  const finalBuiltinCategories = config.showOthersCategory
    ? appendOthersCategory(
      builtinCategories,
      allPieces,
      categorizedBuiltin,
      isBuiltin,
      config.othersCategoryName,
    )
    : builtinCategories;

  return {
    categories: finalCategories,
    builtinCategories: finalBuiltinCategories,
    allPieces,
    missingPieces,
  };
}

function findPieceCategoryPaths(
  piece: string,
  categories: PieceCategoryNode[],
  prefix: string[],
  results: string[],
): void {
  for (const node of categories) {
    const path = [...prefix, node.name];
    if (node.pieces.includes(piece)) {
      results.push(path.join(' / '));
    }
    if (node.children.length > 0) {
      findPieceCategoryPaths(piece, node.children, path, results);
    }
  }
}

/**
 * Find which categories contain a given piece (for duplicate indication).
 */
export function findPieceCategories(
  piece: string,
  categories: PieceCategoryNode[],
): string[] {
  const result: string[] = [];
  findPieceCategoryPaths(piece, categories, [], result);
  return result;
}
