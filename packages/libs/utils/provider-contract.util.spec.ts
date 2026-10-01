import {
  hashProviderContract,
  hashReplicateProviderContract,
} from '@libs/utils/provider-contract.util';
import { describe, expect, it } from 'vitest';

describe('canonical provider contract identity', () => {
  it('preserves the original canonical SHA256 convention and key ordering', () => {
    expect(hashProviderContract({ a: 1 })).toBe(
      'sha256:015abd7f5cc57a2dd94b7590f04ad8084273905ee33ec5cebeae62276a97f862',
    );
    expect(hashProviderContract({ a: 1, nested: { x: 2, y: 3 } })).toBe(
      hashProviderContract({ nested: { y: 3, x: 2 }, a: 1 }),
    );
    expect(hashProviderContract([1, 2])).not.toBe(hashProviderContract([2, 1]));
  });
  it('uses the same exact Replicate discovery preimage while keeping provider version distinct', () => {
    const preimage = {
      endpoint: 'owner/model',
      inputSchema: { type: 'object' },
      outputSchema: { type: 'string', format: 'uri' },
      openapi: {},
      pricing: [],
      schemaFamily: 'video',
      providerVersion: 'v1',
    };
    expect(hashReplicateProviderContract(preimage)).toBe(
      hashProviderContract(preimage),
    );
    expect(
      hashReplicateProviderContract({ ...preimage, providerVersion: 'v2' }),
    ).not.toBe(hashReplicateProviderContract(preimage));
  });
});
