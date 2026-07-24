/**
 * Config Module
 * Environment configuration management: load .env variables, validate config,
 * provide typed configuration access across the application.
 *
 * The API tier registers `ValidationConfigService` alongside its `ConfigService`;
 * everything else about the wiring is the shared `createConfigModule` factory —
 * see `packages/libs/config/create-config-module.ts`.
 *
 * Note the provider strategy changed with this factory: `ConfigService` is now
 * registered with `useValue: new ConfigService()` instead of the previous
 * `useFactory: () => new ConfigService()`. That matches the project-wide
 * provider rule and makes config validation fail at module import rather than
 * on first injection.
 */

import { ConfigService } from '@libs/config/config.service';
import { createConfigModule } from '@libs/config/create-config-module';
import { ValidationConfigService } from '@libs/config/services/validation.config';

export const ConfigModule = createConfigModule({
  configService: ConfigService,
  providers: [ValidationConfigService],
});
