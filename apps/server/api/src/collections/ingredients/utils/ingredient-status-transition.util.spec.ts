import { transitionIngredientStatus } from '@api/collections/ingredients/utils/ingredient-status-transition.util';
import { IngredientStatus } from '@genfeedai/contracts';
import { describe, expect, it } from 'vitest';

/** Stands in for the table: a row matches when every filter column matches. */
function ingredientRow(row: Record<string, unknown>) {
  return {
    patchAll: async (
      filter: Record<string, unknown>,
      update: Record<string, unknown>,
    ) => {
      const matches = Object.entries(filter).every(
        ([key, value]) => row[key] === value,
      );
      if (matches) Object.assign(row, update);
      return { modifiedCount: matches ? 1 : 0 };
    },
  };
}

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
      transitionIngredientStatus(ingredientRow(row), {
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
      transitionIngredientStatus(ingredientRow(row), {
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
      transitionIngredientStatus(ingredientRow(row), {
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
      transitionIngredientStatus(ingredientRow(row), {
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
      transitionIngredientStatus(ingredientRow(row), {
        from: IngredientStatus.PROCESSING,
        id: 'ingredient-1',
        organizationId: 'org-other',
        to: IngredientStatus.FAILED,
      }),
    ).resolves.toBe(false);
    expect(row.status).toBe(IngredientStatus.PROCESSING);
  });
});
