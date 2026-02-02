/**
 * Codex SDK integration for agent interactions
 *
 * Uses @openai/codex-sdk for native TypeScript integration.
 */

import { Codex } from '@openai/codex-sdk';
import type { AgentResponse, Status } from '../models/types.js';
import type { StreamCallback } from '../claude/types.js';
import { createLogger } from '../utils/debug.js';
import { getErrorMessage } from '../utils/error.js';
import type { CodexCallOptions } from './types.js';

// Re-export for backward compatibility
export type { CodexCallOptions } from './types.js';

const log = createLogger('codex-sdk');

type CodexEvent = {
  type: string;
  [key: string]: unknown;
};

type CodexItem = {
  id?: string;
  type: string;
  [key: string]: unknown;
};

/**
 * Client for Codex SDK agent interactions.
 *
 * Handles thread management, streaming event conversion,
 * and response processing.
 */
export class CodexClient {
  // ---- Stream emission helpers (private) ----

  private static extractThreadId(value: unknown): string | undefined {
    if (!value || typeof value !== 'object') return undefined;
    const record = value as Record<string, unknown>;
    const id = record.id ?? record.thread_id ?? record.threadId;
    return typeof id === 'string' ? id : undefined;
  }

  private static emitInit(
    onStream: StreamCallback | undefined,
    model: string | undefined,
    sessionId: string | undefined,
  ): void {
    if (!onStream) return;
    onStream({
      type: 'init',
      data: {
        model: model || 'codex',
        sessionId: sessionId || 'unknown',
      },
    });
  }

  private static emitText(onStream: StreamCallback | undefined, text: string): void {
    if (!onStream || !text) return;
    onStream({ type: 'text', data: { text } });
  }

  private static emitThinking(onStream: StreamCallback | undefined, thinking: string): void {
    if (!onStream || !thinking) return;
    onStream({ type: 'thinking', data: { thinking } });
  }

  private static emitToolUse(
    onStream: StreamCallback | undefined,
    tool: string,
    input: Record<string, unknown>,
    id: string,
  ): void {
    if (!onStream) return;
    onStream({ type: 'tool_use', data: { tool, input, id } });
  }

  private static emitToolResult(
    onStream: StreamCallback | undefined,
    content: string,
    isError: boolean,
  ): void {
    if (!onStream) return;
    onStream({ type: 'tool_result', data: { content, isError } });
  }

  private static emitToolOutput(
    onStream: StreamCallback | undefined,
    tool: string,
    output: string,
  ): void {
    if (!onStream || !output) return;
    onStream({ type: 'tool_output', data: { tool, output } });
  }

  private static emitResult(
    onStream: StreamCallback | undefined,
    success: boolean,
    result: string,
    sessionId: string | undefined,
  ): void {
    if (!onStream) return;
    onStream({
      type: 'result',
      data: {
        result,
        sessionId: sessionId || 'unknown',
        success,
        error: success ? undefined : result || undefined,
      },
    });
  }

  private static formatFileChangeSummary(changes: Array<{ path?: string; kind?: string }>): string {
    if (!changes.length) return '';
    return changes
      .map((change) => {
        const kind = change.kind ? `${change.kind}: ` : '';
        return `${kind}${change.path ?? ''}`.trim();
      })
      .filter(Boolean)
      .join('\n');
  }

  private static emitCodexItemStart(
    item: CodexItem,
    onStream: StreamCallback | undefined,
    startedItems: Set<string>,
  ): void {
    if (!onStream) return;
    const id = item.id || `item_${Math.random().toString(36).slice(2, 10)}`;
    if (startedItems.has(id)) return;

    switch (item.type) {
      case 'command_execution': {
        const command = typeof item.command === 'string' ? item.command : '';
        CodexClient.emitToolUse(onStream, 'Bash', { command }, id);
        startedItems.add(id);
        break;
      }
      case 'mcp_tool_call': {
        const tool = typeof item.tool === 'string' ? item.tool : 'Tool';
        const args = (item.arguments ?? {}) as Record<string, unknown>;
        CodexClient.emitToolUse(onStream, tool, args, id);
        startedItems.add(id);
        break;
      }
      case 'web_search': {
        const query = typeof item.query === 'string' ? item.query : '';
        CodexClient.emitToolUse(onStream, 'WebSearch', { query }, id);
        startedItems.add(id);
        break;
      }
      case 'file_change': {
        const changes = Array.isArray(item.changes) ? item.changes : [];
        const summary = CodexClient.formatFileChangeSummary(changes as Array<{ path?: string; kind?: string }>);
        CodexClient.emitToolUse(onStream, 'Edit', { file_path: summary || 'patch' }, id);
        startedItems.add(id);
        break;
      }
      default:
        break;
    }
  }

  private static emitCodexItemCompleted(
    item: CodexItem,
    onStream: StreamCallback | undefined,
    startedItems: Set<string>,
    outputOffsets: Map<string, number>,
    textOffsets: Map<string, number>,
    thinkingOffsets: Map<string, number>,
  ): void {
    if (!onStream) return;
    const id = item.id || `item_${Math.random().toString(36).slice(2, 10)}`;

    switch (item.type) {
      case 'reasoning': {
        const text = typeof item.text === 'string' ? item.text : '';
        if (text) {
          const prev = thinkingOffsets.get(id) ?? 0;
          if (text.length > prev) {
            CodexClient.emitThinking(onStream, text.slice(prev) + '\n');
            thinkingOffsets.set(id, text.length);
          }
        }
        break;
      }
      case 'agent_message': {
        const text = typeof item.text === 'string' ? item.text : '';
        if (text) {
          const prev = textOffsets.get(id) ?? 0;
          if (text.length > prev) {
            CodexClient.emitText(onStream, text.slice(prev));
            textOffsets.set(id, text.length);
          }
        }
        break;
      }
      case 'command_execution': {
        if (!startedItems.has(id)) {
          CodexClient.emitCodexItemStart(item, onStream, startedItems);
        }
        const output = typeof item.aggregated_output === 'string' ? item.aggregated_output : '';
        if (output) {
          const prev = outputOffsets.get(id) ?? 0;
          if (output.length > prev) {
            CodexClient.emitToolOutput(onStream, 'Bash', output.slice(prev));
            outputOffsets.set(id, output.length);
          }
        }
        const exitCode = typeof item.exit_code === 'number' ? item.exit_code : undefined;
        const status = typeof item.status === 'string' ? item.status : '';
        const isError = status === 'failed' || (exitCode !== undefined && exitCode !== 0);
        const content = output || (exitCode !== undefined ? `Exit code: ${exitCode}` : '');
        CodexClient.emitToolResult(onStream, content, isError);
        break;
      }
      case 'mcp_tool_call': {
        if (!startedItems.has(id)) {
          CodexClient.emitCodexItemStart(item, onStream, startedItems);
        }
        const status = typeof item.status === 'string' ? item.status : '';
        const isError = status === 'failed' || !!item.error;
        const errorMessage =
          item.error && typeof item.error === 'object' && 'message' in item.error
            ? String((item.error as { message?: unknown }).message ?? '')
            : '';
        let content = errorMessage;
        if (!content && item.result && typeof item.result === 'object') {
          try {
            content = JSON.stringify(item.result);
          } catch {
            content = '';
          }
        }
        CodexClient.emitToolResult(onStream, content, isError);
        break;
      }
      case 'web_search': {
        if (!startedItems.has(id)) {
          CodexClient.emitCodexItemStart(item, onStream, startedItems);
        }
        CodexClient.emitToolResult(onStream, 'Search completed', false);
        break;
      }
      case 'file_change': {
        if (!startedItems.has(id)) {
          CodexClient.emitCodexItemStart(item, onStream, startedItems);
        }
        const status = typeof item.status === 'string' ? item.status : '';
        const isError = status === 'failed';
        const changes = Array.isArray(item.changes) ? item.changes : [];
        const summary = CodexClient.formatFileChangeSummary(changes as Array<{ path?: string; kind?: string }>);
        CodexClient.emitToolResult(onStream, summary || 'Applied patch', isError);
        break;
      }
      default:
        break;
    }
  }

  private static emitCodexItemUpdate(
    item: CodexItem,
    onStream: StreamCallback | undefined,
    startedItems: Set<string>,
    outputOffsets: Map<string, number>,
    textOffsets: Map<string, number>,
    thinkingOffsets: Map<string, number>,
  ): void {
    if (!onStream) return;
    const id = item.id || `item_${Math.random().toString(36).slice(2, 10)}`;

    switch (item.type) {
      case 'command_execution': {
        if (!startedItems.has(id)) {
          CodexClient.emitCodexItemStart(item, onStream, startedItems);
        }
        const output = typeof item.aggregated_output === 'string' ? item.aggregated_output : '';
        if (output) {
          const prev = outputOffsets.get(id) ?? 0;
          if (output.length > prev) {
            CodexClient.emitToolOutput(onStream, 'Bash', output.slice(prev));
            outputOffsets.set(id, output.length);
          }
        }
        break;
      }
      case 'agent_message': {
        const text = typeof item.text === 'string' ? item.text : '';
        if (text) {
          const prev = textOffsets.get(id) ?? 0;
          if (text.length > prev) {
            CodexClient.emitText(onStream, text.slice(prev));
            textOffsets.set(id, text.length);
          }
        }
        break;
      }
      case 'reasoning': {
        const text = typeof item.text === 'string' ? item.text : '';
        if (text) {
          const prev = thinkingOffsets.get(id) ?? 0;
          if (text.length > prev) {
            CodexClient.emitThinking(onStream, text.slice(prev));
            thinkingOffsets.set(id, text.length);
          }
        }
        break;
      }
      case 'file_change':
      case 'mcp_tool_call':
      case 'web_search': {
        if (!startedItems.has(id)) {
          CodexClient.emitCodexItemStart(item, onStream, startedItems);
        }
        break;
      }
      default:
        break;
    }
  }

  // ---- Public API ----

  /** Call Codex with an agent prompt */
  async call(
    agentType: string,
    prompt: string,
    options: CodexCallOptions,
  ): Promise<AgentResponse> {
    const codex = new Codex(options.openaiApiKey ? { apiKey: options.openaiApiKey } : undefined);
    const threadOptions = {
      model: options.model,
      workingDirectory: options.cwd,
    };
    const thread = options.sessionId
      ? await codex.resumeThread(options.sessionId, threadOptions)
      : await codex.startThread(threadOptions);
    let threadId = CodexClient.extractThreadId(thread) || options.sessionId;

    const fullPrompt = options.systemPrompt
      ? `${options.systemPrompt}\n\n${prompt}`
      : prompt;

    try {
      log.debug('Executing Codex thread', {
        agentType,
        model: options.model,
        hasSystemPrompt: !!options.systemPrompt,
      });

      const { events } = await thread.runStreamed(fullPrompt);
      let content = '';
      const contentOffsets = new Map<string, number>();
      let success = true;
      let failureMessage = '';
      const startedItems = new Set<string>();
      const outputOffsets = new Map<string, number>();
      const textOffsets = new Map<string, number>();
      const thinkingOffsets = new Map<string, number>();

      for await (const event of events as AsyncGenerator<CodexEvent>) {
        if (event.type === 'thread.started') {
          threadId = typeof event.thread_id === 'string' ? event.thread_id : threadId;
          CodexClient.emitInit(options.onStream, options.model, threadId);
          continue;
        }

        if (event.type === 'turn.failed') {
          success = false;
          if (event.error && typeof event.error === 'object' && 'message' in event.error) {
            failureMessage = String((event.error as { message?: unknown }).message ?? '');
          }
          break;
        }

        if (event.type === 'error') {
          success = false;
          failureMessage = typeof event.message === 'string' ? event.message : 'Unknown error';
          break;
        }

        if (event.type === 'item.started') {
          const item = event.item as CodexItem | undefined;
          if (item) {
            CodexClient.emitCodexItemStart(item, options.onStream, startedItems);
          }
          continue;
        }

        if (event.type === 'item.updated') {
          const item = event.item as CodexItem | undefined;
          if (item) {
            if (item.type === 'agent_message' && typeof item.text === 'string') {
              const itemId = item.id;
              const text = item.text;
              if (itemId) {
                const prev = contentOffsets.get(itemId) ?? 0;
                if (text.length > prev) {
                  if (prev === 0 && content.length > 0) {
                    content += '\n';
                  }
                  content += text.slice(prev);
                  contentOffsets.set(itemId, text.length);
                }
              }
            }
            CodexClient.emitCodexItemUpdate(item, options.onStream, startedItems, outputOffsets, textOffsets, thinkingOffsets);
          }
          continue;
        }

        if (event.type === 'item.completed') {
          const item = event.item as CodexItem | undefined;
          if (item) {
            if (item.type === 'agent_message' && typeof item.text === 'string') {
              const itemId = item.id;
              const text = item.text;
              if (itemId) {
                const prev = contentOffsets.get(itemId) ?? 0;
                if (text.length > prev) {
                  if (prev === 0 && content.length > 0) {
                    content += '\n';
                  }
                  content += text.slice(prev);
                  contentOffsets.set(itemId, text.length);
                }
              } else if (text) {
                if (content.length > 0) {
                  content += '\n';
                }
                content += text;
              }
            }
            CodexClient.emitCodexItemCompleted(
              item,
              options.onStream,
              startedItems,
              outputOffsets,
              textOffsets,
              thinkingOffsets,
            );
          }
          continue;
        }
      }

      if (!success) {
        const message = failureMessage || 'Codex execution failed';
        CodexClient.emitResult(options.onStream, false, message, threadId);
        return {
          agent: agentType,
          status: 'blocked',
          content: message,
          timestamp: new Date(),
          sessionId: threadId,
        };
      }

      const trimmed = content.trim();
      CodexClient.emitResult(options.onStream, true, trimmed, threadId);

      return {
        agent: agentType,
        status: 'done',
        content: trimmed,
        timestamp: new Date(),
        sessionId: threadId,
      };
    } catch (error) {
      const message = getErrorMessage(error);
      CodexClient.emitResult(options.onStream, false, message, threadId);

      return {
        agent: agentType,
        status: 'blocked',
        content: message,
        timestamp: new Date(),
        sessionId: threadId,
      };
    }
  }

  /** Call Codex with a custom agent configuration (system prompt + prompt) */
  async callCustom(
    agentName: string,
    prompt: string,
    systemPrompt: string,
    options: CodexCallOptions,
  ): Promise<AgentResponse> {
    return this.call(agentName, prompt, {
      ...options,
      systemPrompt,
    });
  }
}

// ---- Backward-compatible module-level functions ----

const defaultClient = new CodexClient();

export async function callCodex(
  agentType: string,
  prompt: string,
  options: CodexCallOptions,
): Promise<AgentResponse> {
  return defaultClient.call(agentType, prompt, options);
}

export async function callCodexCustom(
  agentName: string,
  prompt: string,
  systemPrompt: string,
  options: CodexCallOptions,
): Promise<AgentResponse> {
  return defaultClient.callCustom(agentName, prompt, systemPrompt, options);
}
