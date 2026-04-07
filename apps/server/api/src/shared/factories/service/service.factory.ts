import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { BaseService } from '@api/shared/services/base/base.service';
import { AggregatePaginateModel } from '@api/types/mongoose-aggregate-paginate-v2';
import type { PopulateOption } from '@genfeedai/interfaces';
import { AggregationOptions } from '@libs/interfaces/query.interface';
import { LoggerService } from '@libs/logger/logger.service';
import { Type } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { PipelineStage } from 'mongoose';

/**
 * Service factory configuration
 */
export interface ServiceFactoryConfig<TEntity, TCreateDto, TUpdateDto> {
  /**
   * The entity class
   */
  entity: Type<TEntity>;

  /**
   * The schema name for InjectModel
   */
  schemaName: string;

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
 * Factory function to create standardized services
 * Reduces boilerplate code for simple CRUD services
 */
export function createService<TEntity, TCreateDto, TUpdateDto>(
  config: ServiceFactoryConfig<TEntity, TCreateDto, TUpdateDto>,
): Type<BaseService<TEntity, TCreateDto, TUpdateDto>> {
  // Create the service class dynamically
  class FactoryService extends BaseService<TEntity, TCreateDto, TUpdateDto> {
    // All properties must be public for exported class types
    // (no private/protected on constructor params)
    constructor(
      @InjectModel(config.schemaName, DB_CONNECTIONS.CLOUD)
      public model: AggregatePaginateModel<TEntity>,
      public logger: LoggerService,
    ) {
      super(model, logger);
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
     * Find all with user/organization filtering
     */
    findAllForUser(
      userId: string,
      organizationId?: string,
      aggregate: PipelineStage[] = [],
      options: AggregationOptions = {},
    ): Promise<unknown> {
      const matchConditions: Record<string, unknown> = {
        user: userId,
        ...config.additionalMatchConditions,
      };

      if (config.includeOrganization && organizationId) {
        matchConditions.$or = [
          { user: userId },
          { organization: organizationId },
        ];
        delete matchConditions.user;
      }

      const pipeline: PipelineStage[] = [
        { $match: matchConditions },
        ...aggregate,
      ];

      return this.findAll(pipeline, options);
    }

    /**
     * Check if user can access entity
     */
    async canUserAccess(
      entityId: string,
      userId: string,
      organizationId?: string,
    ): Promise<boolean> {
      const orConditions: Record<string, unknown>[] = [{ user: userId }];

      if (config.includeOrganization && organizationId) {
        orConditions.push({ organization: organizationId });
      }

      const conditions: Record<string, unknown> = {
        _id: entityId,
        $or: orConditions,
      };

      const entity = await this.findOne(conditions);
      return entity !== null;
    }
  }

  return UserScopedFactoryService;
}

/**
 * Simplified factory for the most common use case
 */
export function createSimpleService<TEntity, TCreateDto, TUpdateDto>(
  entityName: string,
  defaultPopulate: string[] = [],
): Type<BaseService<TEntity, TCreateDto, TUpdateDto>> {
  // Convert string arrays into PopulateOption shape.
  const populateOptions: PopulateOption[] = defaultPopulate.map((path) => ({
    path,
  }));

  return createService<TEntity, TCreateDto, TUpdateDto>({
    createDto: Object as unknown as Type<TCreateDto>, // Will be overridden
    defaultPopulate: populateOptions,
    entity: Object as unknown as Type<TEntity>, // Will be overridden
    schemaName: entityName,
    updateDto: Object as unknown as Type<TUpdateDto>, // Will be overridden
  });
}
