import { initialContractReviewStatus } from '@api/collections/models/utils/model-provider-contract-status.util';
import { describe, expect, it } from 'vitest';

describe('initialContractReviewStatus', () => {
  it.each([
    ['supported', 'pending'],
    ['quarantined', 'quarantined'],
  ] as const)('starts a %s contract as %s', (mappingStatus, expected) => {
    expect(initialContractReviewStatus(mappingStatus)).toBe(expected);
  });
});
