import { describe, expect, it } from 'vitest';
import {
  BRAND_HANDLE_MAX_LENGTH,
  isValidBrandHandle,
  normalizeBrandHandle,
  parseClaimHandle,
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

  it.each([
    ['@Shayla', 'shayla'],
    [' vincent-on-ai ', 'vincent-on-ai'],
  ])('reads the claimed handle %j as %j', (value, handle) => {
    expect(parseClaimHandle(value)).toBe(handle);
  });

  it.each([null, '', 'a', 'vincent_ai', 'settings', 'admin'])(
    'refuses %j as a claimed handle',
    (value) => {
      expect(parseClaimHandle(value)).toBeNull();
    },
  );
});
