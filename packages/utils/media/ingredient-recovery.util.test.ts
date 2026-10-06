import { IngredientCategory, IngredientStatus } from '@genfeedai/contracts';
import type { IIngredient } from '@genfeedai/contracts/interfaces';
import { getIngredientRecovery } from '@utils/media/ingredient-recovery.util';
import { describe, expect, it } from 'vitest';

function failed(
  generationError: string | null,
  extra: Partial<IIngredient> = {},
): IIngredient {
  return {
    category: IngredientCategory.IMAGE,
    status: IngredientStatus.FAILED,
    generationError,
    generationPrompt: 'Saved prompt',
    ...extra,
  } as IIngredient;
}

describe('Failed Library recovery classification', () => {
  it.each([
    'Service Unavailable Exception',
    'ServiceUnavailableException',
    'provider returned 503',
    'Gateway timeout',
    'rate limit exceeded',
  ])('allows an explicit temporary failure: %s', (reason) => {
    expect(getIngredientRecovery(failed(reason)).group).toBe('retry');
  });
  it('does not infer an aspect-ratio problem from a generic 422', () => {
    expect(
      getIngredientRecovery(
        failed(
          'Request to https://api.replicate.com/predictions failed with status 422 Unprocessable Entity',
        ),
      ),
    ).toEqual({
      action: 'reviewInputs',
      group: 'attention',
      reason: 'invalidInputs',
    });
  });
  it.each([
    'Processing failed',
    'Generation failed.',
    null,
    'Unexpected error',
  ])('keeps an ambiguous error unknown: %s', (reason) => {
    expect(getIngredientRecovery(failed(reason)).group).toBe('unknown');
  });
  it('does not offer unsupported audio retries or retries without saved inputs', () => {
    expect(
      getIngredientRecovery(
        failed('503', { category: IngredientCategory.MUSIC }),
      ).reason,
    ).toBe('unsupportedRecovery');
    expect(
      getIngredientRecovery(failed('503', { generationPrompt: null })).reason,
    ).toBe('missingPrompt');
  });
  it('prioritizes a missing reference over a transient error in the same message', () => {
    expect(
      getIngredientRecovery(failed('Reference missing; service unavailable'))
        .action,
    ).toBe('replaceReference');
  });
  it('requires explicit review when historical video reference roles were not recorded', () => {
    expect(
      getIngredientRecovery(
        failed('503', {
          category: IngredientCategory.VIDEO,
          sources: ['start', 'end', 'clip'],
        }),
      ),
    ).toEqual({
      action: 'viewDetails',
      group: 'attention',
      reason: 'referenceRolesUnavailable',
    });
  });
});
