import { CreateMemberDto } from '@api/collections/members/dto/create-member.dto';
import { UpdateMemberDto } from '@api/collections/members/dto/update-member.dto';
import type { MemberDocument } from '@api/collections/members/schemas/member.schema';
import { AccessBootstrapCacheService } from '@api/common/services/access-bootstrap-cache.service';
import { scopedWhere } from '@api/index';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import type {
  PopulateInput,
  PrismaUpdate,
} from '@api/shared/services/base/base-query-normalization.adapter';
import {
  type NativeSecondaryAppId,
  normalizeInstalledAppIds,
} from '@genfeedai/contracts/constants';
import type { AgentTeamMentionItem } from '@genfeedai/contracts/interfaces';
import { Prisma } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { crossOrgUnsafe } from '@libs/prisma/tenant-context';
import { Injectable } from '@nestjs/common';

const DEFAULT_TEAM_MENTION_LIMIT = 50;
const MAX_TEAM_MENTION_LIMIT = 100;

type TeamMentionRecord = {
  id: string;
  roleKey: string | null;
  role: {
    key: string;
    label: string;
  };
  user: {
    avatar: string | null;
    email: string | null;
    firstName: string | null;
    handle: string;
    id: string;
    isDeleted: boolean;
    lastName: string | null;
    name: string | null;
    platformRole: string;
  };
};

@Injectable()
export class MembersService extends BaseService<
  MemberDocument,
  CreateMemberDto,
  UpdateMemberDto
> {
  public readonly constructorName: string = String(this.constructor.name);

  constructor(
    public readonly prisma: PrismaService,
    public readonly logger: LoggerService,
    private readonly accessBootstrapCacheService: AccessBootstrapCacheService,
  ) {
    super(prisma, 'member', logger);
  }

  override async patch(
    id: string,
    updateDto: Partial<UpdateMemberDto> | PrismaUpdate,
    populate: PopulateInput = [],
  ): Promise<MemberDocument> {
    const member = await super.patch(id, updateDto, populate);
    if (
      member?.userId &&
      ('roleId' in updateDto ||
        'roleKey' in updateDto ||
        'role' in updateDto ||
        'isActive' in updateDto ||
        'isDeleted' in updateDto)
    ) {
      await this.accessBootstrapCacheService.invalidateForUser(member.userId);
    }
    return member;
  }

  override async remove(id: string): Promise<MemberDocument | null> {
    const member = await super.remove(id);
    if (member?.userId) {
      await this.accessBootstrapCacheService.invalidateForUser(member.userId);
    }
    return member;
  }

  protected override normalizeData(data: unknown): Record<string, unknown> {
    const normalized = super.normalizeData(data) as Record<string, unknown>;
    const { brandIds, ...memberData } = normalized;

    if (brandIds === undefined) {
      return memberData;
    }

    if (
      !Array.isArray(brandIds) ||
      brandIds.some((brandId) => typeof brandId !== 'string')
    ) {
      throw new TypeError('brandIds must be an array of entity IDs');
    }

    return {
      ...memberData,
      brands: {
        set: [...new Set(brandIds)].map((id) => ({ id })),
      },
    };
  }

  async find(filter: Record<string, unknown>): Promise<MemberDocument[]> {
    const organizationId =
      typeof filter.organizationId === 'string' ? filter.organizationId : '';
    if (!organizationId) {
      throw new TypeError('find requires organizationId');
    }

    const members = await this.prisma.member.findMany({
      where: scopedWhere(organizationId, filter),
    });

    return members as unknown as MemberDocument[];
  }

  async findActiveForUserAccess(userId: string): Promise<MemberDocument[]> {
    if (!userId) {
      throw new TypeError('findActiveForUserAccess requires userId');
    }

    // Access discovery is cross-organization by definition: it recovers the
    // caller's organizationIds from canonical users.id. Since #5981 handlers
    // run inside the request's tenant context, so the read must be explicit.
    const members = await crossOrgUnsafe(() =>
      // tenant-scope-ignore: access discovery recovers organizationIds from canonical users.id before tenant context exists
      this.prisma.member.findMany({
        where: {
          isActive: true,
          isDeleted: false,
          userId,
        },
      }),
    );

    return members as unknown as MemberDocument[];
  }

  /**
   * #5502 the caller's installed native apps in this organization, or `null`
   * when they have no live membership here. Unknown stored ids are dropped.
   */
  async findInstalledAppIds(
    organizationId: string,
    userId: string,
  ): Promise<NativeSecondaryAppId[] | null> {
    const member = await this.prisma.member.findFirst({
      orderBy: { createdAt: 'asc' },
      select: { installedAppIds: true },
      where: scopedWhere(organizationId, { userId }),
    });
    return member ? normalizeInstalledAppIds(member.installedAppIds) : null;
  }

  /**
   * Installs or uninstalls one native app for the caller's membership and
   * returns the resulting list, or `null` without a live membership. The
   * membership row is locked so concurrent changes from several tabs apply in
   * turn instead of overwriting each other. Only this member's activation
   * changes: organization access, other members and saved content are left
   * untouched.
   */
  async setAppInstalled(
    organizationId: string,
    userId: string,
    appId: NativeSecondaryAppId,
    isInstalled: boolean,
  ): Promise<NativeSecondaryAppId[] | null> {
    return this.prisma.$transaction(async (tx) => {
      const [locked] = await tx.$queryRaw<{ id: string }[]>(
        Prisma.sql`SELECT "id" FROM "members" WHERE "organizationId" = ${organizationId} AND "userId" = ${userId} AND "isDeleted" = false ORDER BY "createdAt" ASC LIMIT 1 FOR UPDATE`,
      );
      if (!locked) {
        return null;
      }

      const member = await tx.member.findFirst({
        select: { installedAppIds: true },
        where: scopedWhere(organizationId, { id: locked.id }),
      });
      if (!member) {
        return null;
      }

      const installedAppIds = normalizeInstalledAppIds(member.installedAppIds);
      const isCurrentlyInstalled = installedAppIds.includes(appId);
      if (isCurrentlyInstalled === isInstalled) {
        return installedAppIds;
      }

      const nextAppIds = isInstalled
        ? [...installedAppIds, appId]
        : installedAppIds.filter((installedAppId) => installedAppId !== appId);
      await tx.member.update({
        data: { installedAppIds: nextAppIds },
        where: scopedWhere(organizationId, { id: locked.id }),
      });
      return nextAppIds;
    });
  }

  count(filter: Prisma.MemberWhereInput): Promise<number> {
    return this.delegate.count({ where: filter });
  }

  async listTeamMentions(
    organizationId: string,
    limit: number = DEFAULT_TEAM_MENTION_LIMIT,
  ): Promise<AgentTeamMentionItem[]> {
    if (!organizationId) {
      return [];
    }

    const safeLimit = Math.min(Math.max(limit, 1), MAX_TEAM_MENTION_LIMIT);
    const members = (await this.prisma.member.findMany({
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      select: {
        id: true,
        role: {
          select: {
            key: true,
            label: true,
          },
        },
        roleKey: true,
        user: {
          select: {
            avatar: true,
            email: true,
            firstName: true,
            handle: true,
            id: true,
            isDeleted: true,
            lastName: true,
            name: true,
            platformRole: true,
          },
        },
      },
      take: safeLimit,
      where: scopedWhere(organizationId, { isActive: true }),
    })) as unknown as TeamMentionRecord[];

    return members
      .filter((member) => !member.user.isDeleted)
      .map((member) => ({
        avatar: member.user.avatar ?? undefined,
        displayName: this.formatTeamMentionDisplayName(member),
        id: member.id,
        isAgent: this.isAgentMember(member),
        role: member.role.label || member.roleKey || 'member',
      }));
  }

  private formatTeamMentionDisplayName(member: TeamMentionRecord): string {
    const fullName = [member.user.firstName, member.user.lastName]
      .filter(Boolean)
      .join(' ')
      .trim();

    return (
      member.user.name ||
      fullName ||
      member.user.handle ||
      member.user.email ||
      `Team member ${member.id.slice(0, 8)}`
    );
  }

  private isAgentMember(member: TeamMentionRecord): boolean {
    return [
      member.roleKey,
      member.role.key,
      member.role.label,
      member.user.platformRole,
    ].some((value) =>
      String(value ?? '')
        .toLowerCase()
        .includes('agent'),
    );
  }

  /**
   * Set the member's current brand. currentBrandId is a required per-member
   * invariant (#5219) — there is no "clear" case. Callers must already have
   * resolved brandId to a non-deleted brand of this organizationId (e.g. via
   * BrandsService.selectBrandForUser, or a brand this method's caller just
   * created in the same organization).
   */
  async setCurrentBrand(
    filter: Record<string, unknown>,
    brandId: string,
  ): Promise<void> {
    if (!brandId) {
      throw new TypeError('setCurrentBrand requires a brandId');
    }

    const where = filter as {
      organizationId?: unknown;
      userId?: unknown;
    };

    // Refuse to run without an org + user scope: Prisma omits `undefined` where
    // clauses, so a missing scope would silently widen the updateMany to every
    // member row across all tenants. Skip (no-op) instead.
    const organizationId =
      typeof where.organizationId === 'string'
        ? where.organizationId
        : undefined;
    const userId = typeof where.userId === 'string' ? where.userId : undefined;

    if (!organizationId || !userId) {
      this.logger.warn(
        'setCurrentBrand skipped: filter missing organizationId/userId scope',
        {
          filter,
          operation: 'setCurrentBrand',
          service: this.constructorName,
        },
      );
      return;
    }

    await this.prisma.member.updateMany({
      where: scopedWhere(organizationId, { userId }),
      data: { currentBrandId: brandId },
    });
  }
}
