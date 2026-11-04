import { toCommaSeparatedStrings } from '@api/helpers/dto/comma-separated-strings.transform';
import { describe, expect, it } from 'vitest';

describe('toCommaSeparatedStrings', () => {
  it.each([
    [undefined, undefined],
    [null, undefined],
    [
      ['logo', 'text'],
      ['logo', 'text'],
    ],
    ['logo', ['logo']],
    ['logo, text ,blur', ['logo', 'text', 'blur']],
    [3, [3]],
  ])('turns %j into %j', (value, expected) => {
    expect(toCommaSeparatedStrings({ value })).toEqual(expected);
  });
});
