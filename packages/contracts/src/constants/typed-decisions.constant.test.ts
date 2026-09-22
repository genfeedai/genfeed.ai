import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TYPED_DECISION_PROVIDER,
  parseTypedDecisionProvider,
  TYPED_DECISION_PROVIDER_LABELS,
  TYPED_DECISION_PROVIDER_NAMES,
} from './typed-decisions.constant';

describe('TYPED_DECISION_PROVIDER_NAMES', () => {
  it('lists every labelled provider', () => {
    expect(TYPED_DECISION_PROVIDER_NAMES).toEqual(
      Object.keys(TYPED_DECISION_PROVIDER_LABELS),
    );
  });

  it('defaults to the deterministic paths', () => {
    expect(DEFAULT_TYPED_DECISION_PROVIDER).toBe('none');
  });
});

describe('parseTypedDecisionProvider', () => {
  it('accepts every known provider', () => {
    for (const provider of TYPED_DECISION_PROVIDER_NAMES) {
      expect(parseTypedDecisionProvider(provider)).toBe(provider);
    }
  });

  it('fails closed on a value written by a newer deployment', () => {
    expect(parseTypedDecisionProvider('some-future-vendor')).toBe('none');
  });

  it('fails closed on a missing or non-string value', () => {
    expect(parseTypedDecisionProvider(undefined)).toBe('none');
    expect(parseTypedDecisionProvider(null)).toBe('none');
    expect(parseTypedDecisionProvider(42)).toBe('none');
  });
});
