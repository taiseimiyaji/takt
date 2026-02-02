/**
 * UI utilities for terminal output
 */

import chalk from 'chalk';
import type { StreamEvent, StreamCallback } from '../claude/types.js';

/** Log levels */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/** Log level priorities */
const LOG_PRIORITIES: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/**
 * Manages console log output level and provides formatted logging.
 * Singleton — use LogManager.getInstance().
 */
export class LogManager {
  private static instance: LogManager | null = null;
  private currentLogLevel: LogLevel = 'info';

  private constructor() {}

  static getInstance(): LogManager {
    if (!LogManager.instance) {
      LogManager.instance = new LogManager();
    }
    return LogManager.instance;
  }

  /** Reset singleton for testing */
  static resetInstance(): void {
    LogManager.instance = null;
  }

  /** Set log level */
  setLogLevel(level: LogLevel): void {
    this.currentLogLevel = level;
  }

  /** Check if a log level should be shown */
  shouldLog(level: LogLevel): boolean {
    return LOG_PRIORITIES[level] >= LOG_PRIORITIES[this.currentLogLevel];
  }

  /** Log a debug message */
  debug(message: string): void {
    if (this.shouldLog('debug')) {
      console.log(chalk.gray(`[DEBUG] ${message}`));
    }
  }

  /** Log an info message */
  info(message: string): void {
    if (this.shouldLog('info')) {
      console.log(chalk.blue(`[INFO] ${message}`));
    }
  }

  /** Log a warning message */
  warn(message: string): void {
    if (this.shouldLog('warn')) {
      console.log(chalk.yellow(`[WARN] ${message}`));
    }
  }

  /** Log an error message */
  error(message: string): void {
    if (this.shouldLog('error')) {
      console.log(chalk.red(`[ERROR] ${message}`));
    }
  }

  /** Log a success message */
  success(message: string): void {
    console.log(chalk.green(message));
  }
}

// ---- Backward-compatible module-level functions ----

export function setLogLevel(level: LogLevel): void {
  LogManager.getInstance().setLogLevel(level);
}

export function blankLine(): void {
  console.log();
}

export function debug(message: string): void {
  LogManager.getInstance().debug(message);
}

export function info(message: string): void {
  LogManager.getInstance().info(message);
}

export function warn(message: string): void {
  LogManager.getInstance().warn(message);
}

export function error(message: string): void {
  LogManager.getInstance().error(message);
}

export function success(message: string): void {
  LogManager.getInstance().success(message);
}

export function header(title: string): void {
  console.log();
  console.log(chalk.bold.cyan(`=== ${title} ===`));
  console.log();
}

export function section(title: string): void {
  console.log(chalk.bold(`\n${title}`));
}

export function status(label: string, value: string, color?: 'green' | 'yellow' | 'red'): void {
  const colorFn = color ? chalk[color] : chalk.white;
  console.log(`${chalk.gray(label)}: ${colorFn(value)}`);
}

/** Spinner for async operations */
export class Spinner {
  private intervalId?: ReturnType<typeof setInterval>;
  private frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  private currentFrame = 0;
  private message: string;

  constructor(message: string) {
    this.message = message;
  }

  start(): void {
    this.intervalId = setInterval(() => {
      process.stdout.write(
        `\r${chalk.cyan(this.frames[this.currentFrame])} ${this.message}`
      );
      this.currentFrame = (this.currentFrame + 1) % this.frames.length;
    }, 80);
  }

  stop(finalMessage?: string): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
    process.stdout.write('\r' + ' '.repeat(this.message.length + 10) + '\r');
    if (finalMessage) {
      console.log(finalMessage);
    }
  }

  update(message: string): void {
    this.message = message;
  }
}

export function progressBar(current: number, total: number, width = 30): string {
  const percentage = Math.floor((current / total) * 100);
  const filled = Math.floor((current / total) * width);
  const empty = width - filled;
  const bar = chalk.green('█'.repeat(filled)) + chalk.gray('░'.repeat(empty));
  return `[${bar}] ${percentage}%`;
}

export function list(items: string[], bullet = '•'): void {
  for (const item of items) {
    console.log(chalk.gray(bullet) + ' ' + item);
  }
}

export function divider(char = '─', length = 40): void {
  console.log(chalk.gray(char.repeat(length)));
}

export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  return text.slice(0, maxLength - 3) + '...';
}

/** Stream display manager for real-time Claude output */
export class StreamDisplay {
  private lastToolUse: string | null = null;
  private currentToolInputPreview: string | null = null;
  private toolOutputBuffer = '';
  private toolOutputPrinted = false;
  private textBuffer = '';
  private thinkingBuffer = '';
  private isFirstText = true;
  private isFirstThinking = true;
  private toolSpinner: {
    intervalId: ReturnType<typeof setInterval>;
    toolName: string;
    message: string;
  } | null = null;
  private spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  private spinnerFrame = 0;

  constructor(
    private agentName = 'Claude',
    private quiet = false,
  ) {}

  showInit(model: string): void {
    if (this.quiet) return;
    console.log(chalk.gray(`[${this.agentName}] Model: ${model}`));
  }

  private startToolSpinner(tool: string, inputPreview: string): void {
    this.stopToolSpinner();

    const message = `${chalk.yellow(tool)} ${chalk.gray(inputPreview)}`;
    this.toolSpinner = {
      intervalId: setInterval(() => {
        const frame = this.spinnerFrames[this.spinnerFrame];
        this.spinnerFrame = (this.spinnerFrame + 1) % this.spinnerFrames.length;
        process.stdout.write(`\r  ${chalk.cyan(frame)} ${message}`);
      }, 80),
      toolName: tool,
      message,
    };
  }

  private stopToolSpinner(): void {
    if (this.toolSpinner) {
      clearInterval(this.toolSpinner.intervalId);
      process.stdout.write('\r' + ' '.repeat(120) + '\r');
      this.toolSpinner = null;
      this.spinnerFrame = 0;
    }
  }

  showToolUse(tool: string, input: Record<string, unknown>): void {
    if (this.quiet) return;
    this.flushText();
    const inputPreview = this.formatToolInput(tool, input);
    this.startToolSpinner(tool, inputPreview);
    this.lastToolUse = tool;
    this.currentToolInputPreview = inputPreview;
    this.toolOutputBuffer = '';
    this.toolOutputPrinted = false;
  }

  showToolOutput(output: string, tool?: string): void {
    if (this.quiet) return;
    if (!output) return;
    this.stopToolSpinner();
    this.flushThinking();
    this.flushText();

    if (tool && !this.lastToolUse) {
      this.lastToolUse = tool;
    }

    this.toolOutputBuffer += output;
    const lines = this.toolOutputBuffer.split(/\r?\n/);
    this.toolOutputBuffer = lines.pop() ?? '';

    this.printToolOutputLines(lines, tool);

    if (this.lastToolUse && this.currentToolInputPreview) {
      this.startToolSpinner(this.lastToolUse, this.currentToolInputPreview);
    }
  }

  showToolResult(content: string, isError: boolean): void {
    this.stopToolSpinner();

    if (this.quiet) {
      if (isError) {
        const toolName = this.lastToolUse || 'Tool';
        const errorContent = content || 'Unknown error';
        console.log(chalk.red(`  ✗ ${toolName}:`), chalk.red(truncate(errorContent, 70)));
      }
      this.lastToolUse = null;
      this.currentToolInputPreview = null;
      this.toolOutputPrinted = false;
      return;
    }

    if (this.toolOutputBuffer) {
      this.printToolOutputLines([this.toolOutputBuffer], this.lastToolUse ?? undefined);
      this.toolOutputBuffer = '';
    }

    const toolName = this.lastToolUse || 'Tool';
    if (isError) {
      const errorContent = content || 'Unknown error';
      console.log(chalk.red(`  ✗ ${toolName}:`), chalk.red(truncate(errorContent, 70)));
    } else if (content && content.length > 0) {
      const preview = content.split('\n')[0] || content;
      console.log(chalk.green(`  ✓ ${toolName}`), chalk.gray(truncate(preview, 60)));
    } else {
      console.log(chalk.green(`  ✓ ${toolName}`));
    }
    this.lastToolUse = null;
    this.currentToolInputPreview = null;
    this.toolOutputPrinted = false;
  }

  showThinking(thinking: string): void {
    if (this.quiet) return;
    this.stopToolSpinner();
    this.flushText();

    if (this.isFirstThinking) {
      console.log();
      console.log(chalk.magenta(`💭 [${this.agentName} thinking]:`));
      this.isFirstThinking = false;
    }
    process.stdout.write(chalk.gray.italic(thinking));
    this.thinkingBuffer += thinking;
  }

  flushThinking(): void {
    if (this.thinkingBuffer) {
      if (!this.thinkingBuffer.endsWith('\n')) {
        console.log();
      }
      this.thinkingBuffer = '';
      this.isFirstThinking = true;
    }
  }

  showText(text: string): void {
    if (this.quiet) return;
    this.stopToolSpinner();
    this.flushThinking();

    if (this.isFirstText) {
      console.log();
      console.log(chalk.cyan(`[${this.agentName}]:`));
      this.isFirstText = false;
    }
    process.stdout.write(text);
    this.textBuffer += text;
  }

  flushText(): void {
    if (this.textBuffer) {
      if (!this.textBuffer.endsWith('\n')) {
        console.log();
      }
      this.textBuffer = '';
      this.isFirstText = true;
    }
  }

  flush(): void {
    this.stopToolSpinner();
    this.flushThinking();
    this.flushText();
  }

  showResult(success: boolean, error?: string): void {
    this.stopToolSpinner();
    this.flushThinking();
    this.flushText();
    console.log();
    if (success) {
      console.log(chalk.green('✓ Complete'));
    } else {
      console.log(chalk.red('✗ Failed'));
      if (error) {
        console.log(chalk.red(`  ${error}`));
      }
    }
  }

  reset(): void {
    this.stopToolSpinner();
    this.lastToolUse = null;
    this.currentToolInputPreview = null;
    this.toolOutputBuffer = '';
    this.toolOutputPrinted = false;
    this.textBuffer = '';
    this.thinkingBuffer = '';
    this.isFirstText = true;
    this.isFirstThinking = true;
  }

  createHandler(): StreamCallback {
    return (event: StreamEvent): void => {
      switch (event.type) {
        case 'init':
          this.showInit(event.data.model);
          break;
        case 'tool_use':
          this.showToolUse(event.data.tool, event.data.input);
          break;
        case 'tool_result':
          this.showToolResult(event.data.content, event.data.isError);
          break;
        case 'tool_output':
          this.showToolOutput(event.data.output, event.data.tool);
          break;
        case 'text':
          this.showText(event.data.text);
          break;
        case 'thinking':
          this.showThinking(event.data.thinking);
          break;
        case 'result':
          this.showResult(event.data.success, event.data.error);
          break;
        case 'error':
          break;
      }
    };
  }

  private formatToolInput(tool: string, input: Record<string, unknown>): string {
    switch (tool) {
      case 'Bash':
        return truncate(String(input.command || ''), 60);
      case 'Read':
        return truncate(String(input.file_path || ''), 60);
      case 'Write':
      case 'Edit':
        return truncate(String(input.file_path || ''), 60);
      case 'Glob':
        return truncate(String(input.pattern || ''), 60);
      case 'Grep':
        return truncate(String(input.pattern || ''), 60);
      default: {
        const keys = Object.keys(input);
        if (keys.length === 0) return '';
        const firstKey = keys[0];
        if (firstKey) {
          const value = input[firstKey];
          return truncate(String(value || ''), 50);
        }
        return '';
      }
    }
  }

  private ensureToolOutputHeader(tool?: string): void {
    if (this.toolOutputPrinted) return;
    const label = tool || this.lastToolUse || 'Tool';
    console.log(chalk.gray(`  ${chalk.yellow(label)} output:`));
    this.toolOutputPrinted = true;
  }

  private printToolOutputLines(lines: string[], tool?: string): void {
    if (lines.length === 0) return;
    this.ensureToolOutputHeader(tool);
    for (const line of lines) {
      console.log(chalk.gray(`  │ ${line}`));
    }
  }
}
