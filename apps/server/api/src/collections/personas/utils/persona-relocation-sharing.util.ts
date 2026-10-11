import { RELOCATION_SYSTEM_ACTOR } from '@api/collections/personas/utils/persona-grant-revocation.util';
import { PersonaAvailabilityMode } from '@genfeedai/contracts';
import type { Prisma } from '@genfeedai/prisma';

/** A character the moving brand owns that is shared beyond its owning brand. */
export interface BrandRelocationSharedPersona {
  id: string;
  label: string;
  handle: string | null;
  availabilityMode: PersonaAvailabilityMode;
  /** How many brands `availableBrandIds` lists (zero for an every-brand character). */
  availableBrandCount: number;
}

interface SharedPersonaRow {
  id: string;
  label: string;
  handle: string | null;
  availabilityMode: PersonaAvailabilityMode;
  availableBrandIds: string[];
}

interface PersonaSharingScope {
  brandId: string;
  organizationId: string;
}

async function readSharedPersonaRows(
  client: Prisma.TransactionClient,
  scope: PersonaSharingScope,
): Promise<SharedPersonaRow[]> {
  const rows = await client.persona.findMany({
    orderBy: { createdAt: 'asc' },
    select: {
      availabilityMode: true,
      availableBrandIds: true,
      handle: true,
      id: true,
      label: true,
    },
    where: {
      brandId: scope.brandId,
      isDeleted: false,
      OR: [
        { availabilityMode: { not: PersonaAvailabilityMode.OWNING_BRAND } },
        { availableBrandIds: { isEmpty: false } },
      ],
      organizationId: scope.organizationId,
    },
  });
  return rows.map((row) => ({
    availabilityMode: row.availabilityMode as PersonaAvailabilityMode,
    availableBrandIds: row.availableBrandIds,
    handle: row.handle,
    id: row.id,
    label: row.label,
  }));
}

function toSharedPersona(row: SharedPersonaRow): BrandRelocationSharedPersona {
  return {
    availabilityMode: row.availabilityMode,
    availableBrandCount: row.availableBrandIds.length,
    handle: row.handle,
    id: row.id,
    label: row.label,
  };
}

/**
 * Live characters owned by the brand whose availability reaches past the
 * owning brand: a non-owning mode (every brand or selected brands) or a brand
 * list. The relocation preview and the relocation itself both read this, so the
 * preview lists exactly the characters the move resets.
 */
export async function findSharedBrandPersonas(
  client: Prisma.TransactionClient,
  scope: PersonaSharingScope,
): Promise<BrandRelocationSharedPersona[]> {
  return (await readSharedPersonaRows(client, scope)).map(toSharedPersona);
}

/**
 * Reset every character the moving brand shares beyond itself to its owning
 * brand only, with the brand list cleared. The sharing was a decision of the
 * source organization: an every-brand character would otherwise become
 * available to every brand of the destination, and a brand list names brands
 * of the source organization. Runs in the caller's transaction, before the
 * organization cascade, and writes the same availability audit row as a manual
 * change, under the source organization that made the sharing decision.
 *
 * Returns the characters that were reset.
 */
export async function resetPersonaSharingForRelocation(
  tx: Prisma.TransactionClient,
  params: PersonaSharingScope & { actorUserId: string | null },
): Promise<BrandRelocationSharedPersona[]> {
  const rows = await readSharedPersonaRows(tx, params);
  if (rows.length === 0) {
    return [];
  }
  await tx.persona.updateMany({
    data: {
      availabilityMode: PersonaAvailabilityMode.OWNING_BRAND,
      availableBrandIds: [],
    },
    where: {
      brandId: params.brandId,
      id: { in: rows.map(({ id }) => id) },
      isDeleted: false,
      organizationId: params.organizationId,
    },
  });
  const actorUserId = params.actorUserId || RELOCATION_SYSTEM_ACTOR;
  await tx.personaAvailabilityAudit.createMany({
    data: rows.map((row) => ({
      actorUserId,
      newBrandIds: [],
      newMode: PersonaAvailabilityMode.OWNING_BRAND,
      organizationId: params.organizationId,
      personaId: row.id,
      previousBrandIds: row.availableBrandIds,
      previousMode: row.availabilityMode,
    })),
  });
  return rows.map(toSharedPersona);
}
