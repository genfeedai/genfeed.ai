import { normalizeIngredientCharacterIds } from '@api/helpers/dto/ingredient-characters-query.transform';

describe('normalizeIngredientCharacterIds', () => {
  it.each([undefined, null, ''])('treats %p as no filter', (value) => {
    expect(normalizeIngredientCharacterIds(value)).toBeUndefined();
  });

  it('wraps a single id in an array', () => {
    expect(normalizeIngredientCharacterIds('abc')).toEqual(['abc']);
  });

  it('trims repeated keys and drops duplicates', () => {
    expect(normalizeIngredientCharacterIds([' a ', 'b', 'a'])).toEqual([
      'a',
      'b',
    ]);
  });

  it('leaves non-strings for the validator to reject', () => {
    expect(normalizeIngredientCharacterIds([1])).toEqual([1]);
  });
});
