/**
 * Tests for git/format module
 *
 * Regression tests ensuring provider-neutral formatting.
 * Covers: ARCH-001 (no "GitHub" hardcode), QA-R001 (GitLab output correctness),
 * TEST-003 (format.ts location and neutrality).
 *
 * ARCH-003: resolveIssueTask was moved from format.ts to git/index.ts.
 * Tests for resolveIssueTask are in resolveIssueTask-provider.test.ts.
 */

import { describe, it, expect } from 'vitest';
import {
  formatIssueAsTask,
  parseIssueNumbers,
  isIssueReference,
  formatPrReviewAsTask,
  buildPrBody,
} from '../infra/git/format.js';
import type { Issue, PrReviewData } from '../infra/git/types.js';

describe('formatIssueAsTask', () => {
  it('should not contain provider-specific strings like "GitHub"', () => {
    const issue: Issue = {
      number: 42,
      title: 'Test Issue',
      body: 'Body text',
      labels: ['bug'],
      comments: [{ author: 'user1', body: 'comment' }],
    };

    const result = formatIssueAsTask(issue);

    expect(result).not.toContain('GitHub');
    expect(result).not.toContain('GitLab');
    expect(result).toContain('## Issue #42: Test Issue');
    expect(result).toContain('Body text');
    expect(result).toContain('bug');
    expect(result).toContain('**user1**: comment');
  });

  it('should format issue with all fields', () => {
    const issue: Issue = {
      number: 6,
      title: 'Fix authentication bug',
      body: 'The login flow is broken.',
      labels: ['bug', 'priority:high'],
      comments: [
        { author: 'user1', body: 'I can reproduce this.' },
        { author: 'user2', body: 'Fixed in PR #7.' },
      ],
    };

    const result = formatIssueAsTask(issue);

    expect(result).toContain('## Issue #6: Fix authentication bug');
    expect(result).toContain('The login flow is broken.');
    expect(result).toContain('### Labels');
    expect(result).toContain('bug, priority:high');
    expect(result).toContain('### Comments');
    expect(result).toContain('**user1**: I can reproduce this.');
    expect(result).toContain('**user2**: Fixed in PR #7.');
  });

  it('should format issue with no body, labels, or comments', () => {
    const issue: Issue = {
      number: 1,
      title: 'Minimal',
      body: '',
      labels: [],
      comments: [],
    };

    const result = formatIssueAsTask(issue);

    expect(result).toBe('## Issue #1: Minimal');
  });

  it('should format issue with labels but no comments', () => {
    const issue: Issue = {
      number: 5,
      title: 'Feature request',
      body: 'Add dark mode.',
      labels: ['enhancement'],
      comments: [],
    };

    const result = formatIssueAsTask(issue);

    expect(result).toContain('### Labels');
    expect(result).toContain('enhancement');
    expect(result).not.toContain('### Comments');
  });

  it('should format issue with comments but no labels', () => {
    const issue: Issue = {
      number: 3,
      title: 'Discussion',
      body: 'Thoughts?',
      labels: [],
      comments: [{ author: 'dev', body: 'LGTM' }],
    };

    const result = formatIssueAsTask(issue);

    expect(result).not.toContain('### Labels');
    expect(result).toContain('### Comments');
    expect(result).toContain('**dev**: LGTM');
  });

  it('should handle multiline body', () => {
    const issue: Issue = {
      number: 1,
      title: 'Multi-line',
      body: 'Line 1\nLine 2\n\nLine 4',
      labels: [],
      comments: [],
    };

    const result = formatIssueAsTask(issue);

    expect(result).toContain('Line 1\nLine 2\n\nLine 4');
  });
});

describe('formatPrReviewAsTask', () => {
  it('should format PR review data without provider-specific strings', () => {
    const prReview: PrReviewData = {
      number: 10,
      title: 'Feature PR',
      body: 'PR description',
      url: 'https://example.com/pr/10',
      headRefName: 'feature-branch',
      baseRefName: 'main',
      comments: [{ author: 'dev', body: 'LGTM' }],
      reviews: [{ author: 'reviewer', body: 'Approved', path: 'src/app.ts', line: 5 }],
      files: ['src/app.ts'],
    };

    const result = formatPrReviewAsTask(prReview);

    expect(result).not.toContain('GitHub');
    expect(result).not.toContain('GitLab');
    expect(result).toContain('## PR #10 Review Comments: Feature PR');
    expect(result).toContain('PR description');
    expect(result).toContain('**reviewer**: Approved');
    expect(result).toContain('File: src/app.ts, Line: 5');
    expect(result).toContain('**dev**: LGTM');
    expect(result).toContain('- src/app.ts');
  });
});

describe('buildPrBody', () => {
  it('should build PR body with Closes #N for issues', () => {
    const issues: Issue[] = [{
      number: 5,
      title: 'Fix bug',
      body: 'Bug description',
      labels: [],
      comments: [],
    }];

    const result = buildPrBody(issues, 'Report text');

    expect(result).toContain('## Summary');
    expect(result).toContain('Bug description');
    expect(result).toContain('## Execution Report');
    expect(result).toContain('Report text');
    expect(result).toContain('Closes #5');
  });

  it('should build PR body without issues', () => {
    const result = buildPrBody(undefined, 'Report text');

    expect(result).toContain('## Summary');
    expect(result).toContain('## Execution Report');
    expect(result).toContain('Report text');
    expect(result).not.toContain('Closes');
  });
});

describe('parseIssueNumbers', () => {
  it('should parse single issue reference', () => {
    expect(parseIssueNumbers(['#6'])).toEqual([6]);
  });

  it('should parse multiple issue references', () => {
    expect(parseIssueNumbers(['#6', '#7'])).toEqual([6, 7]);
  });

  it('should parse large issue numbers', () => {
    expect(parseIssueNumbers(['#123'])).toEqual([123]);
  });

  it('should return empty for non-issue args', () => {
    expect(parseIssueNumbers(['Fix bug'])).toEqual([]);
  });

  it('should return empty when mixed issue and non-issue args', () => {
    expect(parseIssueNumbers(['#6', 'and', '#7'])).toEqual([]);
  });

  it('should return empty for empty args', () => {
    expect(parseIssueNumbers([])).toEqual([]);
  });

  it('should not match partial issue patterns', () => {
    expect(parseIssueNumbers(['#abc'])).toEqual([]);
    expect(parseIssueNumbers(['#'])).toEqual([]);
    expect(parseIssueNumbers(['##6'])).toEqual([]);
    expect(parseIssueNumbers(['6'])).toEqual([]);
    expect(parseIssueNumbers(['issue#6'])).toEqual([]);
  });

  it('should handle #0', () => {
    expect(parseIssueNumbers(['#0'])).toEqual([0]);
  });
});

describe('isIssueReference', () => {
  it('should return true for #N patterns', () => {
    expect(isIssueReference('#6')).toBe(true);
    expect(isIssueReference('#123')).toBe(true);
  });

  it('should return true with whitespace trim', () => {
    expect(isIssueReference(' #6 ')).toBe(true);
  });

  it('should return false for non-issue text', () => {
    expect(isIssueReference('Fix bug')).toBe(false);
    expect(isIssueReference('#abc')).toBe(false);
    expect(isIssueReference('')).toBe(false);
    expect(isIssueReference('#')).toBe(false);
    expect(isIssueReference('6')).toBe(false);
  });

  it('should return false for issue number followed by text', () => {
    expect(isIssueReference('#32あああ')).toBe(false);
    expect(isIssueReference('#10abc')).toBe(false);
    expect(isIssueReference('#123text')).toBe(false);
  });

  it('should return false for multiple issues (single string)', () => {
    expect(isIssueReference('#6 #7')).toBe(false);
  });
});
