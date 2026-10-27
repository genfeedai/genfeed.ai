import {
  toIngredientCreateData,
  toIngredientUpdateData,
} from '@api/collections/ingredients/utils/ingredient-create-data.util';
import { describe, expect, it } from 'vitest';

describe('ingredient draft render flag', () => {
  it('is written when the row is created', () => {
    expect(
      toIngredientCreateData({ isDraftRender: true, origin: 'GENERATED' }),
    ).toMatchObject({ isDraftRender: true });
  });

  it('can never be set or changed by an update', () => {
    expect(toIngredientUpdateData({ isDraftRender: true })).not.toHaveProperty(
      'isDraftRender',
    );
  });
});
