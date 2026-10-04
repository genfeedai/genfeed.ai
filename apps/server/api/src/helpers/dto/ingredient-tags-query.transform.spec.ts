import {
  normalizeIngredientTagIds,
  normalizeTagMatchMode,
} from '@api/helpers/dto/ingredient-tags-query.transform';

describe('normalizeIngredientTagIds', () => {
  it.each([undefined, null])('treats %p as no filter', (value) => {
    expect(normalizeIngredientTagIds(value)).toBeUndefined();
  });

  it('keeps an empty value so validation rejects it', () => {
    expect(normalizeIngredientTagIds('')).toEqual(['']);
    expect(normalizeIngredientTagIds(['a', ' '])).toEqual(['a', '']);
  });

  it('wraps a single id in an array', () => {
    expect(normalizeIngredientTagIds('abc')).toEqual(['abc']);
  });

  it('trims repeated keys and drops duplicates', () => {
    expect(normalizeIngredientTagIds([' a ', 'b', 'a'])).toEqual(['a', 'b']);
  });

  it('leaves non-strings for the validator to reject', () => {
    expect(normalizeIngredientTagIds([1])).toEqual([1]);
  });
});

describe('normalizeTagMatchMode', () => {
  it.each([undefined, null, ''])('treats %p as unset', (value) => {
    expect(normalizeTagMatchMode(value)).toBeUndefined();
  });

  it('lower-cases and trims the mode', () => {
    expect(normalizeTagMatchMode(' ALL ')).toBe('all');
    expect(normalizeTagMatchMode('any')).toBe('any');
  });

  it('leaves an unknown value for the validator to reject', () => {
    expect(normalizeTagMatchMode('both')).toBe('both');
    expect(normalizeTagMatchMode(1)).toBe(1);
  });
});
