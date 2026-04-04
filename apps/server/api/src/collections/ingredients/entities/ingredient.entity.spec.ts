import { IngredientEntity } from '@api/collections/ingredients/entities/ingredient.entity';

describe('IngredientEntity', () => {
  it('should be defined', () => {
    expect(new IngredientEntity({})).toBeDefined();
  });
});
