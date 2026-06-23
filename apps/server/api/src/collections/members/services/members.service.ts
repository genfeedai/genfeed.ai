import { CreateMemberDto } from '@api/collections/members/dto/create-member.dto';
import { UpdateMemberDto } from '@api/collections/members/dto/update-member.dto';
import type { MemberDocument } from '@api/collections/members/schemas/member.schema';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

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
