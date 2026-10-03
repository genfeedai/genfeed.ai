import { normalizeIngredientOrigins } from '@api/helpers/dto/ingredient-origins-query.transform';

describe('normalizeIngredientOrigins', () => {
  it.each([undefined, null, ''])('treats %p as no filter', (value) => {
    expect(normalizeIngredientOrigins(value)).toBeUndefined();
  });

  it('wraps a single value and upper-cases it', () => {
    expect(normalizeIngredientOrigins('uploaded')).toEqual(['UPLOADED']);
  });

  it('keeps repeated keys and trims them', () => {
    expect(normalizeIngredientOrigins([' generated ', 'IMPORTED'])).toEqual([
      'GENERATED',
      'IMPORTED',
    ]);
  });

  it('leaves non-strings for the validator to reject', () => {
    expect(normalizeIngredientOrigins([1])).toEqual([1]);
  });
});
