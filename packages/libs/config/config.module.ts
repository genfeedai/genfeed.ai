/**
 * Config Module
 * Environment configuration management: load .env variables, validate config,
 * provide typed configuration access across the application.
 *
 * The API tier registers `ValidationConfigService` alongside its `ConfigService`;
 * everything else about the wiring is the shared `createConfigModule` factory —
 * see `packages/libs/config/create-config-module.ts`.
 *
 * The API keeps `useFactory` semantics via `isLazy` — the one documented
 * exception to the project-wide `useValue` provider rule. Its `ConfigService`
 * composes ~30 schemas, so constructing it at module-evaluation time would mean
 * no module reachable from here could be imported without a fully populated
 * environment. Runtime fail-fast behaviour is unchanged: Nest still resolves
 * this provider while compiling `AppModule`. The ten backend services keep the
 * eager default.
 */

import { ConfigService } from '@libs/config/config.service';
import { createConfigModule } from '@libs/config/create-config-module';
import { ValidationConfigService } from '@libs/config/services/validation.config';

export const ConfigModule = createConfigModule({
  configService: ConfigService,
  isLazy: true,
  providers: [ValidationConfigService],
});
