/**
 * Parallel step log display
 *
 * Provides prefixed, color-coded interleaved output for parallel sub-steps.
 * Each sub-step's stream output gets a `[name]` prefix with right-padding
 * aligned to the longest sub-step name.
 */

import type { StreamCallback, StreamEvent } from '../claude/types.js';

/** ANSI color codes for sub-step prefixes (cycled in order) */
const COLORS = ['\x1b[36m', '\x1b[33m', '\x1b[35m', '\x1b[32m'] as const; // cyan, yellow, magenta, green
const RESET = '\x1b[0m';

export interface ParallelLoggerOptions {
  /** Sub-step names (used to calculate prefix width) */
  subStepNames: string[];
  /** Parent onStream callback to delegate non-prefixed events */
  parentOnStream?: StreamCallback;
  /** Override process.stdout.write for testing */
  writeFn?: (text: string) => void;
}

/**
 * Logger for parallel step execution.
 *
 * Creates per-sub-step StreamCallback wrappers that:
 * - Buffer partial lines until newline
 * - Prepend colored `[name]` prefix to each complete line
 * - Delegate init/result/error events to the parent callback
 */
export class ParallelLogger {
  private readonly maxNameLength: number;
  private readonly lineBuffers: Map<string, string> = new Map();
  private readonly parentOnStream?: StreamCallback;
  private readonly writeFn: (text: string) => void;

  constructor(options: ParallelLoggerOptions) {
    this.maxNameLength = Math.max(...options.subStepNames.map((n) => n.length));
    this.parentOnStream = options.parentOnStream;
    this.writeFn = options.writeFn ?? ((text: string) => process.stdout.write(text));

    for (const name of options.subStepNames) {
      this.lineBuffers.set(name, '');
    }
  }

  /**
   * Build the colored prefix string for a sub-step.
   * Format: `\x1b[COLORm[name]\x1b[0m` + padding spaces
   */
  buildPrefix(name: string, index: number): string {
    const color = COLORS[index % COLORS.length]!;
    const padding = ' '.repeat(this.maxNameLength - name.length);
    return `${color}[${name}]${RESET}${padding} `;
  }

  /**
   * Create a StreamCallback wrapper for a specific sub-step.
   *
   * - `text`: buffered line-by-line with prefix
   * - `tool_use`, `tool_result`, `tool_output`, `thinking`: prefixed per-line, no buffering
   * - `init`, `result`, `error`: delegated to parent callback (no prefix)
   */
  createStreamHandler(subStepName: string, index: number): StreamCallback {
    const prefix = this.buildPrefix(subStepName, index);

    return (event: StreamEvent) => {
      switch (event.type) {
        case 'text':
          this.handleTextEvent(subStepName, prefix, event.data.text);
          break;

        case 'tool_use':
        case 'tool_result':
        case 'tool_output':
        case 'thinking':
          this.handleBlockEvent(prefix, event);
          break;

        case 'init':
        case 'result':
        case 'error':
          // Delegate to parent without prefix
          this.parentOnStream?.(event);
          break;
      }
    };
  }

  /**
   * Handle text event with line buffering.
   * Buffer until newline, then output prefixed complete lines.
   * Empty lines get no prefix per spec.
   */
  private handleTextEvent(name: string, prefix: string, text: string): void {
    const buffer = this.lineBuffers.get(name) ?? '';
    const combined = buffer + text;
    const parts = combined.split('\n');

    // Last part is incomplete (no trailing newline) — keep in buffer
    this.lineBuffers.set(name, parts.pop()!);

    // Output all complete lines
    for (const line of parts) {
      if (line === '') {
        this.writeFn('\n');
      } else {
        this.writeFn(`${prefix}${line}\n`);
      }
    }
  }

  /**
   * Handle block events (tool_use, tool_result, tool_output, thinking).
   * Output with prefix, splitting multi-line content.
   */
  private handleBlockEvent(prefix: string, event: StreamEvent): void {
    let text: string;
    switch (event.type) {
      case 'tool_use':
        text = `[tool] ${event.data.tool}`;
        break;
      case 'tool_result':
        text = event.data.content;
        break;
      case 'tool_output':
        text = event.data.output;
        break;
      case 'thinking':
        text = event.data.thinking;
        break;
      default:
        return;
    }

    for (const line of text.split('\n')) {
      if (line === '') {
        this.writeFn('\n');
      } else {
        this.writeFn(`${prefix}${line}\n`);
      }
    }
  }

  /**
   * Flush remaining line buffers for all sub-steps.
   * Call after all sub-steps complete to output any trailing partial lines.
   */
  flush(): void {
    // Build prefixes for flush — need index mapping
    // Since we don't store index, iterate lineBuffers in insertion order
    // (Map preserves insertion order, matching subStepNames order)
    let index = 0;
    for (const [name, buffer] of this.lineBuffers) {
      if (buffer !== '') {
        const prefix = this.buildPrefix(name, index);
        this.writeFn(`${prefix}${buffer}\n`);
        this.lineBuffers.set(name, '');
      }
      index++;
    }
  }

  /**
   * Print completion summary after all sub-steps finish.
   *
   * Format:
   * ```
   * ── parallel-review results ──
   *   arch-review:     approved
   *   security-review: rejected
   * ──────────────────────────────
   * ```
   */
  printSummary(
    parentStepName: string,
    results: Array<{ name: string; condition: string | undefined }>,
  ): void {
    this.flush();

    const maxResultNameLength = Math.max(...results.map((r) => r.name.length));

    const resultLines = results.map((r) => {
      const padding = ' '.repeat(maxResultNameLength - r.name.length);
      const condition = r.condition ?? '(no result)';
      return `  ${r.name}:${padding} ${condition}`;
    });

    // Header line: ── name results ──
    const headerText = ` ${parentStepName} results `;
    const maxLineLength = Math.max(
      headerText.length + 4, // 4 for "── " + " ──"
      ...resultLines.map((l) => l.length),
    );
    const sideWidth = Math.max(1, Math.floor((maxLineLength - headerText.length) / 2));
    const headerLine = `${'─'.repeat(sideWidth)}${headerText}${'─'.repeat(sideWidth)}`;
    const footerLine = '─'.repeat(headerLine.length);

    this.writeFn(`${headerLine}\n`);
    for (const line of resultLines) {
      this.writeFn(`${line}\n`);
    }
    this.writeFn(`${footerLine}\n`);
  }
}
