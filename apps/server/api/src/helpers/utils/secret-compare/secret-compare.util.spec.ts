import { isMatchingSecret } from '@api/helpers/utils/secret-compare/secret-compare.util';

describe('isMatchingSecret', () => {
  it('accepts a matching secret', () => {
    expect(isMatchingSecret('s3cret', 's3cret')).toBe(true);
  });

  it('rejects a different secret of the same length', () => {
    expect(isMatchingSecret('s3cret', 's3creT')).toBe(false);
  });

  it('rejects a different length', () => {
    expect(isMatchingSecret('s3cret', 's3cre')).toBe(false);
  });

  it('rejects a missing header', () => {
    expect(isMatchingSecret('s3cret', undefined)).toBe(false);
    expect(isMatchingSecret('s3cret', '')).toBe(false);
  });

  it('rejects everything when no secret is configured', () => {
    expect(isMatchingSecret(undefined, undefined)).toBe(false);
    expect(isMatchingSecret('', '')).toBe(false);
    expect(isMatchingSecret(undefined, 'anything')).toBe(false);
  });
});
