import { CreateMetadataDto } from '@api/collections/metadata/dto/create-metadata.dto';
import { UpdateMetadataDto } from '@api/collections/metadata/dto/update-metadata.dto';
import type { MetadataDocument } from '@api/collections/metadata/schemas/metadata.schema';
import { toMetadataCreateData } from '@api/collections/metadata/utils/metadata-create-data.util';
import { scopedWhere } from '@api/index';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  BaseService,
  type PopulateInput,
} from '@api/shared/services/base/base.service';
import { MetadataExtension } from '@genfeedai/enums';
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
    super(prisma, 'metadata', logger);
  }

  override async create(
    createDto: CreateMetadataDto,
    populate: PopulateInput = [],
  ): Promise<MetadataDocument> {
    return super.create(
      toMetadataCreateData({
        ...(createDto as unknown as Record<string, unknown>),
        extension: createDto.extension ?? MetadataExtension.JPEG,
        label: createDto.label?.trim() || 'Generated media',
      }) as unknown as CreateMetadataDto,
      populate,
    );
  }

  async removeByIngredient(
    ingredientId: string,
    organizationId: string,
  ): Promise<MetadataDocument | null> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    try {
      if (this.logger) {
        this.logger.debug(`${url} started`, { ingredientId });
      }

      const ingredient = await this.prisma.ingredient.findFirst({
        select: { metadataId: true },
        where: scopedWhere(organizationId, { id: ingredientId }),
      });

      if (ingredient?.metadataId) {
        const metadata = await this.prisma.metadata.update({
          data: { isDeleted: true },
          where: { id: ingredient.metadataId },
        });

        if (this.logger) {
          this.logger.debug(`${url} completed`, { ingredientId });
        }

        return this.normalizeDocument(metadata);
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
