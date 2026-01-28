/**
 * Debug logging utilities for takt
 * Writes debug logs to file when enabled in config.
 * When verbose console is enabled, also outputs to stderr.
 */

import { existsSync, appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import type { DebugConfig } from '../models/types.js';

/** Debug logger state */
let debugEnabled = false;
let debugLogFile: string | null = null;
let initialized = false;

/** Verbose console output state */
let verboseConsoleEnabled = false;

/** Get default debug log file path */
function getDefaultLogFile(): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return join(homedir(), '.takt', 'logs', `debug-${timestamp}.log`);
}

/** Initialize debug logger from config */
export function initDebugLogger(config?: DebugConfig, projectDir?: string): void {
  if (initialized) {
    return;
  }

  debugEnabled = config?.enabled ?? false;

  if (debugEnabled) {
    if (config?.logFile) {
      debugLogFile = config.logFile;
    } else {
      debugLogFile = getDefaultLogFile();
    }

    // Ensure log directory exists
    const logDir = dirname(debugLogFile);
    if (!existsSync(logDir)) {
      mkdirSync(logDir, { recursive: true });
    }

    // Write initial log header
    const header = [
      '='.repeat(60),
      `TAKT Debug Log`,
      `Started: ${new Date().toISOString()}`,
      `Project: ${projectDir || 'N/A'}`,
      '='.repeat(60),
      '',
    ].join('\n');

    writeFileSync(debugLogFile, header, 'utf-8');
  }

  initialized = true;
}

/** Reset debug logger (for testing) */
export function resetDebugLogger(): void {
  debugEnabled = false;
  debugLogFile = null;
  initialized = false;
  verboseConsoleEnabled = false;
}

/** Enable or disable verbose console output */
export function setVerboseConsole(enabled: boolean): void {
  verboseConsoleEnabled = enabled;
}

/** Check if verbose console is enabled */
export function isVerboseConsole(): boolean {
  return verboseConsoleEnabled;
}

/** Check if debug is enabled */
export function isDebugEnabled(): boolean {
  return debugEnabled;
}

/** Get current debug log file path */
export function getDebugLogFile(): string | null {
  return debugLogFile;
}

/** Format log message with timestamp and level */
function formatLogMessage(level: string, component: string, message: string, data?: unknown): string {
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [${level.toUpperCase()}] [${component}]`;

  let logLine = `${prefix} ${message}`;

  if (data !== undefined) {
    try {
      const dataStr = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
      logLine += `\n${dataStr}`;
    } catch {
      logLine += `\n[Unable to serialize data]`;
    }
  }

  return logLine;
}

/** Format a compact console log line */
function formatConsoleMessage(level: string, component: string, message: string): string {
  const timestamp = new Date().toISOString().slice(11, 23); // HH:mm:ss.SSS
  return `[${timestamp}] [${level}] [${component}] ${message}`;
}

/** Write a log entry to verbose console (stderr) and/or file */
function writeLog(level: string, component: string, message: string, data?: unknown): void {
  if (verboseConsoleEnabled) {
    process.stderr.write(formatConsoleMessage(level, component, message) + '\n');
  }

  if (!debugEnabled || !debugLogFile) {
    return;
  }

  const logLine = formatLogMessage(level, component, message, data);

  try {
    appendFileSync(debugLogFile, logLine + '\n', 'utf-8');
  } catch {
    // Silently fail - logging errors should not interrupt main flow
  }
}

/** Write a debug log entry */
export function debugLog(component: string, message: string, data?: unknown): void {
  writeLog('DEBUG', component, message, data);
}

/** Write an info log entry */
export function infoLog(component: string, message: string, data?: unknown): void {
  writeLog('INFO', component, message, data);
}

/** Write an error log entry */
export function errorLog(component: string, message: string, data?: unknown): void {
  writeLog('ERROR', component, message, data);
}

/** Log function entry with arguments */
export function traceEnter(component: string, funcName: string, args?: Record<string, unknown>): void {
  debugLog(component, `>> ${funcName}()`, args);
}

/** Log function exit with result */
export function traceExit(component: string, funcName: string, result?: unknown): void {
  debugLog(component, `<< ${funcName}()`, result);
}

/** Create a scoped logger for a component */
export function createLogger(component: string) {
  return {
    debug: (message: string, data?: unknown) => debugLog(component, message, data),
    info: (message: string, data?: unknown) => infoLog(component, message, data),
    error: (message: string, data?: unknown) => errorLog(component, message, data),
    enter: (funcName: string, args?: Record<string, unknown>) => traceEnter(component, funcName, args),
    exit: (funcName: string, result?: unknown) => traceExit(component, funcName, result),
  };
}
