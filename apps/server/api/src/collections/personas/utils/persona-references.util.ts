import type {
  PersonaReferencesClient,
  PersonaWithReferences,
} from '@api/collections/personas/services/persona-references.types';
import { scopedWhere } from '@api/tenancy/scoped-where';
import { IngredientCategory, IngredientStatus } from '@genfeedai/contracts';

/**
 * `references` select for a persona read: position order, with the
 * ingredient's soft-delete flag so readers can skip assets in the trash.
 */
export const PERSONA_REFERENCES_SELECT = {
  orderBy: { position: 'asc' },
  select: {
    ingredient: { select: { isDeleted: true } },
    ingredientId: true,
    position: true,
  },
} as const;

/** Image categories a character reference may be. */
export const CHARACTER_REFERENCE_IMAGE_CATEGORIES = [
  IngredientCategory.IMAGE,
  IngredientCategory.IMAGE_EDIT,
] as const;

/** Statuses of a finished image that may become a character reference. */
export const CHARACTER_REFERENCE_IMAGE_STATUSES = [
  IngredientStatus.GENERATED,
  IngredientStatus.UPLOADED,
  IngredientStatus.VALIDATED,
] as const;

/**
 * Ingredient filter for images that may become a reference of a character in
 * this brand: live, completed images of the brand in the organization.
 */
export function characterReferenceImageWhere(params: {
  brandId: string;
  ingredientIds: readonly string[];
  organizationId: string;
}) {
  return {
    brandId: params.brandId,
    category: { in: [...CHARACTER_REFERENCE_IMAGE_CATEGORIES] },
    id: { in: [...params.ingredientIds] },
    isDeleted: false,
    organizationId: params.organizationId,
    status: { in: [...CHARACTER_REFERENCE_IMAGE_STATUSES] },
  };
}

/**
 * The requested ids that are images this brand may use as a character
 * reference, in request order. Callers reject when any id is missing.
 */
export async function findCharacterReferenceImageIds(
  client: Pick<PersonaReferencesClient, 'ingredient'>,
  params: {
    brandId: string;
    ingredientIds: readonly string[];
    organizationId: string;
  },
): Promise<string[]> {
  if (params.ingredientIds.length === 0) {
    return [];
  }
  const rows = await client.ingredient.findMany({
    select: { id: true },
    where: scopedWhere(
      params.organizationId,
      characterReferenceImageWhere(params),
    ),
  });
  const found = new Set(rows.map((row) => row.id));
  return params.ingredientIds.filter((id) => found.has(id));
}

/**
 * Ordered live reference ids of an already-loaded persona row: position
 * order, soft-deleted ingredients skipped. A persona with no reference rows
 * (created before references existed, or by a previous release during a
 * rollout) reads as `[avatarIngredientId]`.
 */
export function orderedReferenceIdsFromRow(
  row: PersonaWithReferences,
): string[] {
  const references = row.references ?? [];
  if (references.length === 0) {
    return row.avatarIngredientId ? [row.avatarIngredientId] : [];
  }
  const ids: string[] = [];
  for (const reference of [...references].sort(
    (a, b) => a.position - b.position,
  )) {
    if (
      reference.ingredient?.isDeleted ||
      ids.includes(reference.ingredientId)
    ) {
      continue;
    }
    ids.push(reference.ingredientId);
  }
  return ids;
}

/**
 * Every asset that makes a persona's character an input, for admission and
 * granted-media checks: the avatar plus every stored reference, including
 * ones in the trash, so a character asset is never admitted as an ordinary
 * one.
 */
export function characterAssetIdsFromRow(row: PersonaWithReferences): string[] {
  return [
    ...new Set([
      ...(row.avatarIngredientId ? [row.avatarIngredientId] : []),
      ...(row.references ?? []).map((reference) => reference.ingredientId),
    ]),
  ];
}

/** Prisma filter for personas using any of the assets as a reference image. */
export function personaReferencesAnyWhere(ingredientIds: readonly string[]) {
  const ids = [...ingredientIds];
  return [
    { avatarIngredientId: { in: ids } },
    { references: { some: { ingredientId: { in: ids } } } },
  ];
}

/**
 * Ordered live reference ids per persona, in one query. Personas outside the
 * organization or deleted are absent from the map.
 */
export async function loadOrderedReferenceIds(
  client: Pick<PersonaReferencesClient, 'persona'>,
  organizationId: string,
  personaIds: readonly string[],
): Promise<Map<string, string[]>> {
  const ids = [...new Set(personaIds)];
  if (ids.length === 0) {
    return new Map();
  }
  const rows = await client.persona.findMany({
    select: {
      avatarIngredientId: true,
      id: true,
      references: PERSONA_REFERENCES_SELECT,
    },
    where: scopedWhere(organizationId, { id: { in: ids } }),
  });
  return new Map(rows.map((row) => [row.id, orderedReferenceIdsFromRow(row)]));
}
