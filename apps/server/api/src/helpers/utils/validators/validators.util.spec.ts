import { isValidUrl } from '@api/helpers/utils/validators/validators.util';

describe('validators.util', () => {
  it('validates urls', () => {
    expect(isValidUrl('https://example.com')).toBe(true);
    expect(isValidUrl('not a url')).toBe(false);
  });
});
