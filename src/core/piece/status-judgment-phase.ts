import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PieceMovement } from '../models/types.js';
import { judgeStatus } from './agent-usecases.js';
import { StatusJudgmentBuilder } from './instruction/StatusJudgmentBuilder.js';
import { getReportFiles } from './evaluation/rule-utils.js';
import { createLogger } from '../../shared/utils/index.js';
import type { PhaseRunnerContext } from './phase-runner.js';

const log = createLogger('phase-runner');

/**
 * Phase 3: Status judgment.
 * Uses the 'conductor' agent in a new session to output a status tag.
 * Implements multi-stage fallback logic to ensure judgment succeeds.
 * Returns the Phase 3 response content (containing the status tag).
 */
export async function runStatusJudgmentPhase(
  step: PieceMovement,
  ctx: PhaseRunnerContext,
): Promise<string> {
  log.debug('Running status judgment phase', { movement: step.name });
  if (!step.rules || step.rules.length === 0) {
    throw new Error(`Status judgment requires rules for movement "${step.name}"`);
  }

  const reportFiles = getReportFiles(step.outputContracts);
  let instruction: string | undefined;

  if (reportFiles.length > 0) {
    const reports: string[] = [];
    for (const fileName of reportFiles) {
      const filePath = resolve(ctx.reportDir, fileName);
      if (!existsSync(filePath)) {
        continue;
      }
      const content = readFileSync(filePath, 'utf-8');
      reports.push(`# ${fileName}\n\n${content}`);
    }
    if (reports.length > 0) {
      instruction = new StatusJudgmentBuilder(step, {
        language: ctx.language,
        reportContent: reports.join('\n\n---\n\n'),
        inputSource: 'report',
        useStructuredOutput: true,
      }).build();
    }
  }

  if (instruction == null) {
    if (!ctx.lastResponse) {
      throw new Error(`Status judgment requires report or lastResponse for movement "${step.name}"`);
    }

    instruction = new StatusJudgmentBuilder(step, {
      language: ctx.language,
      lastResponse: ctx.lastResponse,
      inputSource: 'response',
      useStructuredOutput: true,
    }).build();
  }

  ctx.onPhaseStart?.(step, 3, 'judge', instruction);
  try {
    const result = await judgeStatus(instruction, step.rules, {
      cwd: ctx.cwd,
      movementName: step.name,
      language: ctx.language,
    });
    const tag = `[${step.name.toUpperCase()}:${result.ruleIndex + 1}]`;
    ctx.onPhaseComplete?.(step, 3, 'judge', tag, 'done');
    return tag;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    ctx.onPhaseComplete?.(step, 3, 'judge', '', 'error', errorMsg);
    throw error;
  }
}
