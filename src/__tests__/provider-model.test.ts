import { describe, expect, it } from 'vitest';
import { parseProviderModel } from '../shared/utils/providerModel.js';

describe('parseProviderModel', () => {
  it('should parse provider/model format', () => {
    expect(parseProviderModel('opencode/big-pickle', 'model')).toEqual({
      providerID: 'opencode',
      modelID: 'big-pickle',
    });
  });

  it('should reject empty string', () => {
    expect(() => parseProviderModel('', 'model')).toThrow(/must not be empty/i);
  });

  it('should reject missing slash', () => {
    expect(() => parseProviderModel('big-pickle', 'model')).toThrow(/provider\/model/i);
  });

  it('should reject multiple slashes', () => {
    expect(() => parseProviderModel('a/b/c', 'model')).toThrow(/provider\/model/i);
  });
});
