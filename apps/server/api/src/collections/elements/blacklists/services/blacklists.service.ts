import { CreateElementBlacklistDto } from '@api/collections/elements/blacklists/dto/create-blacklist.dto';
import { UpdateElementBlacklistDto } from '@api/collections/elements/blacklists/dto/update-blacklist.dto';
import type { ElementBlacklistDocument } from '@api/collections/elements/blacklists/schemas/blacklist.schema';
import { scopedWhere } from '@api/index';
import { CacheService } from '@api/services/cache/cache.service';
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
    cacheService: CacheService,
  ) {
    super(prisma, 'elementBlacklist', logger, undefined, cacheService);
  }

  async delete(id: string): Promise<ElementBlacklistDocument | null> {
    const updated = await this.prisma.elementBlacklist.update({
      where: { id },
      data: { isDeleted: true },
    });

    return updated as unknown as ElementBlacklistDocument;
  }

  async deleteAll(filter: Record<string, unknown>): Promise<{ count: number }> {
    const organizationId =
      typeof filter.organizationId === 'string' ? filter.organizationId : '';
    if (!organizationId) {
      throw new TypeError('deleteAll requires organizationId');
    }

    return this.prisma.elementBlacklist.updateMany({
      where: scopedWhere(organizationId, filter),
      data: { isDeleted: true },
    });
  }
}
