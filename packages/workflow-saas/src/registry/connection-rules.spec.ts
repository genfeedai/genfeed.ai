import {
  isValidSaaSConnection,
  SAAS_CONNECTION_RULES,
} from '@workflow-saas/registry/connection-rules';
import { describe, expect, it } from 'vitest';

describe('SAAS_CONNECTION_RULES', () => {
  it('has core types', () => {
    expect(SAAS_CONNECTION_RULES.image).toBeDefined();
    expect(SAAS_CONNECTION_RULES.text).toBeDefined();
  });
  it('has saas types', () => {
    expect(SAAS_CONNECTION_RULES.brand).toEqual(['brand']);
    expect(SAAS_CONNECTION_RULES.object).toEqual(['object']);
    expect(SAAS_CONNECTION_RULES.any).toContain('brand');
  });
});

describe('isValidSaaSConnection', () => {
  it('any target accepts all', () => {
    expect(isValidSaaSConnection('image', 'any')).toBe(true);
    expect(isValidSaaSConnection('brand', 'any')).toBe(true);
  });
  it('brand to brand', () =>
    expect(isValidSaaSConnection('brand', 'brand')).toBe(true));
  it('brand to text fails', () =>
    expect(isValidSaaSConnection('brand', 'text')).toBe(false));
  it('text to brand fails', () =>
    expect(isValidSaaSConnection('text', 'brand')).toBe(false));
});
