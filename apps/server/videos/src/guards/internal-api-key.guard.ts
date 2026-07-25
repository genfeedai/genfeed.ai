import { InternalApiKeyGuard as SharedInternalApiKeyGuard } from '@libs/auth/internal-api-key.guard';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@videos/config/config.service';

/**
 * Thin wiring over the shared @libs/auth guard core — see
 * packages/libs/auth/internal-api-key.guard.ts for the behavior contract.
 */
@Injectable()
export class InternalApiKeyGuard extends SharedInternalApiKeyGuard {
  constructor(configService: ConfigService, logger: LoggerService) {
    super({
      devBypassLogMessage:
        'InternalApiKeyGuard GENFEEDAI_API_KEY not configured - allowing request in development',
      getConfiguredKey: () => configService.API_KEY,
      isDevelopment: () => configService.isDevelopment,
      logger,
    });
  }
}
