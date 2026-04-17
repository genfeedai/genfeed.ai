import { CreateMetadataDto } from '@api/collections/metadata/dto/create-metadata.dto';
import { UpdateMetadataDto } from '@api/collections/metadata/dto/update-metadata.dto';
import type { MetadataDocument } from '@api/collections/metadata/schemas/metadata.schema';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';

@Injectable()
export class MetadataService extends BaseService<
  MetadataDocument,
  CreateMetadataDto,
  UpdateMetadataDto
> {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    public readonly prisma: PrismaService,
    public readonly logger: LoggerService,
  ) {
    // TODO: remove model arg after BaseService Prisma migration
    super(undefined as never, logger);
  }

  async remove(ingredientId: string): Promise<MetadataDocument | null> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    try {
      if (this.logger) {
        this.logger.debug(`${url} started`, { ingredientId });
      }

      const metadata = await this.prisma.metadata.findFirst({
        where: { ingredientId, isDeleted: false },
      });

      if (metadata) {
        await this.prisma.metadata.update({
          where: { id: metadata.id },
          data: { isDeleted: true },
        });
      }

      if (this.logger) {
        this.logger.debug(`${url} completed`, { ingredientId });
      }

      return null;
    } catch (error: unknown) {
      if (this.logger) {
        this.logger.error(`${url} failed`, { error, ingredientId });
      }

      throw error;
    }
  }
}
