import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import type { PopulateOption } from '@genfeedai/interfaces';
import { AggregationOptions } from '@libs/interfaces/query.interface';
import { LoggerService } from '@libs/logger/logger.service';
import { Type } from '@nestjs/common';

/**
 * Service factory configuration
 */
export interface ServiceFactoryConfig<TEntity, TCreateDto, TUpdateDto> {
  /**
   * The entity class
   */
  entity: Type<TEntity>;

  /**
   * The Prisma model name (camelCase, e.g. 'post', 'brand', 'user')
   */
  modelName: string;

  /**
   * Create DTO class
   */
  createDto: Type<TCreateDto>;

  /**
   * Update DTO class
   */
  updateDto: Type<TUpdateDto>;

  /**
   * Default population fields (optional)
   */
  defaultPopulate?: PopulateOption[];

  /**
   * Custom methods to add to the service (optional)
   */
  customMethods?: Record<string, (...args: unknown[]) => unknown>;
}

/**
 * Factory function to create standardized services backed by Prisma.
 * Reduces boilerplate code for simple CRUD services.
 */
export function createService<TEntity, TCreateDto, TUpdateDto>(
  config: ServiceFactoryConfig<TEntity, TCreateDto, TUpdateDto>,
): Type<BaseService<TEntity, TCreateDto, TUpdateDto>> {
  class FactoryService extends BaseService<TEntity, TCreateDto, TUpdateDto> {
    constructor(
      public readonly prisma: PrismaService,
      public readonly logger: LoggerService,
    ) {
      super(prisma, config.modelName, logger);
    }

    /**
     * Override create with default population
     */
    create(
      dto: TCreateDto,
      populate: PopulateOption[] = config.defaultPopulate || [],
    ): Promise<TEntity> {
      return super.create(dto, populate);
    }

    /**
     * Override findOne with default population
     */
    findOne(
      params: Record<string, unknown>,
      populate: PopulateOption[] = config.defaultPopulate || [],
    ): Promise<TEntity | null> {
      return super.findOne(params, populate);
    }

    /**
     * Override patch with default population
     */
    patch(
      id: string,
      dto: Partial<TUpdateDto>,
      populate: PopulateOption[] = config.defaultPopulate || [],
    ): Promise<TEntity> {
      return super.patch(id, dto, populate);
    }
  }

  // Add custom methods if provided
  if (config.customMethods) {
    Object.entries(config.customMethods).forEach(([name, method]) => {
      (FactoryService.prototype as unknown as Record<string, unknown>)[name] =
        method;
    });
  }

  // Set a descriptive name for debugging
  Object.defineProperty(FactoryService, 'name', {
    value: `${config.entity.name}Service`,
  });

  return FactoryService;
}

/**
 * Extended factory for services that need user/organization filtering
 */
export interface UserScopedServiceConfig<TEntity, TCreateDto, TUpdateDto>
  extends ServiceFactoryConfig<TEntity, TCreateDto, TUpdateDto> {
  /**
   * Whether to filter by organization in addition to user
   */
  includeOrganization?: boolean;

  /**
   * Additional match conditions for queries
   */
  additionalMatchConditions?: Record<string, unknown>;
}

/**
 * Factory for user-scoped services
 */
export function createUserScopedService<TEntity, TCreateDto, TUpdateDto>(
  config: UserScopedServiceConfig<TEntity, TCreateDto, TUpdateDto>,
): Type<BaseService<TEntity, TCreateDto, TUpdateDto>> {
  const BaseFactoryService = createService<TEntity, TCreateDto, TUpdateDto>(
    config,
  );

  class UserScopedFactoryService extends BaseFactoryService {
    /**
     * Find all with user/organization filtering (paginated).
     */
    findAllForUser(
      userId: string,
      organizationId?: string,
      _pipeline: unknown[] = [],
      options: AggregationOptions = {},
    ): Promise<unknown> {
      const matchConditions: Record<string, unknown> = {
        userId,
        ...config.additionalMatchConditions,
      };

      if (config.includeOrganization && organizationId) {
        // Prisma OR: either userId OR organizationId
        delete matchConditions.userId;
        return this.delegate.findMany({
          where: {
            OR: [{ userId }, { organizationId }],
            isDeleted: false,
          },
        });
      }

      return this.findAll([], { ...options, ...matchConditions });
    }

    /**
     * Check if user can access entity
     */
    async canUserAccess(
      entityId: string,
      userId: string,
      organizationId?: string,
    ): Promise<boolean> {
      const orConditions: Record<string, unknown>[] = [{ userId }];

      if (config.includeOrganization && organizationId) {
        orConditions.push({ organizationId });
      }

      const entity = await this.delegate.findFirst({
        where: {
          id: entityId,
          OR: orConditions,
        },
        select: { id: true },
      });

      return entity !== null;
    }
  }

  return UserScopedFactoryService;
}

/**
 * Simplified factory for the most common use case.
 */
export function createSimpleService<TEntity, TCreateDto, TUpdateDto>(
  modelName: string,
  defaultPopulate: string[] = [],
): Type<BaseService<TEntity, TCreateDto, TUpdateDto>> {
  const populateOptions: PopulateOption[] = defaultPopulate.map((path) => ({
    path,
  }));

  return createService<TEntity, TCreateDto, TUpdateDto>({
    createDto: Object as unknown as Type<TCreateDto>,
    defaultPopulate: populateOptions,
    entity: Object as unknown as Type<TEntity>,
    modelName,
    updateDto: Object as unknown as Type<TUpdateDto>,
  });
}
