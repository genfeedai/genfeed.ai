import { describe, expect, it } from 'vitest';
import {
  INGREDIENT_ORIGIN_LABELS,
  INGREDIENT_ORIGIN_ORDER,
  IngredientOrigin,
  inheritIngredientOrigin,
  parseIngredientOrigin,
} from '../../src';

describe('IngredientOrigin', () => {
  it('has one label and one position per origin', () => {
    expect([...INGREDIENT_ORIGIN_ORDER].sort()).toEqual(
      Object.values(IngredientOrigin).sort(),
    );
    expect(INGREDIENT_ORIGIN_LABELS).toEqual({
      GENERATED: 'Generated',
      IMPORTED: 'Imported',
      UNKNOWN: 'Unknown',
      UPLOADED: 'Uploaded',
    });
  });

  it.each([
    ['UPLOADED', IngredientOrigin.UPLOADED],
    [' generated ', IngredientOrigin.GENERATED],
    ['Imported', IngredientOrigin.IMPORTED],
    ['unknown', IngredientOrigin.UNKNOWN],
  ])('parses %p', (value, expected) => {
    expect(parseIngredientOrigin(value)).toBe(expected);
  });

  it.each([undefined, null, 3, '', 'mine'])('rejects %p', (value) => {
    expect(parseIngredientOrigin(value)).toBeUndefined();
  });

  it('inherits a readable origin and falls back to Unknown', () => {
    expect(inheritIngredientOrigin('IMPORTED')).toBe(IngredientOrigin.IMPORTED);
    expect(inheritIngredientOrigin(undefined)).toBe(IngredientOrigin.UNKNOWN);
    expect(inheritIngredientOrigin('mine')).toBe(IngredientOrigin.UNKNOWN);
  });
});
