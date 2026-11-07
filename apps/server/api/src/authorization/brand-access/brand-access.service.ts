import { findActorApiKey } from '@api/authorization/brand-access/actor-api-key.util';
import { isSystemBrandPrincipal } from '@api/authorization/brand-access/system-brand-principal.util';
import { resolveApiKeyEffectiveMemberRole } from '@api/helpers/utils/auth/api-key-role.util';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { isCloudDeployment } from '@genfeedai/config';
import { MemberRole } from '@genfeedai/contracts';
import { readApiKeyAllowedBrandIds } from '@genfeedai/contracts/constants';
import type { Prisma } from '@genfeedai/prisma';
import { Traced } from '@libs/tracing/traced';
import { ForbiddenException, Injectable } from '@nestjs/common';

export interface BrandAccessActor {
  userId: string;
  organizationId: string;
  isApiKey?: boolean;
  apiKeyId?: string;
  scopes?: string[];
}

@Traced()
@Injectable()
export class BrandAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(
    actor: BrandAccessActor,
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    const base: Prisma.BrandWhereInput = {
      organizationId: actor.organizationId,
      isDeleted: false,
    };
    if (!actor.organizationId || (isCloudDeployment() && !actor.userId)) {
      throw new ForbiddenException('Brand access denied');
    }
    if (isSystemBrandPrincipal(actor)) {
      return { where: base, role: MemberRole.OWNER, brandIds: undefined };
    }
    if (!isCloudDeployment()) {
      const keyBrandIds = await this.readSelfHostedKeyBrandIds(actor, tx);
      return {
        where: {
          ...base,
          ...(keyBrandIds === undefined ? {} : { id: { in: keyBrandIds } }),
        },
        role: null,
        brandIds: keyBrandIds,
      };
    }
    // A key limited to some brands (#9130) reaches only those, whatever its
    // owner's own membership allows.
    let keyBrandIds: string[] | undefined;
    let effectiveActor = actor;
    if (actor.isApiKey) {
      if (!actor.apiKeyId?.trim()) {
        throw new ForbiddenException('Brand access denied');
      }
      const key = await findActorApiKey(tx, actor);
      if (!key) throw new ForbiddenException('Brand access denied');
      keyBrandIds = readApiKeyAllowedBrandIds(key.metadata);
      effectiveActor = {
        ...actor,
        scopes: (actor.scopes ?? []).filter((scope) =>
          key.scopes.includes(scope),
        ),
      };
    }
    const member = await tx.member.findFirst({
      where: {
        userId: actor.userId,
        organizationId: actor.organizationId,
        isActive: true,
        isDeleted: false,
        organization: { is: { isDeleted: false } },
        role: { is: { isDeleted: false } },
      },
      select: {
        role: { select: { key: true } },
        brands: { where: base, select: { id: true } },
      },
    });
    const membershipRole = Object.values(MemberRole).find(
      (role) => role === member?.role?.key,
    );
    if (!member || !membershipRole) {
      throw new ForbiddenException('Brand access denied');
    }
    const role = resolveApiKeyEffectiveMemberRole(
      effectiveActor,
      membershipRole,
    );
    const privileged = role === MemberRole.OWNER || role === MemberRole.ADMIN;
    const memberBrandIds = privileged
      ? undefined
      : member.brands.map((brand) => brand.id);
    const brandIds =
      keyBrandIds === undefined
        ? memberBrandIds
        : keyBrandIds.filter(
            (brandId) =>
              memberBrandIds === undefined || memberBrandIds.includes(brandId),
          );
    return {
      where: {
        ...base,
        ...(brandIds === undefined ? {} : { id: { in: brandIds } }),
      },
      role,
      brandIds,
    };
  }

  /** Self-hosted keys skip the membership read but keep their brand limit. */
  private async readSelfHostedKeyBrandIds(
    actor: BrandAccessActor,
    tx: Prisma.TransactionClient,
  ): Promise<string[] | undefined> {
    if (!actor.isApiKey || !actor.apiKeyId?.trim()) {
      return undefined;
    }
    const key = await tx.apiKey.findFirst({
      where: {
        id: actor.apiKeyId,
        organizationId: actor.organizationId,
        isRevoked: false,
      },
      select: { metadata: true },
    });
    return readApiKeyAllowedBrandIds(key?.metadata);
  }

  async predicate(
    actor: BrandAccessActor,
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<Prisma.BrandWhereInput> {
    return (await this.resolve(actor, tx)).where;
  }

  async assert(
    actor: BrandAccessActor,
    brandId: string,
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<void> {
    const where = await this.predicate(actor, tx);
    const brand = await tx.brand.findFirst({
      where: {
        organizationId: actor.organizationId,
        isDeleted: false,
        AND: [where, { id: brandId }],
      },
      select: { id: true },
    });
    if (!brand) throw new ForbiddenException('Brand access denied');
  }
}
