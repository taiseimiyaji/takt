/**
 * Phase 2 instruction builder (report output)
 *
 * Builds the instruction for the report output phase. Includes:
 * - Execution Context (cwd + rules)
 * - Workflow Context (report info only)
 * - Report output instruction + format
 *
 * Does NOT include: User Request, Previous Response, User Inputs,
 * Status rules, instruction_template.
 */

import type { WorkflowStep, Language } from '../../models/types.js';
import type { InstructionContext } from '../instruction-context.js';
import { METADATA_STRINGS } from '../instruction-context.js';
import { replaceTemplatePlaceholders } from './escape.js';
import { isReportObjectConfig, renderReportContext, renderReportOutputInstruction } from './InstructionBuilder.js';

/** Localized strings for report phase execution rules */
const REPORT_PHASE_STRINGS = {
  en: {
    noSourceEdit: '**Do NOT modify project source files.** Only output report files.',
    instructionBody: 'Output the results of your previous work as a report.',
  },
  ja: {
    noSourceEdit: '**プロジェクトのソースファイルを変更しないでください。** レポートファイルのみ出力してください。',
    instructionBody: '前のステップの作業結果をレポートとして出力してください。',
  },
} as const;

/** Localized section strings (shared subset) */
const SECTION_STRINGS = {
  en: { workflowContext: '## Workflow Context', instructions: '## Instructions' },
  ja: { workflowContext: '## Workflow Context', instructions: '## Instructions' },
} as const;

/**
 * Context for building report phase instruction.
 */
export interface ReportInstructionContext {
  /** Working directory */
  cwd: string;
  /** Report directory path */
  reportDir: string;
  /** Step iteration (for {step_iteration} replacement) */
  stepIteration: number;
  /** Language */
  language?: Language;
}

/**
 * Builds Phase 2 (report output) instructions.
 */
export class ReportInstructionBuilder {
  constructor(
    private readonly step: WorkflowStep,
    private readonly context: ReportInstructionContext,
  ) {}

  build(): string {
    if (!this.step.report) {
      throw new Error(`ReportInstructionBuilder called for step "${this.step.name}" which has no report config`);
    }

    const language = this.context.language ?? 'en';
    const s = SECTION_STRINGS[language];
    const r = REPORT_PHASE_STRINGS[language];
    const m = METADATA_STRINGS[language];
    const sections: string[] = [];

    // 1. Execution Context
    const execLines = [
      m.heading,
      `- ${m.workingDirectory}: ${this.context.cwd}`,
      '',
      m.rulesHeading,
      `- ${m.noCommit}`,
      `- ${m.noCd}`,
      `- ${r.noSourceEdit}`,
    ];
    if (m.note) {
      execLines.push('');
      execLines.push(m.note);
    }
    execLines.push('');
    sections.push(execLines.join('\n'));

    // 2. Workflow Context (report info only)
    const workflowLines = [
      s.workflowContext,
      renderReportContext(this.step.report, this.context.reportDir, language),
    ];
    sections.push(workflowLines.join('\n'));

    // 3. Instructions + report output instruction + format
    const instrParts: string[] = [
      s.instructions,
      r.instructionBody,
    ];

    // Report output instruction (auto-generated or explicit order)
    const reportContext: InstructionContext = {
      task: '',
      iteration: 0,
      maxIterations: 0,
      stepIteration: this.context.stepIteration,
      cwd: this.context.cwd,
      projectCwd: this.context.cwd,
      userInputs: [],
      reportDir: this.context.reportDir,
      language,
    };

    if (isReportObjectConfig(this.step.report) && this.step.report.order) {
      const processedOrder = replaceTemplatePlaceholders(this.step.report.order.trimEnd(), this.step, reportContext);
      instrParts.push('');
      instrParts.push(processedOrder);
    } else {
      const reportInstruction = renderReportOutputInstruction(this.step, reportContext, language);
      if (reportInstruction) {
        instrParts.push('');
        instrParts.push(reportInstruction);
      }
    }

    // Report format
    if (isReportObjectConfig(this.step.report) && this.step.report.format) {
      const processedFormat = replaceTemplatePlaceholders(this.step.report.format.trimEnd(), this.step, reportContext);
      instrParts.push('');
      instrParts.push(processedFormat);
    }

    sections.push(instrParts.join('\n'));

    return sections.join('\n\n');
  }
}
