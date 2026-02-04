/**
 * Piece categories management (separate from config.yaml)
 *
 * Categories are stored in a configurable location (default: ~/.takt/preferences/piece-categories.yaml)
 */

import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { getGlobalConfigDir } from '../paths.js';
import { loadGlobalConfig } from './globalConfig.js';
import type { PieceCategoryConfigNode } from '../../../core/models/index.js';

interface PieceCategoriesFile {
  categories?: PieceCategoryConfigNode;
  show_others_category?: boolean;
  others_category_name?: string;
}

function getDefaultPieceCategoriesPath(): string {
  return join(getGlobalConfigDir(), 'preferences', 'piece-categories.yaml');
}

function getPieceCategoriesPath(): string {
  try {
    const config = loadGlobalConfig();
    if (config.pieceCategoriesFile) {
      return config.pieceCategoriesFile;
    }
  } catch {
    // Ignore errors, use default
  }
  return getDefaultPieceCategoriesPath();
}

function loadPieceCategoriesFile(): PieceCategoriesFile {
  const categoriesPath = getPieceCategoriesPath();
  if (!existsSync(categoriesPath)) {
    return {};
  }

  try {
    const content = readFileSync(categoriesPath, 'utf-8');
    const parsed = parseYaml(content);
    if (parsed && typeof parsed === 'object') {
      return parsed as PieceCategoriesFile;
    }
  } catch {
    // Ignore parse errors
  }

  return {};
}

function savePieceCategoriesFile(data: PieceCategoriesFile): void {
  const categoriesPath = getPieceCategoriesPath();
  const dir = dirname(categoriesPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  const content = stringifyYaml(data, { indent: 2 });
  writeFileSync(categoriesPath, content, 'utf-8');
}

/** Get piece categories configuration */
export function getPieceCategoriesConfig(): PieceCategoryConfigNode | undefined {
  const data = loadPieceCategoriesFile();
  return data.categories;
}

/** Set piece categories configuration */
export function setPieceCategoriesConfig(categories: PieceCategoryConfigNode): void {
  const data = loadPieceCategoriesFile();
  data.categories = categories;
  savePieceCategoriesFile(data);
}

/** Get show others category flag */
export function getShowOthersCategory(): boolean | undefined {
  const data = loadPieceCategoriesFile();
  return data.show_others_category;
}

/** Set show others category flag */
export function setShowOthersCategory(show: boolean): void {
  const data = loadPieceCategoriesFile();
  data.show_others_category = show;
  savePieceCategoriesFile(data);
}

/** Get others category name */
export function getOthersCategoryName(): string | undefined {
  const data = loadPieceCategoriesFile();
  return data.others_category_name;
}

/** Set others category name */
export function setOthersCategoryName(name: string): void {
  const data = loadPieceCategoriesFile();
  data.others_category_name = name;
  savePieceCategoriesFile(data);
}
