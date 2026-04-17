import { CreateElementBlacklistDto } from '@api/collections/elements/blacklists/dto/create-blacklist.dto';
import { UpdateElementBlacklistDto } from '@api/collections/elements/blacklists/dto/update-blacklist.dto';
import type { ElementBlacklistDocument } from '@api/collections/elements/blacklists/schemas/blacklist.schema';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class ElementsBlacklistsService extends BaseService<
  ElementBlacklistDocument,
  CreateElementBlacklistDto,
  UpdateElementBlacklistDto
> {
  constructor(
    public readonly prisma: PrismaService,
    public readonly logger: LoggerService,
  ) {
    // TODO: remove model arg after BaseService Prisma migration
    super(undefined as never, logger);
  }

  async delete(id: string): Promise<ElementBlacklistDocument | null> {
    const updated = await this.prisma.elementBlacklist.update({
      where: { id },
      data: { isDeleted: true },
    });

    return updated as unknown as ElementBlacklistDocument;
  }

  async deleteAll(filter: Record<string, unknown>): Promise<{ count: number }> {
    return this.prisma.elementBlacklist.updateMany({
      where: filter as never,
      data: { isDeleted: true },
    });
  }
}
