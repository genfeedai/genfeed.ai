import { InternalApiKeyGuard as SharedInternalApiKeyGuard } from '@libs/auth/internal-api-key.guard';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@notifications/config/config.service';

/** Thin notifications-service wiring over the shared internal bearer guard. */
@Injectable()
export class InternalApiKeyGuard extends SharedInternalApiKeyGuard {
  constructor(configService: ConfigService, logger: LoggerService) {
    super({
      devBypassLogMessage:
        'InternalApiKeyGuard GENFEEDAI_API_KEY not configured - allowing request in development',
      getConfiguredKey: () =>
        configService.get('GENFEEDAI_API_KEY')?.trim() ?? '',
      isDevelopment: () => configService.isDevelopment,
      logger,
    });
  }
}
