import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import type { KnowledgeActor } from '@api/collections/contexts/interfaces/knowledge-actor.interface';
import { BadRequestException } from '@nestjs/common';

/** Select a brand without allowing a request to change the authenticated tenant. */
export function resolveKnowledgeActor(
  user: AuthenticatedUser,
  requestedBrandId?: unknown,
): KnowledgeActor {
  if (requestedBrandId !== undefined && typeof requestedBrandId !== 'string') {
    throw new BadRequestException('brandId must be a single string');
  }
  return {
    organizationId: user.organizationId,
    userId: user.userId ?? user.id,
    brandId: requestedBrandId || undefined,
  };
}
