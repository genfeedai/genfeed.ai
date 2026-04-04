import {
  DynamicModule,
  ForwardReference,
  Provider,
  Type,
} from '@nestjs/common';

/**
 * ServiceModuleOptions stays local — depends on NestJS types not available in packages/interfaces.
 */
export interface ServiceModuleOptions {
  /**
   * Additional modules to import beyond ConfigModule and LoggerModule
   * Supports regular modules, dynamic modules, and forwardRef() wrapped modules
   */
  additionalImports?: Array<
    Type<unknown> | DynamicModule | Promise<DynamicModule> | ForwardReference
  >;

  /**
   * Additional providers beyond the main service
   * Supports classes and provider objects
   */
  additionalProviders?: Provider[];

  /**
   * Additional exports beyond the main service
   */
  additionalExports?: Array<Type<unknown> | string | symbol>;

  /**
   * Whether to make this a global module
   */
  isGlobal?: boolean;
}
