import { CreateMemberDto } from '@api/collections/members/dto/create-member.dto';
import { UpdateMemberDto } from '@api/collections/members/dto/update-member.dto';
import type { MemberDocument } from '@api/collections/members/schemas/member.schema';
import { scopedWhere } from '@api/index';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import type { AgentTeamMentionItem } from '@genfeedai/contracts/interfaces';
import type { Prisma } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
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
  ) {
    super(prisma, 'member', logger);
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

    // tenant-scope-ignore: access discovery recovers organizationIds from canonical users.id before tenant context exists
    const members = await this.prisma.member.findMany({
      where: {
        isActive: true,
        isDeleted: false,
        userId,
      },
    });

    return members as unknown as MemberDocument[];
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

  async setLastUsedBrand(
    filter: Record<string, unknown>,
    brandId: string | null,
  ): Promise<void> {
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
        'setLastUsedBrand skipped: filter missing organizationId/userId scope',
        {
          filter,
          operation: 'setLastUsedBrand',
          service: this.constructorName,
        },
      );
      return;
    }

    await this.prisma.member.updateMany({
      where: scopedWhere(organizationId, { userId }),
      data: { lastUsedBrandId: brandId },
    });
  }
}
