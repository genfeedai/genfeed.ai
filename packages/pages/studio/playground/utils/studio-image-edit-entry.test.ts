import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import { AUTO_MODEL_OPTION_VALUE } from '@ui/dropdowns/model-selector/model-selector.constants';
import { describe, expect, it } from 'vitest';
import {
  imageEditEntryForAsset,
  readImageEditSourceAspect,
  readImageEditSourceModel,
  resolveImageEditEntry,
} from './studio-image-edit-entry';

const editFields = {
  editPrimaryId: 'source-1',
  editSeed: undefined,
  editSize: 'source',
} as const;

describe('resolveImageEditEntry', () => {
  it('keeps 16:9 and replaces a generation model with the editor default', () => {
    expect(
      resolveImageEditEntry({
        editPrimaryId: 'source-1',
        sourceAspectRatio: '16:9',
        sourceModelKey: MODEL_KEYS.REPLICATE_MINIMAX_HAILUO_2_3,
      }),
    ).toEqual({
      droppedAspectRatio: null,
      patch: {
        ...editFields,
        aspectRatio: '16:9',
        modelKey: AUTO_MODEL_OPTION_VALUE,
      },
      replacedModelKey: MODEL_KEYS.REPLICATE_MINIMAX_HAILUO_2_3,
    });
  });

  it('keeps an editor model and its ratio', () => {
    expect(
      resolveImageEditEntry({
        editPrimaryId: 'source-1',
        sourceAspectRatio: '16:9',
        sourceModelKey:
          MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_3_IMAGE_EDIT,
      }),
    ).toEqual({
      droppedAspectRatio: null,
      patch: {
        ...editFields,
        aspectRatio: '16:9',
        modelKey: MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_3_IMAGE_EDIT,
      },
      replacedModelKey: null,
    });
  });

  it('matches the source image when the recorded ratio is not an editor ratio', () => {
    const entry = resolveImageEditEntry({
      editPrimaryId: 'source-1',
      sourceAspectRatio: '2.39:1',
      sourceModelKey: MODEL_KEYS.REPLICATE_GOOGLE_NANO_BANANA,
    });

    expect(entry.droppedAspectRatio).toBe('2.39:1');
    expect(entry.patch.aspectRatio).toBe('auto');
    expect(entry.patch.aspectRatio).not.toBe('1:1');
    expect(entry.patch.modelKey).toBe(AUTO_MODEL_OPTION_VALUE);
    expect(entry.replacedModelKey).toBe(
      MODEL_KEYS.REPLICATE_GOOGLE_NANO_BANANA,
    );
  });

  it('leaves the current editor settings alone when the source recorded neither', () => {
    expect(
      resolveImageEditEntry({
        editPrimaryId: 'source-1',
      }),
    ).toEqual({
      droppedAspectRatio: null,
      patch: editFields,
      replacedModelKey: null,
    });
  });

  it('preserves a real 1:1 source ratio', () => {
    expect(
      resolveImageEditEntry({
        editPrimaryId: 'source-1',
        sourceAspectRatio: '1:1',
      }).patch.aspectRatio,
    ).toBe('1:1');
  });
});

describe('readImageEditSourceAspect', () => {
  it('prefers the recorded edit ratio over pixels', () => {
    expect(
      readImageEditSourceAspect({
        height: 1080,
        recipeAspectRatio: '16:9',
        recipeEditAspectRatio: '4:5',
        width: 1920,
      }),
    ).toBe('4:5');
  });

  it('keeps 16:9 when the pixels match that ratio', () => {
    expect(
      readImageEditSourceAspect({
        height: 1080,
        width: 1920,
      }),
    ).toBe('16:9');
  });

  it('keeps the pixel size when it is not a selectable ratio', () => {
    const aspectRatio = readImageEditSourceAspect({
      height: 800,
      width: 1920,
    });

    expect(aspectRatio).toBe('1920×800');
    expect(
      resolveImageEditEntry({
        editPrimaryId: 'source-1',
        sourceAspectRatio: aspectRatio,
      }),
    ).toMatchObject({
      droppedAspectRatio: '1920×800',
      patch: { aspectRatio: 'auto' },
    });
  });
});

describe('readImageEditSourceModel', () => {
  it('prefers the edit recipe model over the generation model', () => {
    expect(
      readImageEditSourceModel({
        modelKey: MODEL_KEYS.REPLICATE_MINIMAX_HAILUO_2_3,
        recipeEditModel: MODEL_KEYS.REPLICATE_IDEOGRAM_AI_IDEOGRAM_4_5,
        recipeModelKey: MODEL_KEYS.REPLICATE_GOOGLE_NANO_BANANA,
      }),
    ).toBe(MODEL_KEYS.REPLICATE_IDEOGRAM_AI_IDEOGRAM_4_5);
  });

  it('prefers the ledger model over a display model', () => {
    expect(
      readImageEditSourceModel({
        modelKey: MODEL_KEYS.REPLICATE_GOOGLE_NANO_BANANA,
        modelUsed: MODEL_KEYS.REPLICATE_MINIMAX_HAILUO_2_3,
      }),
    ).toBe(MODEL_KEYS.REPLICATE_MINIMAX_HAILUO_2_3);
  });
});

describe('imageEditEntryForAsset', () => {
  it('keeps a recorded 16:9 and does not reset a generation model to an image default', () => {
    expect(
      imageEditEntryForAsset({
        aspectRatio: '16:9',
        id: 'source-1',
        modelUsed: MODEL_KEYS.REPLICATE_MINIMAX_HAILUO_2_3,
      }),
    ).toMatchObject({
      droppedAspectRatio: null,
      patch: {
        aspectRatio: '16:9',
        modelKey: AUTO_MODEL_OPTION_VALUE,
      },
      replacedModelKey: MODEL_KEYS.REPLICATE_MINIMAX_HAILUO_2_3,
    });
  });

  it('ignores a CSS aspect class instead of inventing a ratio from missing pixels', () => {
    expect(
      imageEditEntryForAsset({
        aspectRatio: 'aspect-[16/9]',
        id: 'source-1',
      }).patch.aspectRatio,
    ).toBeUndefined();
  });

  it('reads 16:9 from stored pixels and keeps an editing model', () => {
    expect(
      imageEditEntryForAsset({
        id: 'source-1',
        metadata: { height: 1080, width: 1920 },
        model: MODEL_KEYS.REPLICATE_IDEOGRAM_AI_IDEOGRAM_4_5,
      }),
    ).toMatchObject({
      droppedAspectRatio: null,
      patch: {
        aspectRatio: '16:9',
        modelKey: MODEL_KEYS.REPLICATE_IDEOGRAM_AI_IDEOGRAM_4_5,
      },
      replacedModelKey: null,
    });
  });
});
