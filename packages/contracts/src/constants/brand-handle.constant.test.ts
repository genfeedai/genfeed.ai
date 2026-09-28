import { describe, expect, it } from 'vitest';
import {
  BRAND_HANDLE_MAX_LENGTH,
  isValidBrandHandle,
  normalizeBrandHandle,
} from './brand-handle.constant';

describe('brand-handle.constant', () => {
  it('normalizes a typed handle', () => {
    expect(normalizeBrandHandle('  @@VincentOnAI ')).toBe('vincentonai');
  });

  it('accepts lowercase words joined by single hyphens', () => {
    expect(isValidBrandHandle('vincent-on-ai')).toBe(true);
    expect(isValidBrandHandle('ai2')).toBe(true);
  });

  it.each([
    'a',
    'Vincent',
    'vincent_ai',
    'vincent--ai',
    '-vincent',
    'vincent-',
    'vincent ai',
    'a'.repeat(BRAND_HANDLE_MAX_LENGTH + 1),
  ])('rejects %j', (handle) => {
    expect(isValidBrandHandle(handle)).toBe(false);
  });
});
