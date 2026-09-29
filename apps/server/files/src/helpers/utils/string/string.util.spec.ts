import { escapeDrawtextValue } from '@files/helpers/utils/string/string.util';

describe('escapeDrawtextValue', () => {
  it('handles the empty string', () => {
    expect(escapeDrawtextValue('')).toBe('');
  });
});
