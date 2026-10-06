import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import { AUTO_MODEL_OPTION_VALUE } from '@ui/dropdowns/model-selector/model-selector.constants';
import { describe, expect, it } from 'vitest';
import {
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
  });

  it('leaves the current editor settings alone when the source recorded neither', () => {
    expect(
      resolveImageEditEntry({
        editPrimaryId: 'source-1',
      }),
    ).toEqual({
      droppedAspectRatio: null,
      patch: editFields,
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
});
