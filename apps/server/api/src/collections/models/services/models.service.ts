import { CreateModelDto } from '@api/collections/models/dto/create-model.dto';
import { UpdateModelDto } from '@api/collections/models/dto/update-model.dto';
import type { ModelDocument } from '@api/collections/models/schemas/model.schema';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class ModelsService extends BaseService<
  ModelDocument,
  CreateModelDto,
  UpdateModelDto
> {
  constructor(
    public readonly prisma: PrismaService,
    public readonly logger: LoggerService,
  ) {
    // TODO: remove model arg after BaseService Prisma migration
    super(undefined as never, logger);
  }

  /**
   * Find a single model by filter.
   * Supports querying by id, key (stored in config JSON), isDeleted, isActive, organizationId.
   */
  override async findOne(
    params: Record<string, unknown>,
  ): Promise<ModelDocument | null> {
    const { key, _id, id, isDeleted, isActive, organizationId, ...rest } =
      params;

    const where: Record<string, unknown> = {};

    if (_id !== undefined) where.id = _id;
    if (id !== undefined) where.id = id;
    if (isDeleted !== undefined) where.isDeleted = isDeleted;
    if (isActive !== undefined) where.isActive = isActive;
    if (organizationId !== undefined) where.organizationId = organizationId;

    // key is stored in config JSON — filter in-memory after fetch
    // Note: for performance-critical paths, add a dedicated `key` column to the schema
    if (key !== undefined) {
      const models = await this.prisma.model.findMany({
        where: where as never,
      });

      const match = models.find((m) => {
        const config = m.config as Record<string, unknown>;
        return config?.key === key;
      });

      return (match as unknown as ModelDocument | null) ?? null;
    }

    // Handle remaining rest fields by passing to Prisma where clause
    Object.assign(where, rest);

    const model = await this.prisma.model.findFirst({
      where: where as never,
    });

    return model as unknown as ModelDocument | null;
  }

  async updateMany(
    filter: Record<string, unknown>,
    update: Record<string, unknown>,
  ): Promise<void> {
    await this.prisma.model.updateMany({
      where: filter as never,
      data: update as never,
    });
  }

  count(filter: Record<string, unknown>): Promise<number> {
    return this.prisma.model.count({ where: filter as never });
  }

  /**
   * Find all active models (for use in organization settings initialization)
   */
  async findAllActive(
    filter?: Record<string, unknown>,
  ): Promise<ModelDocument[]> {
    const models = await this.prisma.model.findMany({
      where: {
        isActive: true,
        isDeleted: false,
        ...(filter as object),
      },
    });

    return models as unknown as ModelDocument[];
  }
}
