/**
 * Task name summarization using AI
 *
 * Generates concise English summaries for use in branch names and worktree paths.
 */

import { callClaude } from '../claude/client.js';
import { createLogger } from '../utils/debug.js';

const log = createLogger('summarize');

const SUMMARIZE_SYSTEM_PROMPT = `You are a helpful assistant that generates concise English slugs for git branch names.

Rules:
- Output ONLY the slug, nothing else
- Use lowercase letters, numbers, and hyphens only
- Maximum 30 characters
- No leading/trailing hyphens
- Be descriptive but concise
- If the input is already in English and short, simplify it

Examples:
- "認証機能を追加する" → "add-auth"
- "Fix the login bug" → "fix-login-bug"
- "worktreeを作るときブランチ名をAIで生成" → "ai-branch-naming"
- "Add user registration with email verification" → "add-user-registration"`;

export interface SummarizeOptions {
  /** Working directory for Claude execution */
  cwd: string;
  /** Model to use (optional, defaults to haiku for speed) */
  model?: string;
}

/**
 * Summarize a task name into a concise English slug using AI.
 *
 * @param taskName - Original task name (can be in any language)
 * @param options - Summarization options
 * @returns English slug suitable for branch names
 */
export async function summarizeTaskName(
  taskName: string,
  options: SummarizeOptions
): Promise<string> {
  log.info('Summarizing task name', { taskName });

  const response = await callClaude('summarizer', `Summarize this task: "${taskName}"`, {
    cwd: options.cwd,
    model: options.model ?? 'haiku',
    maxTurns: 1,
    systemPrompt: SUMMARIZE_SYSTEM_PROMPT,
    allowedTools: [],
  });

  const slug = response.content
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 30);

  log.info('Task name summarized', { original: taskName, slug });

  return slug || 'task';
}
