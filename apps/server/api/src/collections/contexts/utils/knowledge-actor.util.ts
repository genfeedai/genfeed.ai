import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import type { KnowledgeActor } from '@api/collections/contexts/interfaces/knowledge-actor.interface';
import type { ITenantReadScope } from '@api/helpers/interceptors/tenant-context/tenant-read-scope.types';
import { resolveApiKeyEffectiveMemberRole } from '@api/helpers/utils/auth/api-key-role.util';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { MemberRole } from '@genfeedai/contracts';
import { BadRequestException, ForbiddenException } from '@nestjs/common';

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

export async function assertKnowledgeGovernance(
  prisma: PrismaService,
  actor: KnowledgeActor,
): Promise<void> {
  const member = await prisma.member.findFirst({
    select: { role: { select: { key: true } } },
    where: {
      organization: { is: { isDeleted: false } },
      role: { is: { isDeleted: false } },
      isActive: true,
      isDeleted: false,
      organizationId: actor.organizationId,
      userId: actor.userId,
    },
  });
  const canonicalRole = Object.values(MemberRole).find(
    (role) => role === member?.role?.key,
  );
  const role = canonicalRole
    ? resolveApiKeyEffectiveMemberRole(actor, canonicalRole)
    : undefined;
  if (role === MemberRole.OWNER || role === MemberRole.ADMIN) {
    return;
  }

  throw new ForbiddenException(
    'Knowledge governance requires an organization admin',
  );
}
