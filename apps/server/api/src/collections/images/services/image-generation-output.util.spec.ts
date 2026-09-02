import { IngredientStatus } from '@genfeedai/contracts';

import {
  isProcessingIngredient,
  missingOutputUrlMessage,
  optionalUploadString,
  shouldFinalizeExternalOutput,
} from './image-generation-output.util';

describe('image generation output helpers', () => {
  it('finalizes only external results that already have output URLs', () => {
    expect(
      shouldFinalizeExternalOutput({ kind: 'external-id', outputUrls: ['a'] }),
    ).toBe(true);
    expect(shouldFinalizeExternalOutput({ kind: 'external-id' })).toBe(false);
    expect(shouldFinalizeExternalOutput({ kind: 'inline-buffer' })).toBe(false);
  });

  it('ignores ingredients that are no longer processing', () => {
    expect(
      isProcessingIngredient({ status: IngredientStatus.PROCESSING }),
    ).toBe(true);
    expect(isProcessingIngredient({ status: IngredientStatus.GENERATED })).toBe(
      false,
    );
    expect(isProcessingIngredient(null)).toBe(false);
  });

  it('keeps only string upload metadata', () => {
    expect(optionalUploadString('s3://key')).toBe('s3://key');
    expect(optionalUploadString(12)).toBeUndefined();
    expect(missingOutputUrlMessage(2)).toContain('index 2');
  });
});
