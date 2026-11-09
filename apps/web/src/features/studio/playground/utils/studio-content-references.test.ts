import { IngredientCategory, UploadStatus } from '@genfeedai/contracts';
import type { IIngredient } from '@genfeedai/contracts/interfaces';
import { describe, expect, it } from 'vitest';
import {
  resolveSupportsInterpolation,
  toContentReference,
  toRestoredAttachment,
} from '@/features/studio/playground/utils/studio-content-references';

function ingredient(overrides: Partial<IIngredient>): IIngredient {
  return {
    brandId: 'brand-1',
    category: IngredientCategory.IMAGE,
    id: 'asset-1',
    ...overrides,
  } as IIngredient;
}

describe('resolveSupportsInterpolation', () => {
  it('lets Auto accept a start and an end frame together', () => {
    expect(resolveSupportsInterpolation('auto', undefined)).toBe(true);
  });
});

describe('toContentReference', () => {
  it('drops an image asset that has no preview', () => {
    expect(toContentReference(ingredient({}), 'reference')).toBeNull();
  });

  it('keeps an audio asset with a stored file for the audio role only', () => {
    const audio = ingredient({
      category: IngredientCategory.AUDIO,
      s3Key: 'audio/key.mp3',
    });

    expect(toContentReference(audio, 'audioReference')?.item.id).toBe(
      'asset-1',
    );
    expect(toContentReference(audio, 'reference')).toBeNull();
  });
});

describe('toRestoredAttachment', () => {
  it('cannot restore an upload that has neither a url nor a stored audio file', () => {
    expect(toRestoredAttachment(ingredient({}))).toBeNull();
  });

  it('restores a stored audio file as a completed upload', () => {
    const restored = toRestoredAttachment(
      ingredient({
        category: IngredientCategory.AUDIO,
        s3Key: 'audio/key.mp3',
      }),
    );

    expect(restored).toMatchObject({
      id: 'asset-1',
      ingredientId: 'asset-1',
      kind: 'audio',
      status: UploadStatus.COMPLETED,
    });
  });
});
