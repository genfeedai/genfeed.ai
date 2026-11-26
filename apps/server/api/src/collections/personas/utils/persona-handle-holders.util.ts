import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { scopedWhere } from '@api/tenancy/scoped-where';
import type { PersonaAvailabilityFields } from '@genfeedai/contracts/interfaces';
import { traced } from '@libs/tracing/traced';

const HOLDER_SELECT = {
  availabilityMode: true,
  availableBrandIds: true,
  brandId: true,
} as const;

/**
 * Live characters and Library elements of the organization that already hold
 * the handle. They share one handle namespace, so a handle is free only when
 * neither kind holds it in a brand the new owner would reach.
 */
export const findHandleHolders = traced(
  'findHandleHolders',
  async (
    client: Pick<PrismaService, 'libraryElement' | 'persona'>,
    params: {
      excludeElementId?: string;
      excludePersonaId?: string;
      handle: string;
      organizationId: string;
    },
  ): Promise<PersonaAvailabilityFields[]> => {
    const [characters, elements] = await Promise.all([
      client.persona.findMany({
        select: HOLDER_SELECT,
        where: scopedWhere(params.organizationId, {
          handle: params.handle,
          ...(params.excludePersonaId
            ? { id: { not: params.excludePersonaId } }
            : {}),
        }),
      }),
      client.libraryElement.findMany({
        select: HOLDER_SELECT,
        where: scopedWhere(params.organizationId, {
          handle: params.handle,
          ...(params.excludeElementId
            ? { id: { not: params.excludeElementId } }
            : {}),
        }),
      }),
    ]);
    return [...characters, ...elements];
  },
);
