import { Global, Module, type Type } from '@nestjs/common';

/**
 * Options for {@link createConfigModule}.
 */
export interface CreateConfigModuleOptions {
  /**
   * The service's concrete `ConfigService` class. Instantiated eagerly and
   * registered with `useValue` (never `useFactory`) so config validation fails
   * at import time rather than on first injection — the project-wide provider
   * rule.
   */
  configService: Type<object>;
  /**
   * Extra class providers registered *and* exported alongside `ConfigService`
   * (e.g. the API's `ValidationConfigService`). Nest instantiates these through
   * DI, so their constructor params must be value imports — see
   * `.agents/memory/rules/nestjs_value_imports_for_di.md`.
   */
  providers?: Type<object>[];
}

/**
 * Build the `@Global()` config module every backend service used to hand-roll.
 *
 * Each of the ten service workspaces shipped a byte-identical module whose only
 * difference was the import path of its own `ConfigService`; this factory is
 * that module, parameterised.
 *
 * ```ts
 * import { ConfigService } from '@images/config/config.service';
 * import { createConfigModule } from '@libs/config/create-config-module';
 *
 * export const ConfigModule = createConfigModule({ configService: ConfigService });
 * ```
 *
 * The returned value is an already-decorated class, so `@Module`/`@Global`
 * metadata sits directly on the exported symbol — importing modules resolve it
 * exactly as they did the hand-written version.
 */
export function createConfigModule(
  options: CreateConfigModuleOptions,
): Type<object> {
  const { configService, providers = [] } = options;

  @Global()
  @Module({
    exports: [configService, ...providers],
    providers: [
      ...providers,
      {
        provide: configService,
        useValue: new configService(),
      },
    ],
  })
  class ConfigModule {}

  return ConfigModule;
}
