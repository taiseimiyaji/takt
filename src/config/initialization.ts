/**
 * Re-export shim — actual implementation in global/initialization.ts
 */
export {
  needsLanguageSetup,
  promptLanguageSelection,
  promptProviderSelection,
  initGlobalDirs,
  initProjectDirs,
  type InitGlobalDirsOptions,
} from './global/initialization.js';
