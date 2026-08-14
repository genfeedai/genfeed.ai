import { describe, expect, it } from 'vitest';
import { API_KEY_SCOPE_OPTIONS } from './api-key-scope-labels.constant';

describe('API_KEY_SCOPE_OPTIONS', () => {
  it('keeps unique labels and well-formed scope tokens', () => {
    const labels = API_KEY_SCOPE_OPTIONS.map((option) => option.label);
    const scopes = API_KEY_SCOPE_OPTIONS.flatMap((option) => option.scopes);

    expect(labels.length).toBeGreaterThan(0);
    expect(new Set(labels).size).toBe(labels.length);
    expect(new Set(scopes).size).toBe(scopes.length);
    expect(scopes.every((scope) => /^[a-z]+:[a-z]+$/.test(scope))).toBe(true);
  });
});
