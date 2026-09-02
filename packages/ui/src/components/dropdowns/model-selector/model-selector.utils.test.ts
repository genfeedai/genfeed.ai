import {
  CostTier,
  ModelCategory,
  ModelProvider,
  QualityTier,
  SpeedTier,
} from '@genfeedai/contracts';
import type { IModel } from '@genfeedai/contracts/interfaces';
import {
  getModelRowCapabilities,
  getModelSpecCapabilities,
  getQualityTierLevel,
  MODEL_FILTER_ALL,
  MODEL_FILTER_AUDIO,
  MODEL_FILTER_CHEAP,
  MODEL_FILTER_FAST,
  MODEL_FILTER_LEGACY,
  matchesModelFilter,
  matchesModelSearch,
  orderOptionsByKeys,
  parseModelFamilyAndVariant,
  sortModelOptions,
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

function createOption(
  overrides: Partial<IModel> & Pick<IModel, 'key' | 'label'>,
  favoriteModelKeys: string[] = [],
  sourceGroupResolver?: (model: IModel) => string | undefined,
) {
  return transformModelsToOptions(
    [createModel(overrides)],
    favoriteModelKeys,
    sourceGroupResolver,
  )[0];
}

describe('getModelRowCapabilities', () => {
  it('reports audio for speech and for a toggleable audio track', () => {
    expect(
      getModelRowCapabilities(
        createModel({ hasSpeech: true, key: 'google/veo-3', label: 'Veo 3' }),
      ).map((capability) => capability.id),
    ).toEqual(['audio']);

    expect(
      getModelRowCapabilities(
        createModel({
          hasAudioToggle: true,
          key: 'google/veo-3-fast',
          label: 'Veo 3 Fast',
        }),
      ).map((capability) => capability.id),
    ).toEqual(['audio']);
  });

  it('ships an icon for every row capability so no row prints the word', () => {
    const capabilities = getModelRowCapabilities(
      createModel({
        hasSpeech: true,
        key: 'google/veo-3-fast',
        label: 'Veo 3 Fast',
        speedTier: SpeedTier.FAST,
      }),
    );

    expect(capabilities.map((capability) => capability.id)).toEqual([
      'audio',
      'fast',
    ]);
    for (const capability of capabilities) {
      expect(capability.icon).toBeDefined();
    }
  });

  it('stays empty for a silent, non-fast model', () => {
    expect(
      getModelRowCapabilities(
        createModel({ key: 'kwaivgi/kling-v2', label: 'Kling v2' }),
      ),
    ).toEqual([]);
  });
});

describe('getModelSpecCapabilities', () => {
  it('adds the detail the row deliberately drops', () => {
    expect(
      getModelSpecCapabilities(
        createModel({
          hasEndFrame: true,
          hasInterpolation: true,
          hasResolutionOptions: true,
          key: 'kwaivgi/kling-v2',
          label: 'Kling v2',
          maxReferences: 3,
        }),
      ).map((capability) => capability.id),
    ).toEqual(['end-frame', 'interpolation', 'references', 'resolutions']);
  });

  it('pluralizes the reference count', () => {
    expect(
      getModelSpecCapabilities(
        createModel({
          key: 'kwaivgi/kling-v2',
          label: 'Kling v2',
          maxReferences: 1,
        }),
      )[0],
    ).toMatchObject({ label: '1 reference' });
  });
});

describe('matchesModelFilter', () => {
  const legacyOption = createOption({
    isLegacy: true,
    key: 'google/veo-2',
    label: 'Veo 2',
  });

  it('keeps deprecated models out of every view except Legacy', () => {
    expect(matchesModelFilter(legacyOption, MODEL_FILTER_ALL)).toBe(false);
    expect(matchesModelFilter(legacyOption, MODEL_FILTER_LEGACY)).toBe(true);
  });

  it('excludes current models from Legacy', () => {
    expect(
      matchesModelFilter(
        createOption({ key: 'google/veo-3', label: 'Veo 3' }),
        MODEL_FILTER_LEGACY,
      ),
    ).toBe(false);
  });

  it('matches capability pills against model metadata', () => {
    const option = createOption({
      costTier: CostTier.LOW,
      hasSpeech: true,
      key: 'google/veo-3-fast',
      label: 'Veo 3 Fast',
      speedTier: SpeedTier.FAST,
    });

    expect(matchesModelFilter(option, MODEL_FILTER_AUDIO)).toBe(true);
    expect(matchesModelFilter(option, MODEL_FILTER_FAST)).toBe(true);
    expect(matchesModelFilter(option, MODEL_FILTER_CHEAP)).toBe(true);

    const slowOption = createOption({
      costTier: CostTier.HIGH,
      key: 'kwaivgi/kling-v2',
      label: 'Kling v2',
      speedTier: SpeedTier.SLOW,
    });

    expect(matchesModelFilter(slowOption, MODEL_FILTER_AUDIO)).toBe(false);
    expect(matchesModelFilter(slowOption, MODEL_FILTER_FAST)).toBe(false);
    expect(matchesModelFilter(slowOption, MODEL_FILTER_CHEAP)).toBe(false);
  });

  it('routes source pills through the option source group', () => {
    const option = createOption(
      { key: 'google/veo-3', label: 'Veo 3' },
      [],
      () => 'genfeed',
    );

    expect(matchesModelFilter(option, 'source:genfeed')).toBe(true);
    expect(matchesModelFilter(option, 'source:fal')).toBe(false);
  });
});

describe('matchesModelSearch', () => {
  const option = createOption({
    description: 'Cinematic shots with native audio',
    key: 'google/veo-3-fast',
    label: 'Veo 3 Fast',
  });

  it('matches the family name even though the list is flat', () => {
    expect(matchesModelSearch(option, 'veo')).toBe(true);
  });

  it('matches brand and description text', () => {
    expect(matchesModelSearch(option, 'google')).toBe(true);
    expect(matchesModelSearch(option, 'cinematic')).toBe(true);
    expect(matchesModelSearch(option, 'kling')).toBe(false);
  });
});

describe('sortModelOptions', () => {
  it('keeps siblings adjacent by brand, family, then numeric variant', () => {
    const options = transformModelsToOptions(
      [
        createModel({ key: 'kwaivgi/kling-v2', label: 'Kling v2' }),
        createModel({ key: 'google/veo-3-1', label: 'Veo 3.1' }),
        createModel({ key: 'google/veo-3', label: 'Veo 3' }),
        createModel({ key: 'google/imagen-4', label: 'Imagen 4' }),
      ],
      [],
    );

    expect(
      sortModelOptions(options).map((option) => option.model.label),
    ).toEqual(['Imagen 4', 'Veo 3', 'Veo 3.1', 'Kling v2']);
  });
});

describe('orderOptionsByKeys', () => {
  it('follows recency order and ignores keys no longer in the catalog', () => {
    const options = transformModelsToOptions(
      [
        createModel({ key: 'google/veo-3', label: 'Veo 3' }),
        createModel({ key: 'kwaivgi/kling-v2', label: 'Kling v2' }),
      ],
      [],
    );

    expect(
      orderOptionsByKeys(options, [
        'kwaivgi/kling-v2',
        'retired/model',
        'google/veo-3',
      ]).map((option) => option.model.key),
    ).toEqual(['kwaivgi/kling-v2', 'google/veo-3']);
  });
});

describe('getQualityTierLevel', () => {
  it('maps quality tiers onto a 1–4 bar', () => {
    expect(getQualityTierLevel(QualityTier.BASIC)).toBe(1);
    expect(getQualityTierLevel(QualityTier.STANDARD)).toBe(2);
    expect(getQualityTierLevel(QualityTier.HIGH)).toBe(3);
    expect(getQualityTierLevel(QualityTier.ULTRA)).toBe(4);
    expect(getQualityTierLevel(undefined)).toBe(0);
  });
});
