import { ConfigModule } from '@api/config/config.module';
import type { ServiceModuleOptions } from '@api/shared/interfaces/shared/shared.interfaces';
import { LoggerModule } from '@libs/logger/logger.module';
import {
  DynamicModule,
  ForwardReference,
  Provider,
  Type,
} from '@nestjs/common';

/**
 * Service Module Factory
 *
 * Creates standardized NestJS modules for services with consistent imports/exports.
 * See .agents/SYSTEM/ARCHITECTURE.md for microservices architecture details.
 */
export function createServiceModule(
  ServiceClass: Type<unknown>,
  options: ServiceModuleOptions = {},
): DynamicModule {
  // Validate ServiceClass is not undefined
  if (ServiceClass == null) {
    throw new Error(
      `createServiceModule called with undefined or null ServiceClass. This usually means the service import is missing or incorrect.`,
    );
  }

  // Validate ConfigModule and LoggerModule are defined
  if (ConfigModule == null) {
    throw new Error(
      `createServiceModule: ConfigModule is undefined. Check if @api/config/config.module is properly exported.`,
    );
  }

  if (LoggerModule == null) {
    throw new Error(
      `createServiceModule: LoggerModule is undefined. Check if @libs/logger/logger.module is properly exported.`,
    );
  }

  const {
    additionalImports = [],
    additionalProviders = [],
    additionalExports = [],
    isGlobal = false,
  } = options;

  // Validate additionalImports don't contain undefined values
  const invalidImports = additionalImports.filter((imp) => imp == null);
  if (invalidImports.length > 0) {
    throw new Error(
      `createServiceModule: additionalImports contains ${invalidImports.length} undefined/null value(s) for ServiceClass: ${ServiceClass?.name || 'unknown'}`,
    );
  }

  // Validate additionalProviders don't contain undefined values
  const invalidProviders = additionalProviders.filter((prov) => prov == null);
  if (invalidProviders.length > 0) {
    throw new Error(
      `createServiceModule: additionalProviders contains ${invalidProviders.length} undefined/null value(s) for ServiceClass: ${ServiceClass?.name || 'unknown'}`,
    );
  }

  // Build the imports array
  const importsArray = [
    ConfigModule,
    LoggerModule,
    ...additionalImports,
  ] as Array<
    Type<unknown> | DynamicModule | Promise<DynamicModule> | ForwardReference
  >;

  // Final validation: ensure no undefined values in the final imports array
  const finalInvalidImports = importsArray.filter((imp) => imp == null);
  if (finalInvalidImports.length > 0) {
    throw new Error(
      `createServiceModule: Final imports array contains ${finalInvalidImports.length} undefined/null value(s) for ServiceClass: ${ServiceClass?.name || 'unknown'}. This suggests ConfigModule or LoggerModule is undefined.`,
    );
  }

  // Build providers and exports arrays
  const providersArray = [ServiceClass, ...additionalProviders] as Provider[];
  const exportsArray = [ServiceClass, ...additionalExports];

  // Validate providers array
  const invalidProvidersInArray = providersArray.filter((prov) => prov == null);
  if (invalidProvidersInArray.length > 0) {
    throw new Error(
      `createServiceModule: Final providers array contains ${invalidProvidersInArray.length} undefined/null value(s) for ServiceClass: ${ServiceClass?.name || 'unknown'}`,
    );
  }

  // Validate exports array
  const invalidExports = exportsArray.filter((exp) => exp == null);
  if (invalidExports.length > 0) {
    throw new Error(
      `createServiceModule: Final exports array contains ${invalidExports.length} undefined/null value(s) for ServiceClass: ${ServiceClass?.name || 'unknown'}`,
    );
  }

  return {
    exports: exportsArray,
    global: isGlobal,
    imports: importsArray,
    module: class {},
    providers: providersArray,
  };
}

export function createCachedServiceModule(
  ServiceClass: Type<unknown>,
  options: ServiceModuleOptions = {},
): DynamicModule {
  const CacheModule = require('@nestjs/cache-manager').CacheModule;

  if (!CacheModule) {
    throw new Error(
      `createCachedServiceModule: CacheModule from @nestjs/cache-manager is undefined. Check if the package is installed.`,
    );
  }

  const cacheModuleDynamic = CacheModule.register();
  if (!cacheModuleDynamic) {
    throw new Error(
      `createCachedServiceModule: CacheModule.register() returned undefined for ServiceClass: ${ServiceClass?.name || 'unknown'}`,
    );
  }

  return createServiceModule(ServiceClass, {
    ...options,
    additionalImports: [
      cacheModuleDynamic,
      ...(options.additionalImports || []),
    ],
  });
}
