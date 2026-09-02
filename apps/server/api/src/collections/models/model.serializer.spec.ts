import { IngredientCategory } from '@genfeedai/contracts';
import { ModelSerializer } from '@genfeedai/serializers';

function serializedAttributes(
  result: ReturnType<typeof ModelSerializer.serialize>,
): Record<string, unknown> {
  if (
    !result.data ||
    Array.isArray(result.data) ||
    result.data.attributes === undefined
  ) {
    throw new Error('Expected one serialized model resource');
  }

  return result.data.attributes;
}

describe('ModelSerializer', () => {
  it('serializes model with cost, isActive and isDefault attributes', () => {
    const now = new Date();
    const result = ModelSerializer.serialize({
      id: '1',
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

    const attributes = serializedAttributes(result);

    expect(attributes).toHaveProperty('cost', 5);
    expect(attributes).toHaveProperty('isActive', true);
    expect(attributes).toHaveProperty('isDefault', false);
  });

  it('keeps raw provider commercial metadata private', () => {
    const now = new Date();
    const result = ModelSerializer.serialize({
      id: '1',
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
      organizationId: 'org-1',
      parentModelId: 'base-model',
      provider: 'openai',
      providerConfig: { source: 'provider-sync' },
      providerCostUsd: 0.025,
      trainingId: 'training-1',
      updatedAt: now,
    });

    const attributes = serializedAttributes(result);

    expect(attributes).toMatchObject({
      isDiscovered: true,
      isPublic: true,
      organizationId: 'org-1',
      parentModelId: 'base-model',
      trainingId: 'training-1',
    });
    expect(attributes).not.toHaveProperty('margin');
    expect(attributes).not.toHaveProperty('providerConfig');
    expect(attributes).not.toHaveProperty('providerCostUsd');
  });
});
