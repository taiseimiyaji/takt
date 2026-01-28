/**
 * Tests for session log incremental writes and pointer management
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, readFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  createSessionLog,
  saveSessionLog,
  updateLatestPointer,
  type LatestLogPointer,
  type SessionLog,
} from '../utils/session.js';

/** Create a temp project directory with .takt/logs structure */
function createTempProject(): string {
  const dir = join(tmpdir(), `takt-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe('saveSessionLog (atomic)', () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = createTempProject();
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
  });

  it('should create session log file with correct content', () => {
    const log = createSessionLog('test task', projectDir, 'default');
    const sessionId = 'test-session-001';

    const filepath = saveSessionLog(log, sessionId, projectDir);

    expect(existsSync(filepath)).toBe(true);
    const content = JSON.parse(readFileSync(filepath, 'utf-8')) as SessionLog;
    expect(content.task).toBe('test task');
    expect(content.workflowName).toBe('default');
    expect(content.status).toBe('running');
    expect(content.iterations).toBe(0);
    expect(content.history).toEqual([]);
  });

  it('should overwrite existing log file on subsequent saves', () => {
    const log = createSessionLog('test task', projectDir, 'default');
    const sessionId = 'test-session-002';

    saveSessionLog(log, sessionId, projectDir);

    log.iterations = 3;
    log.status = 'completed';
    saveSessionLog(log, sessionId, projectDir);

    const filepath = join(projectDir, '.takt', 'logs', `${sessionId}.json`);
    const content = JSON.parse(readFileSync(filepath, 'utf-8')) as SessionLog;
    expect(content.iterations).toBe(3);
    expect(content.status).toBe('completed');
  });
});

describe('updateLatestPointer', () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = createTempProject();
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
  });

  it('should create latest.json with pointer data', () => {
    const log = createSessionLog('my task', projectDir, 'default');
    const sessionId = 'abc-123';

    updateLatestPointer(log, sessionId, projectDir);

    const latestPath = join(projectDir, '.takt', 'logs', 'latest.json');
    expect(existsSync(latestPath)).toBe(true);

    const pointer = JSON.parse(readFileSync(latestPath, 'utf-8')) as LatestLogPointer;
    expect(pointer.sessionId).toBe('abc-123');
    expect(pointer.logFile).toBe('abc-123.json');
    expect(pointer.task).toBe('my task');
    expect(pointer.workflowName).toBe('default');
    expect(pointer.status).toBe('running');
    expect(pointer.iterations).toBe(0);
    expect(pointer.startTime).toBeDefined();
    expect(pointer.updatedAt).toBeDefined();
  });

  it('should not create previous.json when copyToPrevious is false', () => {
    const log = createSessionLog('task', projectDir, 'wf');
    updateLatestPointer(log, 'sid-1', projectDir);

    const previousPath = join(projectDir, '.takt', 'logs', 'previous.json');
    expect(existsSync(previousPath)).toBe(false);
  });

  it('should not create previous.json when copyToPrevious is true but latest.json does not exist', () => {
    const log = createSessionLog('task', projectDir, 'wf');
    updateLatestPointer(log, 'sid-1', projectDir, { copyToPrevious: true });

    const previousPath = join(projectDir, '.takt', 'logs', 'previous.json');
    // latest.json didn't exist before this call, so previous.json should not be created
    expect(existsSync(previousPath)).toBe(false);
  });

  it('should copy latest.json to previous.json when copyToPrevious is true and latest exists', () => {
    const log1 = createSessionLog('first task', projectDir, 'wf1');
    updateLatestPointer(log1, 'sid-first', projectDir);

    // Simulate a second workflow starting
    const log2 = createSessionLog('second task', projectDir, 'wf2');
    updateLatestPointer(log2, 'sid-second', projectDir, { copyToPrevious: true });

    const logsDir = join(projectDir, '.takt', 'logs');
    const latest = JSON.parse(readFileSync(join(logsDir, 'latest.json'), 'utf-8')) as LatestLogPointer;
    const previous = JSON.parse(readFileSync(join(logsDir, 'previous.json'), 'utf-8')) as LatestLogPointer;

    // latest should point to second session
    expect(latest.sessionId).toBe('sid-second');
    expect(latest.task).toBe('second task');

    // previous should point to first session
    expect(previous.sessionId).toBe('sid-first');
    expect(previous.task).toBe('first task');
  });

  it('should not update previous.json on step-complete calls (no copyToPrevious)', () => {
    // Workflow 1 creates latest
    const log1 = createSessionLog('first', projectDir, 'wf');
    updateLatestPointer(log1, 'sid-1', projectDir);

    // Workflow 2 starts → copies latest to previous
    const log2 = createSessionLog('second', projectDir, 'wf');
    updateLatestPointer(log2, 'sid-2', projectDir, { copyToPrevious: true });

    // Step completes → updates only latest (no copyToPrevious)
    log2.iterations = 1;
    updateLatestPointer(log2, 'sid-2', projectDir);

    const logsDir = join(projectDir, '.takt', 'logs');
    const previous = JSON.parse(readFileSync(join(logsDir, 'previous.json'), 'utf-8')) as LatestLogPointer;

    // previous should still point to first session
    expect(previous.sessionId).toBe('sid-1');
  });

  it('should update iterations and status in latest.json on subsequent calls', () => {
    const log = createSessionLog('task', projectDir, 'wf');
    updateLatestPointer(log, 'sid-1', projectDir, { copyToPrevious: true });

    // Simulate step completion
    log.iterations = 2;
    updateLatestPointer(log, 'sid-1', projectDir);

    // Simulate workflow completion
    log.status = 'completed';
    log.iterations = 3;
    updateLatestPointer(log, 'sid-1', projectDir);

    const latestPath = join(projectDir, '.takt', 'logs', 'latest.json');
    const pointer = JSON.parse(readFileSync(latestPath, 'utf-8')) as LatestLogPointer;
    expect(pointer.status).toBe('completed');
    expect(pointer.iterations).toBe(3);
  });
});
