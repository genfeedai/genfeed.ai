import { PersonaAvailabilityMode } from '@genfeedai/contracts';
import type { Prisma } from '@genfeedai/prisma';
import { traced } from '@libs/tracing/traced';

/**
 * Resets every element the moving brand shares beyond itself to its owning
 * brand only. The sharing was a decision of the source organization: an
 * every-brand element would otherwise become available to every brand of the
 * destination, and a brand list names brands of the source organization. Runs
 * in the relocation transaction, before the organization cascade, the same
 * way characters are reset.
 *
 * Returns how many elements were reset.
 */
export const resetLibraryElementSharingForRelocation = traced(
  'resetLibraryElementSharingForRelocation',
  async (
    tx: Pick<Prisma.TransactionClient, 'libraryElement'>,
    params: { brandId: string; organizationId: string },
  ): Promise<number> => {
    const { count } = await tx.libraryElement.updateMany({
      data: {
        availabilityMode: PersonaAvailabilityMode.OWNING_BRAND,
        availableBrandIds: [],
      },
      where: {
        brandId: params.brandId,
        isDeleted: false,
        OR: [
          { availabilityMode: { not: PersonaAvailabilityMode.OWNING_BRAND } },
          { availableBrandIds: { isEmpty: false } },
        ],
        organizationId: params.organizationId,
      },
    });
    return count;
  },
);
