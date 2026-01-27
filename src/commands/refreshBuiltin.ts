/**
 * /refresh-builtin command implementation
 *
 * Overwrites builtin workflow and agent files in ~/.takt/ with the latest
 * embedded resources. Does NOT touch config.yaml or user-added files.
 */

import { getGlobalConfigDir } from '../config/paths.js';
import { getLanguage } from '../config/globalConfig.js';
import { forceRefreshLanguageResources } from '../resources/index.js';
import { header, success, info, error } from '../utils/ui.js';
import { createLogger } from '../utils/debug.js';

const log = createLogger('refresh-builtin');

/**
 * Refresh builtin agents and workflows to latest version.
 */
export async function refreshBuiltin(): Promise<void> {
  const globalDir = getGlobalConfigDir();
  const lang = getLanguage();

  header('Refresh Builtin Resources');
  info(`Language: ${lang}`);
  info(`Target: ${globalDir}`);

  try {
    const overwritten = forceRefreshLanguageResources(globalDir, lang);

    log.info('Builtin resources refreshed', { count: overwritten.length, lang });

    console.log();
    success(`${overwritten.length} files refreshed.`);

    for (const filePath of overwritten) {
      info(`  ✓ ${filePath}`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error('Failed to refresh builtin resources', { error: message });
    error(`Failed to refresh: ${message}`);
  }
}
