/**
 * Tests for summarizeTaskName
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../claude/client.js', () => ({
  callClaude: vi.fn(),
}));

vi.mock('../utils/debug.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  }),
}));

import { callClaude } from '../claude/client.js';
import { summarizeTaskName } from '../task/summarize.js';

const mockCallClaude = vi.mocked(callClaude);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('summarizeTaskName', () => {
  it('should return AI-generated slug for Japanese task name', async () => {
    // Given: AI returns a slug for Japanese input
    mockCallClaude.mockResolvedValue({
      agent: 'summarizer',
      status: 'done',
      content: 'add-auth',
      timestamp: new Date(),
    });

    // When
    const result = await summarizeTaskName('認証機能を追加する', { cwd: '/project' });

    // Then
    expect(result).toBe('add-auth');
    expect(mockCallClaude).toHaveBeenCalledWith(
      'summarizer',
      'Summarize this task: "認証機能を追加する"',
      expect.objectContaining({
        cwd: '/project',
        model: 'haiku',
        maxTurns: 1,
        allowedTools: [],
      })
    );
  });

  it('should return AI-generated slug for English task name', async () => {
    // Given
    mockCallClaude.mockResolvedValue({
      agent: 'summarizer',
      status: 'done',
      content: 'fix-login-bug',
      timestamp: new Date(),
    });

    // When
    const result = await summarizeTaskName('Fix the login bug', { cwd: '/project' });

    // Then
    expect(result).toBe('fix-login-bug');
  });

  it('should clean up AI response with extra characters', async () => {
    // Given: AI response has extra whitespace or formatting
    mockCallClaude.mockResolvedValue({
      agent: 'summarizer',
      status: 'done',
      content: '  Add-User-Auth!  \n',
      timestamp: new Date(),
    });

    // When
    const result = await summarizeTaskName('ユーザー認証を追加', { cwd: '/project' });

    // Then
    expect(result).toBe('add-user-auth');
  });

  it('should truncate long slugs to 30 characters', async () => {
    // Given: AI returns a long slug
    mockCallClaude.mockResolvedValue({
      agent: 'summarizer',
      status: 'done',
      content: 'this-is-a-very-long-slug-that-exceeds-thirty-characters',
      timestamp: new Date(),
    });

    // When
    const result = await summarizeTaskName('長いタスク名', { cwd: '/project' });

    // Then
    expect(result.length).toBeLessThanOrEqual(30);
    expect(result).toBe('this-is-a-very-long-slug-that-');
  });

  it('should return "task" as fallback for empty AI response', async () => {
    // Given: AI returns empty string
    mockCallClaude.mockResolvedValue({
      agent: 'summarizer',
      status: 'done',
      content: '',
      timestamp: new Date(),
    });

    // When
    const result = await summarizeTaskName('test', { cwd: '/project' });

    // Then
    expect(result).toBe('task');
  });

  it('should use custom model if specified', async () => {
    // Given
    mockCallClaude.mockResolvedValue({
      agent: 'summarizer',
      status: 'done',
      content: 'custom-task',
      timestamp: new Date(),
    });

    // When
    await summarizeTaskName('test', { cwd: '/project', model: 'sonnet' });

    // Then
    expect(mockCallClaude).toHaveBeenCalledWith(
      'summarizer',
      expect.any(String),
      expect.objectContaining({
        model: 'sonnet',
      })
    );
  });

  it('should remove consecutive hyphens', async () => {
    // Given: AI response has consecutive hyphens
    mockCallClaude.mockResolvedValue({
      agent: 'summarizer',
      status: 'done',
      content: 'fix---multiple---hyphens',
      timestamp: new Date(),
    });

    // When
    const result = await summarizeTaskName('test', { cwd: '/project' });

    // Then
    expect(result).toBe('fix-multiple-hyphens');
  });

  it('should remove leading and trailing hyphens', async () => {
    // Given: AI response has leading/trailing hyphens
    mockCallClaude.mockResolvedValue({
      agent: 'summarizer',
      status: 'done',
      content: '-leading-trailing-',
      timestamp: new Date(),
    });

    // When
    const result = await summarizeTaskName('test', { cwd: '/project' });

    // Then
    expect(result).toBe('leading-trailing');
  });
});
