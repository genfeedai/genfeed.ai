import { IngredientCategory } from '@genfeedai/enums';
import { ModelSerializer } from '@genfeedai/serializers';

describe('ModelSerializer', () => {
  it('serializes model with cost, isActive and isDefault attributes', () => {
    const now = new Date();
    const result = ModelSerializer.serialize({
      _id: '1',
      category: IngredientCategory.IMAGE,
      cost: 5,
      createdAt: now,
      isActive: true,
      isDefault: false,
      isDeleted: false,
      key: 'test-key',
      label: 'test',
      provider: 'openai',
      updatedAt: now,
    });

    expect(result.data.attributes).toHaveProperty('cost', 5);
    expect(result.data.attributes).toHaveProperty('isActive', true);
    expect(result.data.attributes).toHaveProperty('isDefault', false);
  });
});
