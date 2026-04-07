import { ModelCategory, ModelProvider } from '@genfeedai/enums';
import type { IModel } from '@genfeedai/interfaces';
import {
  parseModelFamilyAndVariant,
  transformModelsToOptions,
} from '@ui/dropdowns/model-selector/model-selector.utils';
import { describe, expect, it } from 'vitest';

function createModel(
  overrides: Partial<IModel> & Pick<IModel, 'key' | 'label'>,
): IModel {
  return {
    category: ModelCategory.IMAGE,
    cost: 1,
    createdAt: '2026-01-01',
    id: overrides.key,
    isActive: true,
    isDefault: false,
    isDeleted: false,
    key: overrides.key,
    label: overrides.label,
    provider: ModelProvider.REPLICATE,
    updatedAt: '2026-01-01',
    ...overrides,
  } as IModel;
}

describe('parseModelFamilyAndVariant', () => {
  it('parses Nano Banana base variant', () => {
    expect(
      parseModelFamilyAndVariant(
        createModel({
          key: 'google/nano-banana',
          label: 'Nano Banana',
        }),
      ),
    ).toMatchObject({
      familyKey: 'google:nano-banana',
      familyLabel: 'Nano Banana',
      variantLabel: 'Base',
    });
  });

  it('parses Nano Banana Pro suffix variant', () => {
    expect(
      parseModelFamilyAndVariant(
        createModel({
          key: 'google/nano-banana-pro',
          label: 'Nano Banana Pro',
        }),
      ),
    ).toMatchObject({
      familyKey: 'google:nano-banana',
      familyLabel: 'Nano Banana',
      variantLabel: 'Pro',
    });
  });

  it('parses Veo 3 versioned variant', () => {
    expect(
      parseModelFamilyAndVariant(
        createModel({
          key: 'google/veo-3',
          label: 'Veo 3',
        }),
      ),
    ).toMatchObject({
      familyKey: 'google:veo',
      familyLabel: 'Veo',
      variantLabel: '3.0',
    });
  });

  it('parses Veo 3.1 Fast versioned suffix variant', () => {
    expect(
      parseModelFamilyAndVariant(
        createModel({
          key: 'google/veo-3.1-fast',
          label: 'Veo 3.1 (Fast)',
        }),
      ),
    ).toMatchObject({
      familyKey: 'google:veo',
      familyLabel: 'Veo',
      variantLabel: '3.1 Fast',
    });
  });

  it('parses Gemini Flash family and variant', () => {
    expect(
      parseModelFamilyAndVariant(
        createModel({
          key: 'google/gemini-2.5-flash',
          label: 'Gemini 2.5 Flash',
        }),
      ),
    ).toMatchObject({
      familyKey: 'google:gemini',
      familyLabel: 'Gemini',
      variantLabel: '2.5 Flash',
    });
  });

  it('falls back safely for unparseable labels', () => {
    expect(
      parseModelFamilyAndVariant(
        createModel({
          key: 'replicate/custom-model',
          label: 'Custom Model',
        }),
      ),
    ).toMatchObject({
      familyKey: 'replicate:custom-model',
      familyLabel: 'Custom Model',
      variantLabel: 'Base',
    });
  });
});

describe('transformModelsToOptions', () => {
  it('attaches source groups through the resolver', () => {
    const options = transformModelsToOptions(
      [
        createModel({
          id: 'training-1',
          key: 'google/nano-banana-pro',
          label: 'Nano Banana Pro',
        }),
      ],
      [],
      (model) => (model.id === 'training-1' ? 'trainings' : 'models'),
    );

    expect(options[0]).toMatchObject({
      familyLabel: 'Nano Banana',
      sourceGroup: 'trainings',
      variantLabel: 'Pro',
    });
  });
});
