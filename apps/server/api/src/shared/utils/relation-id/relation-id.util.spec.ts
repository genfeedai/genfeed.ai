import { resolveEntityId } from '@api/shared/utils/relation-id/relation-id.util';

describe('resolveEntityId', () => {
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
