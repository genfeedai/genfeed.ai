import { ModelCategory, ModelProvider } from '@genfeedai/enums';
import type { IModel } from '@genfeedai/interfaces';
import {
  isModelBrandGroupExpanded,
  isModelFamilyExpanded,
  parseModelFamilyAndVariant,
  shouldRenderModelFamilyHeader,
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

  it('nests GenFeed Flux2 compound variants under one family', () => {
    expect(
      parseModelFamilyAndVariant(
        createModel({
          key: 'genfeed-ai/flux2-dev',
          label: 'Flux2 Dev',
        }),
      ),
    ).toMatchObject({
      familyKey: 'genfeed-ai:flux2',
      familyLabel: 'Flux2',
      variantLabel: 'Dev',
    });

    expect(
      parseModelFamilyAndVariant(
        createModel({
          key: 'genfeed-ai/flux2-dev-pulid-upscale',
          label: 'Flux2 Dev Pulid Upscale',
        }),
      ),
    ).toMatchObject({
      familyKey: 'genfeed-ai:flux2',
      familyLabel: 'Flux2',
      variantLabel: 'Dev Pulid Upscale',
    });

    expect(
      parseModelFamilyAndVariant(
        createModel({
          key: 'genfeed-ai/flux2-klein',
          label: 'Flux2 Klein',
        }),
      ),
    ).toMatchObject({
      familyKey: 'genfeed-ai:flux2',
      familyLabel: 'Flux2',
      variantLabel: 'Klein',
    });
  });

  it('nests Z Image Turbo LoRA under the Z Image family', () => {
    expect(
      parseModelFamilyAndVariant(
        createModel({
          key: 'genfeed-ai/z-image-turbo',
          label: 'Z Image Turbo',
        }),
      ),
    ).toMatchObject({
      familyKey: 'genfeed-ai:z-image',
      familyLabel: 'Z Image',
      variantLabel: 'Turbo',
    });

    expect(
      parseModelFamilyAndVariant(
        createModel({
          key: 'genfeed-ai/z-image-turbo-lora',
          label: 'Z Image Turbo Lora',
        }),
      ),
    ).toMatchObject({
      familyKey: 'genfeed-ai:z-image',
      familyLabel: 'Z Image',
      variantLabel: 'Turbo Lora',
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

describe('shouldRenderModelFamilyHeader', () => {
  it('hides nest chrome for a single variant', () => {
    expect(shouldRenderModelFamilyHeader(1)).toBe(false);
  });

  it('keeps a collapsible header when a family has variants', () => {
    expect(shouldRenderModelFamilyHeader(2)).toBe(true);
  });
});

describe('isModelFamilyExpanded', () => {
  it('stays collapsed until the user opens it', () => {
    expect(
      isModelFamilyExpanded({
        familyKey: 'genfeed-ai:flux2',
        hasSearchMatch: false,
        toggledFamilyKeys: [],
      }),
    ).toBe(false);
  });

  it('expands on search or an explicit toggle', () => {
    expect(
      isModelFamilyExpanded({
        familyKey: 'genfeed-ai:flux2',
        hasSearchMatch: true,
        toggledFamilyKeys: [],
      }),
    ).toBe(true);

    expect(
      isModelFamilyExpanded({
        familyKey: 'genfeed-ai:flux2',
        hasSearchMatch: false,
        toggledFamilyKeys: ['genfeed-ai:flux2'],
      }),
    ).toBe(true);
  });
});

describe('isModelBrandGroupExpanded', () => {
  it('keeps multi-brand All view collapsed until opened', () => {
    expect(
      isModelBrandGroupExpanded({
        activeBrand: null,
        brandSlug: 'genfeed-ai',
        hasSearchMatch: false,
        toggledBrandKeys: [],
        visibleBrandCount: 3,
      }),
    ).toBe(false);
  });

  it('opens a brand that is filtered, searched, or toggled', () => {
    expect(
      isModelBrandGroupExpanded({
        activeBrand: 'genfeed-ai',
        brandSlug: 'genfeed-ai',
        hasSearchMatch: false,
        toggledBrandKeys: [],
        visibleBrandCount: 3,
      }),
    ).toBe(true);

    expect(
      isModelBrandGroupExpanded({
        activeBrand: null,
        brandSlug: 'genfeed-ai',
        hasSearchMatch: true,
        toggledBrandKeys: [],
        visibleBrandCount: 3,
      }),
    ).toBe(true);

    expect(
      isModelBrandGroupExpanded({
        activeBrand: null,
        brandSlug: 'genfeed-ai',
        hasSearchMatch: false,
        toggledBrandKeys: ['genfeed-ai'],
        visibleBrandCount: 3,
      }),
    ).toBe(true);
  });

  it('opens the only visible brand so a single-provider list is usable', () => {
    expect(
      isModelBrandGroupExpanded({
        activeBrand: null,
        brandSlug: 'genfeed-ai',
        hasSearchMatch: false,
        toggledBrandKeys: [],
        visibleBrandCount: 1,
      }),
    ).toBe(true);
  });
});
