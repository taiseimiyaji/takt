/**
 * Utility functions for Claude client operations.
 *
 * Stateless helpers for rule detection and regex safety validation.
 */
import { detectRuleIndex } from '../../shared/utils/ruleIndex.js';

export { detectRuleIndex };

/** Validate regex pattern for ReDoS safety */
export function isRegexSafe(pattern: string): boolean {
  if (pattern.length > 200) {
    return false;
  }

  const dangerousPatterns = [
    /\(\.\*\)\+/,      // (.*)+
    /\(\.\+\)\*/,      // (.+)*
    /\(\.\*\)\*/,      // (.*)*
    /\(\.\+\)\+/,      // (.+)+
    /\([^)]*\|[^)]*\)\+/, // (a|b)+
    /\([^)]*\|[^)]*\)\*/, // (a|b)*
  ];

  for (const dangerous of dangerousPatterns) {
    if (dangerous.test(pattern)) {
      return false;
    }
  }

  return true;
}
