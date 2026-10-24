import { creditTransactionSerializerConfig } from '@serializers/configs/billing/credit-transaction.config';
import { describe, expect, it } from 'vitest';

const { metadata } = creditTransactionSerializerConfig.attributeTransforms;

describe('credit transaction metadata transform', () => {
  it('drops the internal abuse keys and keeps the public metadata', () => {
    const row = {
      metadata: {
        campaign: 'onboarding-trial',
        cardKey: 'a',
        emailKey: 'b',
        ipKey: 'c',
        kind: 'promotional',
      },
    };

    expect(metadata(row)).toEqual({
      campaign: 'onboarding-trial',
      kind: 'promotional',
    });
    expect(row.metadata.cardKey).toBe('a');
  });

  it.each([
    ['missing', undefined],
    ['null', null],
    ['a string', 'manual'],
    ['an array', ['emailKey']],
  ])('passes %s metadata through untouched', (_label, value) => {
    expect(metadata({ metadata: value })).toBe(value);
  });
});
