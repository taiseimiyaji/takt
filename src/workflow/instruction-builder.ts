/**
 * Instruction template builder for workflow steps
 *
 * Builds the instruction string for agent execution by replacing
 * template placeholders with actual values.
 */

import type { WorkflowStep, WorkflowRule, AgentResponse, Language } from '../models/types.js';
import { getGitDiff } from '../agents/runner.js';

/**
 * Context for building instruction from template.
 */
export interface InstructionContext {
  /** The main task/prompt */
  task: string;
  /** Current iteration number (workflow-wide turn count) */
  iteration: number;
  /** Maximum iterations allowed */
  maxIterations: number;
  /** Current step's iteration number (how many times this step has been executed) */
  stepIteration: number;
  /** Working directory (agent work dir, may be a clone) */
  cwd: string;
  /** Project root directory (where .takt/ lives). Defaults to cwd. */
  projectCwd?: string;
  /** User inputs accumulated during workflow */
  userInputs: string[];
  /** Previous step output if available */
  previousOutput?: AgentResponse;
  /** Report directory path */
  reportDir?: string;
  /** Language for metadata rendering. Defaults to 'en'. */
  language?: Language;
}

/** Execution environment metadata prepended to agent instructions */
export interface ExecutionMetadata {
  /** The agent's working directory (may be a clone) */
  readonly workingDirectory: string;
  /** Language for metadata rendering */
  readonly language: Language;
}

/**
 * Build execution metadata from instruction context.
 *
 * Pure function: InstructionContext → ExecutionMetadata.
 */
export function buildExecutionMetadata(context: InstructionContext): ExecutionMetadata {
  return {
    workingDirectory: context.cwd,
    language: context.language ?? 'en',
  };
}

/** Localized strings for status rules header */
const STATUS_RULES_HEADER_STRINGS = {
  en: {
    heading: '# ⚠️ Required: Status Output Rules ⚠️',
    warning: '**The workflow will stop without this tag.**',
    instruction: 'Your final output MUST include a status tag following the rules below.',
  },
  ja: {
    heading: '# ⚠️ 必須: ステータス出力ルール ⚠️',
    warning: '**このタグがないとワークフローが停止します。**',
    instruction: '最終出力には必ず以下のルールに従ったステータスタグを含めてください。',
  },
} as const;

/**
 * Render status rules header.
 * Prepended to auto-generated status rules from workflow rules.
 */
export function renderStatusRulesHeader(language: Language): string {
  const strings = STATUS_RULES_HEADER_STRINGS[language];
  return [strings.heading, '', strings.warning, strings.instruction, ''].join('\n');
}

/** Localized strings for rules-based status prompt */
const RULES_PROMPT_STRINGS = {
  en: {
    criteriaHeading: '## Decision Criteria',
    headerNum: '#',
    headerCondition: 'Condition',
    headerTag: 'Tag',
    outputHeading: '## Output Format',
    outputInstruction: 'Output the tag corresponding to your decision:',
    appendixHeading: '### Appendix Template',
    appendixInstruction: 'When outputting `[{tag}]`, append the following:',
  },
  ja: {
    criteriaHeading: '## 判定基準',
    headerNum: '#',
    headerCondition: '状況',
    headerTag: 'タグ',
    outputHeading: '## 出力フォーマット',
    outputInstruction: '判定に対応するタグを出力してください:',
    appendixHeading: '### 追加出力テンプレート',
    appendixInstruction: '`[{tag}]` を出力する場合、以下を追記してください:',
  },
} as const;

/**
 * Generate status rules prompt from rules configuration.
 * Creates a structured prompt that tells the agent which numbered tags to output.
 *
 * Example output for step "plan" with 3 rules:
 *   ## 判定基準
 *   | # | 状況 | タグ |
 *   |---|------|------|
 *   | 1 | 要件が明確で実装可能 | `[PLAN:1]` |
 *   | 2 | ユーザーが質問をしている | `[PLAN:2]` |
 *   | 3 | 要件が不明確、情報不足 | `[PLAN:3]` |
 */
export function generateStatusRulesFromRules(
  stepName: string,
  rules: WorkflowRule[],
  language: Language,
): string {
  const tag = stepName.toUpperCase();
  const strings = RULES_PROMPT_STRINGS[language];

  const lines: string[] = [];

  // Criteria table
  lines.push(strings.criteriaHeading);
  lines.push('');
  lines.push(`| ${strings.headerNum} | ${strings.headerCondition} | ${strings.headerTag} |`);
  lines.push('|---|------|------|');
  for (const [i, rule] of rules.entries()) {
    lines.push(`| ${i + 1} | ${rule.condition} | \`[${tag}:${i + 1}]\` |`);
  }
  lines.push('');

  // Output format
  lines.push(strings.outputHeading);
  lines.push('');
  lines.push(strings.outputInstruction);
  lines.push('');
  for (const [i, rule] of rules.entries()) {
    lines.push(`- \`[${tag}:${i + 1}]\` — ${rule.condition}`);
  }

  // Appendix templates (if any rules have appendix)
  const rulesWithAppendix = rules.filter((r) => r.appendix);
  if (rulesWithAppendix.length > 0) {
    lines.push('');
    lines.push(strings.appendixHeading);
    for (const [i, rule] of rules.entries()) {
      if (!rule.appendix) continue;
      const tagStr = `[${tag}:${i + 1}]`;
      lines.push('');
      lines.push(strings.appendixInstruction.replace('{tag}', tagStr));
      lines.push('```');
      lines.push(rule.appendix.trimEnd());
      lines.push('```');
    }
  }

  return lines.join('\n');
}

/** Localized strings for execution metadata rendering */
const METADATA_STRINGS = {
  en: {
    heading: '## Execution Context',
    workingDirectory: 'Working Directory',
    rulesHeading: '## Execution Rules',
    noCommit: '**Do NOT run git commit.** Commits are handled automatically by the system after workflow completion.',
    noCd: '**Do NOT use `cd` in Bash commands.** Your working directory is already set correctly. Run commands directly without changing directories.',
    note: 'Note: This section is metadata. Follow the language used in the rest of the prompt.',
  },
  ja: {
    heading: '## 実行コンテキスト',
    workingDirectory: '作業ディレクトリ',
    rulesHeading: '## 実行ルール',
    noCommit: '**git commit を実行しないでください。** コミットはワークフロー完了後にシステムが自動で行います。',
    noCd: '**Bashコマンドで `cd` を使用しないでください。** 作業ディレクトリは既に正しく設定されています。ディレクトリを変更せずにコマンドを実行してください。',
    note: '',
  },
} as const;

/**
 * Render execution metadata as a markdown string.
 *
 * Pure function: ExecutionMetadata → string.
 * Always includes heading + Working Directory + Execution Rules.
 * Language determines the output language; 'en' includes a note about language consistency.
 */
export function renderExecutionMetadata(metadata: ExecutionMetadata): string {
  const strings = METADATA_STRINGS[metadata.language];
  const lines = [
    strings.heading,
    `- ${strings.workingDirectory}: ${metadata.workingDirectory}`,
    '',
    strings.rulesHeading,
    `- ${strings.noCommit}`,
    `- ${strings.noCd}`,
  ];
  if (strings.note) {
    lines.push('');
    lines.push(strings.note);
  }
  lines.push('');
  return lines.join('\n');
}

/**
 * Escape special characters in dynamic content to prevent template injection.
 */
function escapeTemplateChars(str: string): string {
  return str.replace(/\{/g, '｛').replace(/\}/g, '｝');
}

/**
 * Build instruction from template with context values.
 *
 * Supported placeholders:
 * - {task} - The main task/prompt
 * - {iteration} - Current iteration number (workflow-wide turn count)
 * - {max_iterations} - Maximum iterations allowed
 * - {step_iteration} - Current step's iteration number (how many times this step has been executed)
 * - {previous_response} - Output from previous step (if passPreviousResponse is true)
 * - {git_diff} - Current git diff output
 * - {user_inputs} - Accumulated user inputs
 * - {report_dir} - Report directory name (e.g., "20250126-143052-task-summary")
 */
export function buildInstruction(
  step: WorkflowStep,
  context: InstructionContext
): string {
  let instruction = step.instructionTemplate;

  // Replace {task}
  instruction = instruction.replace(/\{task\}/g, escapeTemplateChars(context.task));

  // Replace {iteration}, {max_iterations}, and {step_iteration}
  instruction = instruction.replace(/\{iteration\}/g, String(context.iteration));
  instruction = instruction.replace(/\{max_iterations\}/g, String(context.maxIterations));
  instruction = instruction.replace(/\{step_iteration\}/g, String(context.stepIteration));

  // Replace {previous_response}
  if (step.passPreviousResponse) {
    if (context.previousOutput) {
      instruction = instruction.replace(
        /\{previous_response\}/g,
        escapeTemplateChars(context.previousOutput.content)
      );
    } else {
      instruction = instruction.replace(/\{previous_response\}/g, '');
    }
  }

  // Replace {git_diff}
  const gitDiff = getGitDiff(context.cwd);
  instruction = instruction.replace(/\{git_diff\}/g, gitDiff);

  // Replace {user_inputs}
  const userInputsStr = context.userInputs.join('\n');
  instruction = instruction.replace(
    /\{user_inputs\}/g,
    escapeTemplateChars(userInputsStr)
  );

  // Replace {report_dir} with the directory name, keeping paths relative.
  // In worktree mode, a symlink from cwd/.takt/reports → projectCwd/.takt/reports
  // ensures the relative path resolves correctly without embedding absolute paths
  // that could cause agents to operate on the wrong repository.
  if (context.reportDir) {
    instruction = instruction.replace(/\{report_dir\}/g, context.reportDir);
  }

  // Append auto-generated status rules from rules
  const language = context.language ?? 'en';
  if (step.rules && step.rules.length > 0) {
    const statusHeader = renderStatusRulesHeader(language);
    const generatedPrompt = generateStatusRulesFromRules(step.name, step.rules, language);
    instruction = `${instruction}\n\n${statusHeader}\n${generatedPrompt}`;
  }

  // Prepend execution context metadata so agents see it first.
  // Now language-aware, so no need to hide it at the end.
  const metadata = buildExecutionMetadata(context);
  instruction = `${renderExecutionMetadata(metadata)}\n${instruction}`;

  return instruction;
}
