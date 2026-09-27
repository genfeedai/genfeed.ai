import {
  type ResolveGenerationBrandMembersServiceLike,
  type ResolveGenerationBrandServiceLike,
  resolveGenerationBrand,
} from '@api/collections/brands/utils/resolve-generation-brand.util';
import { BadRequestException } from '@nestjs/common';

/**
 * The single brand resolver for every API-key and MCP generation entrypoint
 * (#5292). Composes the #5219 `resolveGenerationBrand` rule with the one
 * extra step API-key/MCP callers need — swapping the caller's "context"
 * brand for the key's own default — so every generation controller reaches
 * the same resolution order, validated same-org + non-deleted at each step:
 *
 *   1. The request's own explicit brandId.
 *   2. For an API-key caller, the key's `defaultBrandId`; for every other
 *      (session/app/agent) caller, the ambient `AuthenticatedUser.brandId` —
 *      already the member's real `currentBrandId` invariant per #5219, but
 *      re-validated here rather than trusted outright, since it can be
 *      briefly stale (e.g. right after a brand delete, while an identity
 *      cache entry is still live).
 *   3. The acting member's own `currentBrandId` in this organization. For an
 *      API-key call this resolves the KEY OWNER's member row: `userId` on an
 *      API-key-authenticated request is already the key's owning user (set
 *      by `ApiKeyAuthGuard`), never the caller's own id.
 *
 * There is no "any brand in this org" tail at any step. A caller for whom
 * none of these resolve gets a clear 400 — never an implicit pick.
 */

export interface ResolveGenerationBrandApiKeysServiceLike {
  findOne(
    query: Record<string, unknown>,
  ): Promise<{ defaultBrandId?: unknown } | null>;
}

export interface ResolveGenerationBrandForCallerServices {
  readonly apiKeysService: ResolveGenerationBrandApiKeysServiceLike;
  readonly brandsService: ResolveGenerationBrandServiceLike;
  readonly membersService: ResolveGenerationBrandMembersServiceLike;
}

export interface ResolveGenerationBrandCaller {
  readonly apiKeyId?: string | null;
  readonly brandId?: string | null;
  readonly id: string;
  readonly isApiKey?: boolean;
  readonly organizationId: string;
  readonly userId?: string | null;
}

export interface ResolveGenerationBrandForCallerParams {
  readonly services: ResolveGenerationBrandForCallerServices;
  readonly user: ResolveGenerationBrandCaller;
  readonly explicitBrandId?: string | null;
  /** Thrown when a session/app/agent caller resolves no brand. */
  readonly noBrandMessage: string;
  /** Thrown when an API-key caller resolves no brand. */
  readonly noApiKeyDefaultBrandMessage: string;
}

export async function resolveGenerationBrandIdForCaller(
  params: ResolveGenerationBrandForCallerParams,
): Promise<string> {
  const { services, user, explicitBrandId } = params;

  const contextBrandId = user.isApiKey
    ? await resolveApiKeyDefaultBrandId(services.apiKeysService, user.apiKeyId)
    : user.brandId;

  const resolved = await resolveGenerationBrand({
    brandsService: services.brandsService,
    contextBrandId,
    explicitBrandId,
    membersService: services.membersService,
    organizationId: user.organizationId,
    userId: user.userId ?? user.id,
  });

  if (!resolved?.id) {
    throw new BadRequestException(
      user.isApiKey
        ? params.noApiKeyDefaultBrandMessage
        : params.noBrandMessage,
    );
  }

  return String(resolved.id);
}

async function resolveApiKeyDefaultBrandId(
  apiKeysService: ResolveGenerationBrandApiKeysServiceLike,
  apiKeyId: string | null | undefined,
): Promise<string | null> {
  if (!apiKeyId) {
    return null;
  }

  const apiKey = await apiKeysService.findOne({ id: apiKeyId });
  return typeof apiKey?.defaultBrandId === 'string'
    ? apiKey.defaultBrandId
    : null;
}
