import { ConfigService } from '@files/config/config.service';
import { createConfigModule } from '@libs/config/create-config-module';

/**
 * Global config module for the Files service.
 *
 * Wiring lives in the shared `createConfigModule` factory — see
 * `packages/libs/config/create-config-module.ts`.
 */
export const ConfigModule = createConfigModule({
  configService: ConfigService,
});
