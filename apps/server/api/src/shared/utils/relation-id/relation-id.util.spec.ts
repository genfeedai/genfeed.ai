import {
  requireRelationId,
  resolveRelationId,
} from '@api/shared/utils/relation-id/relation-id.util';
import { BadRequestException } from '@nestjs/common';

describe('resolveRelationId', () => {
  it('prefers the scalar foreign key over the legacy alias', () => {
    expect(resolveRelationId('org_scalar', 'org_alias')).toBe('org_scalar');
  });

  it('falls back to the alias when it is a back-filled id string', () => {
    expect(resolveRelationId(undefined, 'org_alias')).toBe('org_alias');
  });

  it('reads the id off a populated relation object', () => {
    expect(resolveRelationId(undefined, { id: 'brand_1', label: 'Acme' })).toBe(
      'brand_1',
    );
  });

  it('reads the legacy _id off a populated relation object', () => {
    expect(resolveRelationId(undefined, { _id: 'brand_legacy' })).toBe(
      'brand_legacy',
    );
  });

  it('never stringifies a populated relation object', () => {
    // `String(post.brand)` produced "[object Object]" — a bogus foreign key.
    expect(resolveRelationId(undefined, { label: 'Acme' })).toBeUndefined();
  });

  it('returns undefined for missing, empty, or non-id values', () => {
    expect(resolveRelationId(undefined, undefined)).toBeUndefined();
    expect(resolveRelationId('', '')).toBeUndefined();
    expect(resolveRelationId(null, null)).toBeUndefined();
    expect(resolveRelationId(undefined, 42)).toBeUndefined();
  });
});

describe('requireRelationId', () => {
  it('returns the resolved id', () => {
    expect(requireRelationId('org_1', undefined, 'organization', 'Post')).toBe(
      'org_1',
    );
  });

  it('fails closed when no id can be resolved', () => {
    expect(() =>
      requireRelationId(undefined, undefined, 'organization', 'Post p_1'),
    ).toThrow(BadRequestException);
  });

  it('names the field and context in the error', () => {
    expect(() =>
      requireRelationId(undefined, { label: 'Acme' }, 'brand', 'Post p_1'),
    ).toThrow("Post p_1 is missing a resolvable 'brand' id");
  });
});
