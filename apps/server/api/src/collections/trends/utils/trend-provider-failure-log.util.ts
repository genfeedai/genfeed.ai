import { isApifyActorDeferral } from '@api/services/integrations/apify/utils/apify-actor-availability.util';
import type { LoggerService } from '@libs/logger/logger.service';

/**
 * Log a failed trend provider fetch. An actor that is held off or did not
 * finish in time is Apify being slow: the refresh keeps the last good data and
 * records the failed attempt, so it is a warning, not an error-level report.
 */
export function logTrendProviderFailure(
  logger: LoggerService,
  message: string,
  error: unknown,
): void {
  if (isApifyActorDeferral(error)) {
    logger.warn(`${message}: ${(error as Error).message}`);
    return;
  }
  logger.error(message, error);
}
