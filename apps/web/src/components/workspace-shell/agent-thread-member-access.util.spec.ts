import { describe, expect, it } from 'vitest';
import { canReachThreadBrand } from './agent-thread-member-access.util';

describe('canReachThreadBrand', () => {
  it.each([
    {
      brandId: 'b1',
      expected: true,
      member: { brandIds: [], roleKey: 'owner' },
    },
    {
      brandId: 'b1',
      expected: true,
      member: { brandIds: [], roleKey: 'admin' },
    },
    {
      brandId: 'b1',
      expected: true,
      member: { brandIds: ['b1'], roleKey: 'creator' },
    },
    {
      brandId: 'b1',
      expected: false,
      member: { brandIds: ['b2'], roleKey: 'creator' },
    },
    { brandId: 'b1', expected: false, member: { brandIds: [], roleKey: null } },
    {
      brandId: null,
      expected: true,
      member: { brandIds: [], roleKey: 'creator' },
    },
    {
      brandId: undefined,
      expected: true,
      member: { brandIds: [], roleKey: 'creator' },
    },
  ])(
    'returns $expected for $member in brand $brandId',
    ({ brandId, expected, member }) => {
      expect(canReachThreadBrand(member, brandId)).toBe(expected);
    },
  );
});
