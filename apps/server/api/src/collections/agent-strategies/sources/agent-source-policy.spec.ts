import { resolveAgentSourcePolicy } from '@api/collections/agent-strategies/sources/agent-source-policy';
import { describe, expect, it } from 'vitest';

const freshness = 7 * 24 * 60 * 60 * 1000;
describe('Agent source policy', () => {
  it('normalizes omitted policy to documented defaults with explicit freshness', () => {
    expect(resolveAgentSourcePolicy(undefined, freshness)).toEqual({
      version: 1,
      enabledKinds: ['imported_posts', 'saved_ads'],
      perRunSourceLimit: 1,
      outputKinds: ['copy'],
      clipsEnabled: false,
      freshnessWindowMs: freshness,
    });
  });
  it('preserves explicit empty kinds as operator opt-out', () => {
    expect(
      resolveAgentSourcePolicy({ enabledKinds: [] }, freshness).enabledKinds,
    ).toEqual([]);
  });
  it('allows valid persisted freshness to override the required fallback', () => {
    expect(
      resolveAgentSourcePolicy({ freshnessWindowMs: 10 }, freshness)
        .freshnessWindowMs,
    ).toBe(10);
  });
  it('rejects malformed policy rather than enabling defaults', () => {
    for (const input of [
      null,
      false,
      1,
      '',
      [],
      { unexpected: true },
      { version: 2 },
    ])
      expect(() => resolveAgentSourcePolicy(input, freshness)).toThrow();
  });
  it('rejects nonfinite and nonpositive explicit freshness even with persisted override', () => {
    for (const value of [0, -1, NaN, Infinity])
      expect(() =>
        resolveAgentSourcePolicy({ freshnessWindowMs: 10 }, value),
      ).toThrow();
  });
  it('rejects invalid counts, unknown kinds and duplicate kinds', () => {
    for (const input of [
      { perRunSourceLimit: 0 },
      { perRunSourceLimit: 1.5 },
      { perRunSourceLimit: Infinity },
      { enabledKinds: ['bogus'] },
      { enabledKinds: ['saved_ads', 'saved_ads'] },
      { outputKinds: [] },
      { outputKinds: ['copy', 'copy'] },
      { freshnessWindowMs: NaN },
    ])
      expect(() => resolveAgentSourcePolicy(input, freshness)).toThrow();
  });
  it('requires clips output and explicit mode together', () => {
    for (const input of [
      { clipsEnabled: true },
      { clipMode: 'avatar' },
      { outputKinds: ['clips'] },
      { clipsEnabled: true, clipMode: 'raw-cut' },
      { clipsEnabled: true, outputKinds: ['clips'] },
    ])
      expect(() => resolveAgentSourcePolicy(input, freshness)).toThrow();
  });
  it('normalizes explicitly configured raw-cut clips without selecting a provider', () => {
    expect(
      resolveAgentSourcePolicy(
        { clipsEnabled: true, clipMode: 'raw-cut', outputKinds: ['clips'] },
        freshness,
      ).clipMode,
    ).toBe('raw-cut');
  });
  it('freezes the policy and list copies without freezing caller-owned arrays', () => {
    const kinds = ['saved_ads'];
    const policy = resolveAgentSourcePolicy({ enabledKinds: kinds }, freshness);
    kinds.push('trends');
    expect(policy.enabledKinds).toEqual(['saved_ads']);
    expect(Object.isFrozen(policy)).toBe(true);
    expect(Object.isFrozen(policy.outputKinds)).toBe(true);
  });
});
