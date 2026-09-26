/**
 * Shared brand-resolution rule for generation entrypoints (#5219).
 *
 * Generation always has an explicit brand — there is no server-side guessing.
 * Callers resolve the brand at the edge in a strict precedence order, with NO
 * "any brand in this org" tail:
 *   1. An explicit brandId param, validated to organizationId + non-deleted.
 *   2. A context/thread/route brandId (e.g. the URL brand, or an agent
 *      thread's brandId), validated the same way.
 *   3. The acting member's currentBrandId (organizationId + userId) — the
 *      per-member invariant this issue introduces, validated the same way.
 *
 * `resolveGenerationBrand` returns `null` when none of these resolve. Callers
 * MUST treat that as a hard rejection (400 / AgentToolResult error) — never
 * fall back to "the org's first brand" or any other implicit pick.
 */

export interface ResolveGenerationBrandServiceLike {
  findOne(
    query: Record<string, unknown>,
  ): Promise<Record<string, unknown> | null>;
}

export interface ResolveGenerationBrandMembersServiceLike {
  findOne(
    query: Record<string, unknown>,
  ): Promise<{ currentBrandId?: unknown } | null>;
}

export interface ResolveGenerationBrandParams {
  readonly brandsService: ResolveGenerationBrandServiceLike;
  readonly membersService: ResolveGenerationBrandMembersServiceLike;
  readonly organizationId: string;
  readonly userId?: string;
  readonly explicitBrandId?: string | null;
  readonly contextBrandId?: string | null;
}

export async function resolveGenerationBrand(
  params: ResolveGenerationBrandParams,
): Promise<Record<string, unknown> | null> {
  const {
    brandsService,
    membersService,
    organizationId,
    userId,
    explicitBrandId,
    contextBrandId,
  } = params;

  if (explicitBrandId) {
    const brand = await brandsService.findOne({
      id: explicitBrandId,
      organizationId,
    });
    if (brand) {
      return brand;
    }
  }

  if (contextBrandId && contextBrandId !== explicitBrandId) {
    const brand = await brandsService.findOne({
      id: contextBrandId,
      organizationId,
    });
    if (brand) {
      return brand;
    }
  }

  if (userId) {
    const member = await membersService.findOne({ organizationId, userId });
    const currentBrandId =
      typeof member?.currentBrandId === 'string'
        ? member.currentBrandId
        : undefined;

    if (currentBrandId) {
      const brand = await brandsService.findOne({
        id: currentBrandId,
        organizationId,
      });
      if (brand) {
        return brand;
      }
    }
  }

  return null;
}
