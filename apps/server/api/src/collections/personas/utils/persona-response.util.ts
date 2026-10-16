import type { PersonaDocument } from '@api/collections/personas/schemas/persona.schema';
import {
  isPersonaSharedAcrossBrands,
  resolvePersonaBrandIds,
} from '@api/collections/personas/utils/persona-availability.util';
import {
  loadOrderedReferenceIds,
  orderedReferenceIdsFromRow,
} from '@api/collections/personas/utils/persona-references.util';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { scopedWhere } from '@api/tenancy/scoped-where';
import { PersonaAvailabilityMode } from '@genfeedai/contracts';

/**
 * Adds `referenceIngredientIds`: every live reference image of each
 * character, primary first, in one query for the page.
 */
export async function withPersonaReferenceIngredientIds(
  prisma: PrismaService,
  docs: PersonaDocument[],
  organizationId: string,
): Promise<PersonaDocument[]> {
  const byPersona = await loadOrderedReferenceIds(
    prisma,
    organizationId,
    docs.map((doc) => doc.id),
  );
  return docs.map((doc) => ({
    ...doc,
    referenceIngredientIds:
      byPersona.get(doc.id) ??
      orderedReferenceIdsFromRow({
        avatarIngredientId: doc.avatarIngredientId ?? null,
      }),
  }));
}

/**
 * Adds the read-model summary: `isShared`, and `availableBrandCount` (every
 * organization brand for `all brands`).
 */
export async function withPersonaAvailabilitySummary(
  prisma: PrismaService,
  docs: PersonaDocument[],
  organizationId: string,
): Promise<PersonaDocument[]> {
  let organizationBrandCount: number | null = null;
  for (const doc of docs) {
    if (doc.availabilityMode === PersonaAvailabilityMode.ALL_BRANDS) {
      organizationBrandCount ??= await prisma.brand.count({
        where: scopedWhere(organizationId),
      });
    }
  }
  return docs.map((doc) => ({
    ...doc,
    availableBrandCount:
      doc.availabilityMode === PersonaAvailabilityMode.ALL_BRANDS
        ? (organizationBrandCount ?? 0)
        : resolvePersonaBrandIds(doc, []).length,
    isShared: isPersonaSharedAcrossBrands(doc),
    owningBrandId: doc.brandId ?? null,
    owningBrandName:
      (doc.brand as { label?: string | null } | null | undefined)?.label ??
      null,
  }));
}
