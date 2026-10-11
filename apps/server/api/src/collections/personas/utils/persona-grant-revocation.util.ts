import type { Prisma } from '@genfeedai/prisma';

/** Recorded as the revoking actor when the move came from a platform operator without a user id. */
const RELOCATION_SYSTEM_ACTOR = 'system:brand-relocation';

/**
 * Revoke every active grant on the personas an organization's brand owns. A
 * grant is stamped with the owning organization of its persona when it is made;
 * once the owning brand moves, the persona belongs to another tenant, and a
 * grant the previous owner issued must not carry the new owner's character to a
 * recipient it never chose. Runs in the caller's transaction and writes the
 * same revoked audit row as `PersonaGrantsService.revoke`.
 *
 * Returns the number of grants revoked.
 */
export async function revokePersonaGrantsForRelocation(
  tx: Prisma.TransactionClient,
  params: {
    actorUserId: string | null;
    brandId: string;
    organizationId: string;
  },
): Promise<number> {
  // tenant-scope-ignore: deleted characters keep their grants; the organization and owning brand are pinned.
  const personas = await tx.persona.findMany({
    select: { id: true },
    where: {
      brandId: params.brandId,
      organizationId: params.organizationId,
    },
  });
  if (personas.length === 0) {
    return 0;
  }
  const grants = await tx.personaGrant.findMany({
    where: {
      ownerOrganizationId: params.organizationId,
      personaId: { in: personas.map(({ id }) => id) },
      revokedAt: null,
    },
  });
  if (grants.length === 0) {
    return 0;
  }
  const actorUserId = params.actorUserId || RELOCATION_SYSTEM_ACTOR;
  const revoked = await tx.personaGrant.updateMany({
    data: {
      revokedAt: new Date(),
      revokedByUserId: params.actorUserId || null,
    },
    where: {
      id: { in: grants.map(({ id }) => id) },
      ownerOrganizationId: params.organizationId,
      revokedAt: null,
    },
  });
  await tx.personaGrantAudit.createMany({
    data: grants.map((grant) => ({
      action: 'revoked',
      actorUserId,
      grantId: grant.id,
      newBrandIds: [],
      newMode: null,
      ownerOrganizationId: params.organizationId,
      personaId: grant.personaId,
      previousBrandIds: grant.availableBrandIds ?? [],
      previousMode: grant.availabilityMode,
      recipientOrganizationId: grant.recipientOrganizationId,
    })),
  });
  return revoked.count;
}
