import { IngredientCategory, IngredientStatus } from '@genfeedai/contracts';
import type { IIngredient } from '@genfeedai/contracts/interfaces';
import type { StudioGenerateJob } from '@pages/studio/generate/types';
import { describe, expect, it } from 'vitest';
import { buildRepromptData } from './generation-payloads';
import {
  formatStudioRecipePrompt,
  groupStudioGenerateJobsByRun,
  recipeFromIngredient,
  recipeFromPromptData,
  recipeFromRepromptData,
  resolveRecipeForJob,
  settingsPatchFromRecipe,
} from './studio-generate-recipe';
import {
  buildStudioPromptData,
  getDefaultStudioGenerateSettings,
} from './studio-generate-settings';

function buildJob(
  overrides: Partial<StudioGenerateJob> = {},
): StudioGenerateJob {
  return {
    createdAt: 1,
    id: 'job-1',
    prompt: 'a prompt',
    status: IngredientStatus.GENERATED,
    type: 'image',
    ...overrides,
  };
}

describe('recipeFromPromptData', () => {
  it('never records brand enrichment on for music, avatar, or voice (#4676)', () => {
    const settings = getDefaultStudioGenerateSettings('music');
    const promptData = buildStudioPromptData({
      brandId: 'brand-1',
      promptText: 'An upbeat jingle',
      settings,
      type: 'music',
    });

    // The raw `brandingMode` field defaults to 'brand' regardless of type —
    // reading it directly (the old bug) would record "Brand enrichment: on"
    // for a type that never applied it. `isBrandingEnabled` is the truthful,
    // capability-gated flag `buildStudioPromptData` computes.
    expect(promptData.brandingMode).toBe('brand');
    expect(promptData.isBrandingEnabled).toBe(false);
    expect(
      recipeFromPromptData(promptData, 'music', settings).brandingMode,
    ).toBe('off');
  });
});

describe('formatStudioRecipePrompt', () => {
  it('shows the provider-bound recipe instead of the raw box contents', () => {
    const raw = 'A founder at a desk';
    const promptData = buildStudioPromptData({
      brandId: 'brand-1',
      promptText: raw,
      settings: {
        ...getDefaultStudioGenerateSettings('image'),
        mood: 'confident',
        promptTemplate: 'product-photo',
        style: 'editorial',
      },
      type: 'image',
    });
    const recipe = recipeFromPromptData(
      promptData,
      'image',
      getDefaultStudioGenerateSettings('image'),
    );
    recipe.mood = 'confident';
    recipe.promptTemplate = 'product-photo';
    recipe.style = 'editorial';
    const formatted = formatStudioRecipePrompt(recipe);

    expect(formatted).toContain(raw);
    expect(formatted).toContain('Brand enrichment: on');
    expect(formatted).toContain('Template: product-photo');
    expect(formatted).toContain('Style: editorial');
    expect(formatted).toContain('Mood: confident');
    expect(formatted).not.toBe(raw);
  });

  it('omits the Brand enrichment line rather than guessing when the brand state is unknown (#4676)', () => {
    const formatted = formatStudioRecipePrompt({
      blacklist: [],
      isAudioEnabled: false,
      outputs: 1,
      references: [],
      style: '',
      tags: [],
      text: 'Original prompt',
      type: 'image',
    });

    expect(formatted).not.toContain('Brand enrichment');
  });
});

describe('recipeFromRepromptData', () => {
  it('carries look fields forward from buildRepromptData', () => {
    const ingredient = {
      height: 1024,
      metadata: {
        camera: '85mm',
        mood: 'moody',
        style: 'noir',
      },
      metadataHeight: 1024,
      metadataModel: 'flux-dev',
      metadataWidth: 816,
      promptText: 'Original prompt',
      width: 816,
    } as unknown as IIngredient;

    const data = buildRepromptData(
      ingredient,
      IngredientCategory.IMAGE,
      'brand-1',
      [],
    );
    const recipe = recipeFromRepromptData(data, 'image');

    expect(recipe.text).toBe('Original prompt');
    expect(recipe.camera).toBe('85mm');
    expect(recipe.mood).toBe('moody');
    expect(recipe.style).toBe('noir');
    expect(recipe.aspectRatio).toBe('4:5');
    expect(recipe.modelKey).toBe('flux-dev');
    expect(recipe.outputs).toBe(1);
  });

  it('still records a decisive off for types brand voice can never reach', () => {
    const ingredient = {
      metadata: {},
      promptText: 'A jingle',
    } as unknown as IIngredient;
    const data = buildRepromptData(
      ingredient,
      IngredientCategory.MUSIC,
      'brand-1',
      [],
    );

    expect(recipeFromRepromptData(data, 'music').brandingMode).toBe('off');
  });
});

describe('recipeFromIngredient', () => {
  const baseIngredient = {
    metadataHeight: 1024,
    metadataWidth: 1024,
    promptText: 'A founder at a desk',
  } as unknown as IIngredient;

  it('reads a stored "off" brandingMode', () => {
    const ingredient = {
      ...baseIngredient,
      metadata: { brandingMode: 'off' },
    } as unknown as IIngredient;

    expect(recipeFromIngredient(ingredient, 'image').brandingMode).toBe('off');
  });

  it('still records a decisive off for types brand voice can never reach', () => {
    const ingredient = {
      ...baseIngredient,
      metadata: { brandingMode: 'brand' },
    } as unknown as IIngredient;

    expect(recipeFromIngredient(ingredient, 'voice').brandingMode).toBe('off');
  });
});

describe('settingsPatchFromRecipe', () => {
  it('restores composer settings so Vary can tweak rather than retype', () => {
    const patch = settingsPatchFromRecipe({
      aspectRatio: '9:16',
      blacklist: ['watermark'],
      brandingMode: 'brand',
      camera: 'macro',
      isAudioEnabled: false,
      lighting: 'golden hour',
      modelKey: 'flux-dev',
      mood: 'confident',
      outputs: 4,
      promptTemplate: 'product-photo',
      references: [],
      resolution: '2K',
      style: 'cinematic',
      tags: ['launch'],
      text: 'A founder at a desk',
      type: 'image',
    });

    expect(patch).toMatchObject({
      aspectRatio: '9:16',
      brandingMode: 'brand',
      camera: 'macro',
      lighting: 'golden hour',
      modelKey: 'flux-dev',
      mood: 'confident',
      outputs: 4,
      promptTemplate: 'product-photo',
      resolution: '2K',
      style: 'cinematic',
    });
  });

  it('omits brandingMode from the patch when the recipe does not know it, so Vary never silently disables brand voice (#4676)', () => {
    const patch = settingsPatchFromRecipe({
      blacklist: [],
      isAudioEnabled: false,
      outputs: 1,
      references: [],
      style: '',
      tags: [],
      text: 'Original prompt',
      type: 'image',
    });

    expect(patch).not.toHaveProperty('brandingMode');
  });
});

describe('groupStudioGenerateJobsByRun', () => {
  it('groups N outputs from one submit under a single run', () => {
    const jobs = [
      buildJob({ createdAt: 40, id: 'a', runId: 'run-1' }),
      buildJob({ createdAt: 39, id: 'b', runId: 'run-1' }),
      buildJob({ createdAt: 38, id: 'c', runId: 'run-1' }),
      buildJob({ createdAt: 37, id: 'd', runId: 'run-1' }),
      buildJob({ createdAt: 10, id: 'solo' }),
    ];

    const runs = groupStudioGenerateJobsByRun(jobs);

    expect(runs).toHaveLength(2);
    expect(runs[0]).toMatchObject({ id: 'run-1' });
    expect(runs[0]?.jobs.map((job) => job.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(runs[1]?.id).toBe('solo');
    expect(runs[1]?.jobs).toHaveLength(1);
  });
});

describe('resolveRecipeForJob', () => {
  it('prefers the submit-time recipe over reconstructing from the card prompt', () => {
    const recipe = recipeFromPromptData(
      buildStudioPromptData({
        brandId: 'brand-1',
        promptText: 'Enriched',
        settings: {
          ...getDefaultStudioGenerateSettings('image'),
          style: 'editorial',
        },
        type: 'image',
      }),
      'image',
      {
        ...getDefaultStudioGenerateSettings('image'),
        style: 'editorial',
      },
    );
    const resolved = resolveRecipeForJob(
      buildJob({ prompt: 'Raw box', recipe }),
    );

    expect(resolved?.text).toBe('Enriched');
    expect(resolved?.style).toBe('editorial');
  });
});
