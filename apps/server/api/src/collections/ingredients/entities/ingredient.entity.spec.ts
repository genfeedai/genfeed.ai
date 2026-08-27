import { IngredientEntity } from '@server/collections/ingredients/entities/ingredient.entity';

describe('IngredientEntity', () => {
  it('should be defined', () => {
    expect(new IngredientEntity({})).toBeDefined();
  });
});
