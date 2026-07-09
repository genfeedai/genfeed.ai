import { CreateMemberDto } from '@api/collections/members/dto/create-member.dto';
import { UpdateMemberDto } from '@api/collections/members/dto/update-member.dto';
import type { MemberDocument } from '@api/collections/members/schemas/member.schema';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import type { AgentTeamMentionItem } from '@genfeedai/interfaces';
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

  async find(filter: Record<string, unknown>): Promise<MemberDocument[]> {
    const where = this.processSearchParams(filter);

    const members = await this.prisma.member.findMany({
      where: where as never,
    });

    return members as unknown as MemberDocument[];
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
      where: {
        isActive: true,
        isDeleted: false,
        organizationId,
      },
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
    // Map legacy relation aliases (`organization`/`user`) to their scalar FKs
    // before hitting Prisma — `updateMany` validates `where` against the scalar
    // columns, so a raw `{ organization: id }` throws "Unknown argument".
    const where = this.processSearchParams(filter) as {
      organizationId?: unknown;
      userId?: unknown;
    };

    // Refuse to run without an org + user scope: Prisma omits `undefined` where
    // clauses, so a missing scope would silently widen the updateMany to every
    // member row across all tenants. Skip (no-op) instead.
    if (!where.organizationId || !where.userId) {
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
      where: where as never,
      data: { lastUsedBrandId: brandId },
    });
  }
}
