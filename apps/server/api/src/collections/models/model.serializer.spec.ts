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

  it('serializes dynamic registry metadata', () => {
    const now = new Date();
    const result = ModelSerializer.serialize({
      _id: '1',
      category: IngredientCategory.IMAGE,
      cost: 5,
      createdAt: now,
      isActive: true,
      isDefault: false,
      isDiscovered: true,
      isPublic: true,
      key: 'test-key',
      label: 'test',
      margin: 0.2,
      organization: 'org-1',
      parentModel: 'base-model',
      provider: 'openai',
      providerConfig: { source: 'provider-sync' },
      training: 'training-1',
      updatedAt: now,
    });

    expect(result.data.attributes).toMatchObject({
      isDiscovered: true,
      isPublic: true,
      margin: 0.2,
      organization: 'org-1',
      parentModel: 'base-model',
      providerConfig: { source: 'provider-sync' },
      training: 'training-1',
    });
  });
});
