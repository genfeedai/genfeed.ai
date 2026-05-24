import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { BaseCRUDController } from '@api/shared/controllers/base-crud/base-crud.controller';
import { createUserScopedService } from '@api/shared/factories/service/service.factory';
import {
  BaseService,
  type PrismaFindAllInput,
} from '@api/shared/services/base/base.service';
import type { User } from '@clerk/backend';
import type { IJsonApiSerializer, PopulateOption } from '@genfeedai/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { Module, Type } from '@nestjs/common';

/**
 * Controller factory configuration
 */
export interface ControllerFactoryConfig<
  T,
  CreateDto,
  UpdateDto,
  QueryDto extends BaseQueryDto = BaseQueryDto,
> {
  /**
   * The entity name (used for error messages)
   */
  entityName: string;

  /**
   * The service class
   */
  service: Type<BaseService<T, CreateDto, UpdateDto>>;

  /**
   * The serializer instance
   */
  serializer: IJsonApiSerializer;

  /**
   * Population fields
   */
  populateFields?: (string | PopulateOption)[];

  /**
   * Whether to use optimized population (default: true)
   */
  useOptimizedPopulation?: boolean;

  /**
   * Custom routes to add to the controller
   */
  customRoutes?: Record<string, (...args: unknown[]) => unknown>;

  /**
   * Query DTO type (optional)
   */
  queryDto?: Type<QueryDto>;
}

/**
 * Factory function to create standardized CRUD controllers
 * Reduces boilerplate code for simple CRUD controllers
 */
export function createCRUDController<
  T = unknown,
  CreateDto = unknown,
  UpdateDto = unknown,
  QueryDto extends BaseQueryDto = BaseQueryDto,
>(config: ControllerFactoryConfig<T, CreateDto, UpdateDto, QueryDto>) {
  const BaseClass = BaseCRUDController;

  // Create the controller class dynamically
  class FactoryController extends BaseClass<T, CreateDto, UpdateDto, QueryDto> {
    public readonly service: BaseService<T, CreateDto, UpdateDto>;
    public readonly logger: LoggerService;

    constructor(
      service: BaseService<T, CreateDto, UpdateDto>,
      logger: LoggerService,
    ) {
      super(
        logger,
        service,
        config.serializer,
        config.entityName,
        config.populateFields || [],
      );
      this.service = service;
      this.logger = logger;
    }
  }

  // Add custom routes if provided
  if (config.customRoutes) {
    Object.entries(config.customRoutes).forEach(([name, method]) => {
      (FactoryController.prototype as unknown as Record<string, unknown>)[
        name
      ] = method;
    });
  }

  // Set a descriptive name for debugging
  Object.defineProperty(FactoryController, 'name', {
    value: `${config.entityName}Controller`,
  });

  return FactoryController;
}

/**
 * Extended factory for controllers with custom business logic
 */
export interface ExtendedControllerConfig<
  T,
  CreateDto,
  UpdateDto,
  QueryDto extends BaseQueryDto = BaseQueryDto,
> extends ControllerFactoryConfig<T, CreateDto, UpdateDto, QueryDto> {
  /**
   * Override the findAll query builder
   */
  buildFindAllQuery?: (user: User, query: QueryDto) => PrismaFindAllInput;

  /**
   * Override the entity access check
   */
  canUserModifyEntity?: (user: User, entity: T) => boolean;

  /**
   * Override DTO enrichment
   */
  enrichCreateDto?: (dto: CreateDto, user: User) => CreateDto;
  enrichUpdateDto?: (dto: UpdateDto, user: User) => UpdateDto;
}

/**
 * Factory for controllers with extended functionality
 */
export function createExtendedController<
  T = unknown,
  CreateDto = unknown,
  UpdateDto = unknown,
  QueryDto extends BaseQueryDto = BaseQueryDto,
>(config: ExtendedControllerConfig<T, CreateDto, UpdateDto, QueryDto>) {
  const BaseClass = BaseCRUDController;

  class ExtendedFactoryController extends BaseClass<
    T,
    CreateDto,
    UpdateDto,
    QueryDto
  > {
    public readonly service: BaseService<T, CreateDto, UpdateDto>;
    public readonly logger: LoggerService;

    constructor(
      service: BaseService<T, CreateDto, UpdateDto>,
      logger: LoggerService,
    ) {
      super(
        logger,
        service,
        config.serializer,
        config.entityName,
        config.populateFields || [],
      );
      this.service = service;
      this.logger = logger;
    }

    public buildFindAllQuery(user: User, query: QueryDto): PrismaFindAllInput {
      if (config.buildFindAllQuery) {
        return config.buildFindAllQuery(user, query);
      }
      return super.buildFindAllQuery(user, query);
    }

    public canUserModifyEntity(user: User, entity: T): boolean {
      if (config.canUserModifyEntity) {
        return config.canUserModifyEntity(user, entity);
      }
      return super.canUserModifyEntity(user, entity);
    }

    public enrichCreateDto(createDto: CreateDto, user: User): CreateDto {
      if (config.enrichCreateDto) {
        return config.enrichCreateDto(createDto, user);
      }
      return super.enrichCreateDto(createDto, user);
    }

    // @ts-expect-error TS2416
    public enrichUpdateDto(
      updateDto: UpdateDto,
      user: User,
    ): Promise<UpdateDto> | UpdateDto {
      if (config.enrichUpdateDto) {
        return config.enrichUpdateDto(updateDto, user);
      }
      return super.enrichUpdateDto(updateDto, user);
    }
  }

  // Add custom routes if provided
  if (config.customRoutes) {
    Object.entries(config.customRoutes).forEach(([name, method]) => {
      (
        ExtendedFactoryController.prototype as unknown as Record<
          string,
          unknown
        >
      )[name] = method;
    });
  }

  // Set a descriptive name for debugging
  Object.defineProperty(ExtendedFactoryController, 'name', {
    value: `Extended${config.entityName}Controller`,
  });

  return ExtendedFactoryController;
}

/**
 * Module factory for creating complete module with controller and service
 */
export interface ModuleFactoryConfig<T, CreateDto, UpdateDto> {
  name: string;
  modelName?: string;
  schemaName?: string;
  entity: Type<T>;
  createDto: Type<CreateDto>;
  updateDto: Type<UpdateDto>;
  serializer: IJsonApiSerializer;
  populateFields?: (string | PopulateOption)[];
  imports?: Type<unknown>[];
  exports?: Type<unknown>[];
}

/**
 * Create a complete module with controller, service, and schema
 */
export function createCRUDModule<T, CreateDto, UpdateDto>(
  config: ModuleFactoryConfig<T, CreateDto, UpdateDto>,
): {
  module: Type<unknown>;
  service: Type<BaseService<T, CreateDto, UpdateDto>>;
  controller: Type<BaseCRUDController<T, CreateDto, UpdateDto>>;
} {
  const modelName = config.modelName ?? config.schemaName;

  if (!modelName) {
    throw new Error(
      `createCRUDModule: modelName is required for module: ${config.name}`,
    );
  }

  // Create service using factory
  const ServiceClass = createUserScopedService({
    createDto: config.createDto,
    defaultPopulate: config.populateFields?.map((field) =>
      typeof field === 'string' ? { path: field } : field,
    ),
    entity: config.entity,
    modelName,
    updateDto: config.updateDto,
  });

  // Create controller using factory
  const ControllerClass = createCRUDController({
    entityName: config.name,
    populateFields: config.populateFields,
    serializer: config.serializer,
    service: ServiceClass,
    useOptimizedPopulation: true,
  });

  // Validate config.imports doesn't contain undefined values
  const importsArray = config.imports || [];
  const invalidImports = importsArray.filter((imp) => imp == null);
  if (invalidImports.length > 0) {
    throw new Error(
      `createCRUDModule: config.imports contains ${invalidImports.length} undefined/null value(s) for module: ${config.name}`,
    );
  }

  @Module({
    controllers: [ControllerClass],
    exports: [ServiceClass, ...(config.exports || [])],
    imports: [...importsArray],
    providers: [ServiceClass],
  })
  class FactoryModule {}

  // Set a descriptive name
  Object.defineProperty(FactoryModule, 'name', {
    value: `${config.name}Module`,
  });

  return {
    controller: ControllerClass as unknown as Type<
      BaseCRUDController<T, CreateDto, UpdateDto>
    >,
    module: FactoryModule,
    service: ServiceClass as unknown as Type<
      BaseService<T, CreateDto, UpdateDto>
    >,
  };
}
