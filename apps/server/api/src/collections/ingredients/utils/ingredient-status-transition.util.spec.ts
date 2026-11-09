import { INGREDIENT_PROCESSING_TIMEOUT_ERROR } from '@api/collections/ingredients/constants/processing-timeout.constants';
import {
  settleIngredientGeneration,
  settleSharedIngredientGeneration,
  transitionIngredientStatus,
} from '@api/collections/ingredients/utils/ingredient-status-transition.util';
import { ingredientRowWorld } from '@api-test/fixtures/ingredient-row.world';
import { IngredientStatus } from '@genfeedai/contracts';
import { describe, expect, it } from 'vitest';

const processing = {
  id: 'ingredient-1',
  isDeleted: false,
  organizationId: 'org-1',
  status: IngredientStatus.PROCESSING,
};

describe('transitionIngredientStatus (#9735)', () => {
  it.each([
    [IngredientStatus.PROCESSING, IngredientStatus.GENERATED],
    [IngredientStatus.PROCESSING, IngredientStatus.UPLOADED],
    [IngredientStatus.PROCESSING, IngredientStatus.FAILED],
    [IngredientStatus.FAILED, IngredientStatus.PROCESSING],
    [IngredientStatus.GENERATED, IngredientStatus.VALIDATED],
  ])('moves a %s ingredient to %s', async (from, to) => {
    const row = { ...processing, status: from };

    await expect(
      transitionIngredientStatus(ingredientRowWorld(row), {
        from,
        id: 'ingredient-1',
        organizationId: 'org-1',
        to,
      }),
    ).resolves.toBe(true);
    expect(row.status).toBe(to);
  });

  it.each([
    [IngredientStatus.GENERATED, IngredientStatus.PROCESSING],
    [IngredientStatus.PROCESSING, IngredientStatus.VALIDATED],
    [IngredientStatus.ARCHIVED, IngredientStatus.GENERATED],
    [IngredientStatus.PROCESSING, IngredientStatus.PROCESSING],
  ])('refuses the %s to %s edge the table does not allow', async (from, to) => {
    const row = { ...processing, status: from };

    await expect(
      transitionIngredientStatus(ingredientRowWorld(row), {
        from,
        id: 'ingredient-1',
        organizationId: 'org-1',
        to,
      }),
    ).rejects.toThrow(`cannot move from ${from} to ${to}`);
    expect(row.status).toBe(from);
  });

  it('leaves a generation the user cancelled failed when a late success arrives', async () => {
    const row = {
      ...processing,
      generationError: 'Cancelled by user',
      status: IngredientStatus.FAILED,
    };

    await expect(
      transitionIngredientStatus(ingredientRowWorld(row), {
        data: { s3Key: 'late.png' },
        from: IngredientStatus.PROCESSING,
        id: 'ingredient-1',
        organizationId: 'org-1',
        to: IngredientStatus.GENERATED,
      }),
    ).resolves.toBe(false);
    expect(row).toEqual({
      ...processing,
      generationError: 'Cancelled by user',
      status: IngredientStatus.FAILED,
    });
  });

  it('only reopens a row whose extra columns still match', async () => {
    const row = {
      ...processing,
      generationError: 'Generation failed',
      status: IngredientStatus.FAILED,
    };

    await expect(
      transitionIngredientStatus(ingredientRowWorld(row), {
        data: { generationError: null },
        from: IngredientStatus.FAILED,
        id: 'ingredient-1',
        match: { generationError: 'Processing timed out' },
        organizationId: 'org-1',
        to: IngredientStatus.PROCESSING,
      }),
    ).resolves.toBe(false);
    expect(row.status).toBe(IngredientStatus.FAILED);
  });

  it("does not touch another organization's ingredient", async () => {
    const row = { ...processing };

    await expect(
      transitionIngredientStatus(ingredientRowWorld(row), {
        from: IngredientStatus.PROCESSING,
        id: 'ingredient-1',
        organizationId: 'org-other',
        to: IngredientStatus.FAILED,
      }),
    ).resolves.toBe(false);
    expect(row.status).toBe(IngredientStatus.PROCESSING);
  });

  it.each([
    [IngredientStatus.PROCESSING, null, true, IngredientStatus.GENERATED],
    [
      IngredientStatus.FAILED,
      INGREDIENT_PROCESSING_TIMEOUT_ERROR,
      true,
      IngredientStatus.GENERATED,
    ],
    [
      IngredientStatus.FAILED,
      'Cancelled by user',
      false,
      IngredientStatus.FAILED,
    ],
    [IngredientStatus.GENERATED, null, false, IngredientStatus.GENERATED],
  ])(
    'settles a %s generation (error %s) as GENERATED: %s',
    async (status, generationError, isSettled, finalStatus) => {
      const row = { ...processing, generationError, status };

      await expect(
        settleIngredientGeneration(ingredientRowWorld(row), {
          id: 'ingredient-1',
          organizationId: 'org-1',
          to: IngredientStatus.GENERATED,
        }),
      ).resolves.toBe(isSettled);
      expect(row.status).toBe(finalStatus);
    },
  );

  it.each([
    [
      IngredientStatus.PROCESSING,
      null,
      true,
      IngredientStatus.GENERATED,
      'out.mp4',
    ],
    [
      IngredientStatus.GENERATED,
      null,
      true,
      IngredientStatus.GENERATED,
      'out.mp4',
    ],
    [
      IngredientStatus.FAILED,
      'Cancelled by user',
      false,
      IngredientStatus.FAILED,
      undefined,
    ],
  ])(
    'settles a %s shared generation (error %s) as GENERATED: %s',
    async (status, generationError, isSettled, finalStatus, s3Key) => {
      const row: Record<string, unknown> = {
        ...processing,
        generationError,
        status,
      };

      await expect(
        settleSharedIngredientGeneration(ingredientRowWorld(row), {
          data: { s3Key: 'out.mp4' },
          id: 'ingredient-1',
          organizationId: 'org-1',
          to: IngredientStatus.GENERATED,
        }),
      ).resolves.toBe(isSettled);
      expect(row.status).toBe(finalStatus);
      expect(row.s3Key).toBe(s3Key);
    },
  );
});
