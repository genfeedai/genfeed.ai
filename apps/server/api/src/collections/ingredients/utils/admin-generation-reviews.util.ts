import type { AdminGenerationReviewsQueryDto } from '@api/collections/ingredients/dto/admin-generation-reviews-query.dto';
import { IngredientCategory, IngredientStatus } from '@genfeedai/contracts';
import type { Prisma } from '@genfeedai/prisma';

/** Media types the ledger covers; the old image-only ledger hid video and music. */
export const ADMIN_GENERATION_CATEGORIES: readonly IngredientCategory[] = [
  IngredientCategory.IMAGE,
  IngredientCategory.VIDEO,
  IngredientCategory.MUSIC,
];

/** A generation that is running, done or failed; drafts and uploads are not. */
export const ADMIN_GENERATION_STATUSES: readonly IngredientStatus[] = [
  IngredientStatus.PROCESSING,
  IngredientStatus.GENERATED,
  IngredientStatus.FAILED,
];

/**
 * The cross-organization ledger filter. Callers wrap the read in
 * `crossOrgUnsafe`; an explicit `organizationId` narrows it to one tenant.
 */
export function buildAdminGenerationReviewsWhere(
  query: AdminGenerationReviewsQueryDto,
): Prisma.IngredientWhereInput {
  const search = query.search?.trim();

  return {
    category: query.category
      ? query.category
      : { in: [...ADMIN_GENERATION_CATEGORIES] },
    isDeleted: false,
    status: query.status
      ? query.status
      : { in: [...ADMIN_GENERATION_STATUSES] },
    ...(query.organizationId ? { organizationId: query.organizationId } : {}),
    ...(query.brandId ? { brandId: query.brandId } : {}),
    ...(query.model
      ? { modelUsed: { contains: query.model, mode: 'insensitive' } }
      : {}),
    ...(search
      ? {
          OR: [
            { id: search },
            { generationPrompt: { contains: search, mode: 'insensitive' } },
            {
              prompt: {
                is: {
                  OR: [
                    { original: { contains: search, mode: 'insensitive' } },
                    { enhanced: { contains: search, mode: 'insensitive' } },
                  ],
                },
              },
            },
            {
              user: {
                is: { email: { contains: search, mode: 'insensitive' } },
              },
            },
          ],
        }
      : {}),
  };
}

/**
 * What a generation cost, from the `credits` the credit ledger writes onto the
 * generation's activity (`data.value` is a JSON string). Missing when the
 * activity predates that write or the charge was a BYOK bypass.
 */
export function readActivityCredits(data: unknown): number | null {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    return null;
  }
  const { value } = data as { value?: unknown };
  if (typeof value !== 'string') return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (parsed === null || typeof parsed !== 'object') return null;
    const { credits } = parsed as { credits?: unknown };
    return typeof credits === 'number' && Number.isFinite(credits)
      ? credits
      : null;
  } catch {
    return null;
  }
}
