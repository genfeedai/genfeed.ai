import {
  requireRelationId,
  resolveEntityId,
} from '@api/shared/utils/relation-id/relation-id.util';
import { BadRequestException } from '@nestjs/common';

describe('resolveEntityId', () => {
  it('returns a scalar ID', () => {
    expect(resolveEntityId('org_1')).toBe('org_1');
  });

  it('reads the id off a populated relation object', () => {
    expect(resolveEntityId({ id: 'brand_1', label: 'Acme' })).toBe('brand_1');
  });

  it('never stringifies a populated relation object', () => {
    expect(resolveEntityId({ label: 'Acme' })).toBeUndefined();
  });

  it('returns undefined for missing, empty, or non-id values', () => {
    expect(resolveEntityId(undefined)).toBeUndefined();
    expect(resolveEntityId('')).toBeUndefined();
    expect(resolveEntityId(null)).toBeUndefined();
    expect(resolveEntityId(42)).toBeUndefined();
  });
});

describe('requireRelationId', () => {
  it('returns the resolved id', () => {
    expect(requireRelationId('org_1', 'organization', 'Post')).toBe('org_1');
  });

  it('fails closed when no id can be resolved', () => {
    expect(() =>
      requireRelationId(undefined, 'organization', 'Post p_1'),
    ).toThrow(BadRequestException);
  });

  it('names the field and context in the error', () => {
    expect(() => requireRelationId(undefined, 'brand', 'Post p_1')).toThrow(
      "Post p_1 is missing a resolvable 'brand' id",
    );
  });
});
