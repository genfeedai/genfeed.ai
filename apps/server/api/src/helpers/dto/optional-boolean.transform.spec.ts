import {
  parseOptionalBoolean,
  toBooleanDefaultFalse,
  toBooleanOrUnset,
  toOptionalBoolean,
} from './optional-boolean.transform';

describe('optional boolean query transforms', () => {
  it('coerces query-string flags and drops blanks', () => {
    expect(toOptionalBoolean({ value: 'true' })).toBe(true);
    expect(toOptionalBoolean({ value: 'false' })).toBe(false);
    expect(toOptionalBoolean({ value: '1' })).toBe(true);
    expect(toOptionalBoolean({ value: '0' })).toBe(false);
    expect(toOptionalBoolean({ value: true })).toBe(true);
    expect(toOptionalBoolean({ value: '' })).toBeUndefined();
    expect(toOptionalBoolean({ value: 'yes' })).toBe('yes');
  });

  it('parses only real booleans for Prisma filters', () => {
    expect(parseOptionalBoolean('true')).toBe(true);
    expect(parseOptionalBoolean('false')).toBe(false);
    expect(parseOptionalBoolean('yes')).toBeUndefined();
    expect(parseOptionalBoolean(undefined)).toBeUndefined();
  });

  it.each([
    [undefined, false],
    [null, false],
    ['', false],
    ['true', true],
    [true, true],
    ['false', false],
    [false, false],
    ['0', false],
    [0, false],
    ['yes', true],
    [1, true],
  ])('defaults to false: %j -> %j', (value, expected) => {
    expect(toBooleanDefaultFalse({ value })).toBe(expected);
  });

  it.each([
    [undefined, undefined],
    [null, undefined],
    ['', undefined],
    ['true', true],
    [true, true],
    ['false', false],
    [false, false],
    ['0', false],
    [0, false],
    ['yes', true],
    [1, true],
  ])('stays unset when blank: %j -> %j', (value, expected) => {
    expect(toBooleanOrUnset({ value })).toBe(expected);
  });
});
