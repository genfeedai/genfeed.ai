import {
  FleetReviewStatus,
  IngredientOrigin,
  IngredientStatus,
  LibraryShelf,
  QualityStatus,
} from '@genfeedai/contracts';
import type { IIngredient } from '@genfeedai/contracts/interfaces';
import { describe, expect, it } from 'vitest';

import { getIngredientShelf } from './ingredient-shelf.util';

function createIngredient(overrides: Partial<IIngredient>): IIngredient {
  return {
    id: 'a',
    status: IngredientStatus.GENERATED,
    ...overrides,
  } as IIngredient;
}

describe('getIngredientShelf', () => {
  it('reads an in-flight generation as Generating', () => {
    expect(
      getIngredientShelf(
        createIngredient({ status: IngredientStatus.PROCESSING }),
      ),
    ).toBe(LibraryShelf.GENERATING);
  });

  it('reads a failed generation as Failed', () => {
    expect(
      getIngredientShelf(createIngredient({ status: IngredientStatus.FAILED })),
    ).toBe(LibraryShelf.FAILED);
  });

  it('reads rejected assets onto the Rejected shelf', () => {
    expect(
      getIngredientShelf(
        createIngredient({ status: IngredientStatus.REJECTED }),
      ),
    ).toBe('rejected');
  });

  it('reads a pending fleet review as Needs review', () => {
    expect(
      getIngredientShelf(
        createIngredient({ reviewStatus: FleetReviewStatus.NEEDS_REVISION }),
      ),
    ).toBe(LibraryShelf.NEEDS_REVIEW);
  });

  it('reads a quality flag as Needs review even without a fleet review', () => {
    expect(
      getIngredientShelf(
        createIngredient({ qualityStatus: QualityStatus.NEEDS_REVIEW }),
      ),
    ).toBe(LibraryShelf.NEEDS_REVIEW);
  });

  it('prefers Approved over Unsorted for a validated unfiled asset', () => {
    expect(
      getIngredientShelf(
        createIngredient({
          folderId: null,
          status: IngredientStatus.VALIDATED,
        }),
      ),
    ).toBe(LibraryShelf.APPROVED);
  });

  it.each([IngredientOrigin.UPLOADED, IngredientOrigin.IMPORTED])(
    'reads an unfiled %s asset as References, never Unsorted',
    (origin) => {
      expect(
        getIngredientShelf(
          createIngredient({
            folderId: null,
            origin,
            status: IngredientStatus.UPLOADED,
          }),
        ),
      ).toBe(LibraryShelf.REFERENCES);
    },
  );

  it('still reads an archived upload as Archived', () => {
    expect(
      getIngredientShelf(
        createIngredient({
          origin: IngredientOrigin.UPLOADED,
          status: IngredientStatus.ARCHIVED,
        }),
      ),
    ).toBe(LibraryShelf.ARCHIVED);
  });

  it('reads an unfiled generated asset as Unsorted', () => {
    expect(getIngredientShelf(createIngredient({ folderId: null }))).toBe(
      LibraryShelf.UNSORTED,
    );
  });

  it('returns no shelf for a filed asset that is past review', () => {
    expect(
      getIngredientShelf(
        createIngredient({
          folderId: 'folder-1',
          qualityStatus: QualityStatus.GOOD,
        }),
      ),
    ).toBeNull();
  });
});
