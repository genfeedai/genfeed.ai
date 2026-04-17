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
    // TODO: remove model arg after BaseService Prisma migration
    super(undefined as never, logger);
  }

  async find(filter: Record<string, unknown>): Promise<MemberDocument[]> {
    const members = await this.prisma.member.findMany({
      where: filter as never,
    });

    return members as unknown as MemberDocument[];
  }

  async setLastUsedBrand(
    filter: Record<string, unknown>,
    brandId: string,
  ): Promise<void> {
    await this.prisma.member.updateMany({
      where: filter as never,
      data: { lastUsedBrandId: brandId },
    });
  }
}
