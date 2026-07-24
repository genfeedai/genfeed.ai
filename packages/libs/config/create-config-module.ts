import { Global, Module, type Type } from '@nestjs/common';

/**
 * Options for {@link createConfigModule}.
 */
export interface CreateConfigModuleOptions {
  /**
   * The service's concrete `ConfigService` class. Instantiated eagerly and
   * registered with `useValue` — the project-wide provider rule — so config
   * validation fails at import time rather than on first injection. All ten
   * backend services use this default; see {@link CreateConfigModuleOptions.isLazy}
   * for the single documented exception.
   */
  configService: Type<object>;
  /**
   * Defer construction to Nest's DI resolution (`useFactory`) instead of
   * module-evaluation time (`useValue`). Defaults to `false`.
   *
   * Only the API tier sets this. Its `ConfigService` composes ~30 schemas —
   * including `baseSchema` (`PORT` required) and `postgresSchema`
   * (`DATABASE_URL` required) — so eager construction would make *importing*
   * any module that reaches `@libs/config/config.module` demand a fully
   * populated environment. That is a real cost: 86 API unit specs import
   * collection modules without ever booting the app.
   *
   * Deferring changes nothing at runtime. Nest resolves every provider while
   * compiling `AppModule` in `main.ts`, so a misconfigured deployment still
   * dies at startup rather than on first request — identical fail-fast
   * behaviour, minus the import-time side effect.
   */
  isLazy?: boolean;
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
  const { configService, isLazy = false, providers = [] } = options;

  @Global()
  @Module({
    exports: [configService, ...providers],
    providers: [
      ...providers,
      isLazy
        ? { provide: configService, useFactory: () => new configService() }
        : { provide: configService, useValue: new configService() },
    ],
  })
  class ConfigModule {}

  return ConfigModule;
}
