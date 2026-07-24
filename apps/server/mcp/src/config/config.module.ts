import { createConfigModule } from '@libs/config/create-config-module';
import { ConfigService } from '@mcp/config/config.service';

/**
 * Global config module for the MCP service.
 *
 * Wiring lives in the shared `createConfigModule` factory — see
 * `packages/libs/config/create-config-module.ts`.
 */
export const ConfigModule = createConfigModule({
  configService: ConfigService,
});
