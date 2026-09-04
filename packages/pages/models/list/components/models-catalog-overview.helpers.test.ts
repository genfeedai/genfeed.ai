import { ModelCategory } from '@genfeedai/contracts';
import type { IModel } from '@genfeedai/contracts/interfaces';
import { describe, expect, it } from 'vitest';
import {
  buildModelCatalogOverviewCards,
  getModelCategoryBadgeClass,
} from './models-catalog-overview.helpers';

function buildModel(overrides: Partial<IModel>): IModel {
  return {
    category: ModelCategory.IMAGE,
    cost: 1,
    id: 'model-1',
    isActive: true,
    isDefault: false,
    isDeleted: false,
    key: 'model-key',
    label: 'Model',
    ...overrides,
  } as IModel;
}

describe('model catalog overview helpers', () => {
  it('groups exact model categories into readable catalog families', () => {
    const cards = buildModelCatalogOverviewCards([
      buildModel({ category: ModelCategory.IMAGE }),
      buildModel({
        category: ModelCategory.IMAGE_EDIT,
        id: 'image-edit',
      }),
      buildModel({
        category: ModelCategory.VOICE,
        id: 'voice',
        isDefault: true,
        label: 'Narrator',
      }),
    ]);

    expect(cards.find((card) => card.label === 'Image')?.count).toBe(2);
    expect(cards.find((card) => card.label === 'Voice')).toMatchObject({
      count: 1,
      description: 'Default: Narrator',
    });
  });

  it('assigns a distinct category treatment to every model category', () => {
    const treatments = Object.values(ModelCategory).map((category) =>
      getModelCategoryBadgeClass(category),
    );

    expect(new Set(treatments).size).toBe(Object.values(ModelCategory).length);
  });
});
