import { createConfigModule } from '@libs/config/create-config-module';
import { ConfigService } from '@notifications/config/config.service';

/**
 * Global config module for the Notifications service.
 *
 * Wiring lives in the shared `createConfigModule` factory — see
 * `packages/libs/config/create-config-module.ts`.
 *
 * This module used to also register a service-local `ValidationConfigService`
 * copy. Nothing in this service ever injected it, and the canonical
 * implementation lives in `@libs/config/services/validation.config` (used by
 * the API), so the copy was deleted rather than re-exported.
 */
export const ConfigModule = createConfigModule({
  configService: ConfigService,
});
