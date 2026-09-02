import { LibraryShelfUtil } from '@api/helpers/utils/library-shelf/library-shelf.util';
import {
  FleetReviewStatus,
  IngredientStatus,
  LibraryShelf,
  QualityStatus,
} from '@genfeedai/contracts';

describe('LibraryShelfUtil', () => {
  describe('buildShelfFilter', () => {
    it('returns an empty fragment when no shelf is selected', () => {
      expect(LibraryShelfUtil.buildShelfFilter(undefined)).toEqual({});
    });

    it('returns an empty fragment for an unknown shelf key', () => {
      expect(LibraryShelfUtil.buildShelfFilter('not-a-shelf')).toEqual({});
    });

    it('scopes Generating to in-flight generations', () => {
      expect(
        LibraryShelfUtil.buildShelfFilter(LibraryShelf.GENERATING),
      ).toEqual({ status: IngredientStatus.PROCESSING });
    });

    it('scopes Unsorted to usable assets with no folder', () => {
      expect(LibraryShelfUtil.buildShelfFilter(LibraryShelf.UNSORTED)).toEqual({
        folderId: null,
        status: {
          in: [
            IngredientStatus.DRAFT,
            IngredientStatus.UPLOADED,
            IngredientStatus.GENERATED,
          ],
        },
      });
    });

    it('scopes Needs review to pending review or flagged quality', () => {
      expect(
        LibraryShelfUtil.buildShelfFilter(LibraryShelf.NEEDS_REVIEW),
      ).toEqual({
        OR: [
          {
            reviewStatus: {
              in: [FleetReviewStatus.PENDING, FleetReviewStatus.NEEDS_REVISION],
            },
          },
          { qualityStatus: QualityStatus.NEEDS_REVIEW },
        ],
      });
    });

    it('scopes Approved to validated status or an approved review', () => {
      expect(LibraryShelfUtil.buildShelfFilter(LibraryShelf.APPROVED)).toEqual({
        OR: [
          { status: IngredientStatus.VALIDATED },
          { reviewStatus: FleetReviewStatus.APPROVED },
        ],
      });
    });

    it('scopes Failed to failed generations', () => {
      expect(LibraryShelfUtil.buildShelfFilter(LibraryShelf.FAILED)).toEqual({
        status: IngredientStatus.FAILED,
      });
    });

    it('scopes Archived to archived and rejected assets', () => {
      expect(LibraryShelfUtil.buildShelfFilter(LibraryShelf.ARCHIVED)).toEqual({
        status: {
          in: [IngredientStatus.ARCHIVED, IngredientStatus.REJECTED],
        },
      });
    });

    it('never emits an empty OR branch, which would widen the tenant scope', () => {
      for (const shelf of Object.values(LibraryShelf)) {
        const filter = LibraryShelfUtil.buildShelfFilter(shelf) as {
          OR?: Record<string, unknown>[];
        };

        for (const branch of filter.OR ?? []) {
          expect(Object.keys(branch).length).toBeGreaterThan(0);
        }
      }
    });
  });

  describe('buildStatusFilter', () => {
    it('hides archived and rejected assets by default', () => {
      expect(LibraryShelfUtil.buildStatusFilter()).toEqual({
        status: {
          in: [
            IngredientStatus.DRAFT,
            IngredientStatus.PROCESSING,
            IngredientStatus.UPLOADED,
            IngredientStatus.GENERATED,
            IngredientStatus.VALIDATED,
          ],
        },
      });
    });

    it('yields to the shelf predicate when a shelf is selected', () => {
      expect(
        LibraryShelfUtil.buildStatusFilter(undefined, LibraryShelf.ARCHIVED),
      ).toEqual({});
    });

    it('yields to the shelf predicate even when statuses are also passed', () => {
      expect(
        LibraryShelfUtil.buildStatusFilter(
          [IngredientStatus.FAILED],
          LibraryShelf.GENERATING,
        ),
      ).toEqual({});
    });

    it('honours an explicit status list', () => {
      expect(
        LibraryShelfUtil.buildStatusFilter([
          IngredientStatus.FAILED,
          IngredientStatus.ARCHIVED,
        ]),
      ).toEqual({
        status: {
          in: [IngredientStatus.FAILED, IngredientStatus.ARCHIVED],
        },
      });
    });

    it('normalizes legacy lowercase statuses to Prisma labels', () => {
      expect(LibraryShelfUtil.buildStatusFilter(['completed'])).toEqual({
        status: { in: [IngredientStatus.GENERATED] },
      });
    });

    it('falls back to the default list when the explicit list is empty', () => {
      expect(LibraryShelfUtil.buildStatusFilter([])).toEqual(
        LibraryShelfUtil.buildStatusFilter(),
      );
    });
  });

  describe('buildPlaceFilter', () => {
    it('returns an empty fragment for All assets', () => {
      expect(LibraryShelfUtil.buildPlaceFilter(undefined)).toEqual({});
    });

    it('scopes Starred to favorites', () => {
      expect(LibraryShelfUtil.buildPlaceFilter(true)).toEqual({
        isFavorite: true,
      });
    });

    it('does not filter when isFavorite is explicitly false', () => {
      expect(LibraryShelfUtil.buildPlaceFilter(false)).toEqual({});
    });
  });
});
