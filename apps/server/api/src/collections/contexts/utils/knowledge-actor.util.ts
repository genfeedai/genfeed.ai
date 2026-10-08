import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import type { KnowledgeActor } from '@api/collections/contexts/interfaces/knowledge-actor.interface';
import type { ITenantReadScope } from '@api/helpers/interceptors/tenant-context/tenant-read-scope.types';
import { BadRequestException } from '@nestjs/common';

/** Select a brand without allowing a request to change the authenticated tenant. */
export function resolveKnowledgeActor(
  user: AuthenticatedUser,
  requestedBrandId?: unknown,
  readScope?: ITenantReadScope,
): KnowledgeActor {
  if (requestedBrandId !== undefined && typeof requestedBrandId !== 'string') {
    throw new BadRequestException('brandId must be a single string');
  }
  return {
    organizationId: readScope?.organizationId ?? user.organizationId,
    userId: user.userId ?? user.id,
    apiKeyId: user.apiKeyId,
    isApiKey: user.isApiKey,
    scopes: user.scopes,
    brandId: requestedBrandId || undefined,
  };
}
