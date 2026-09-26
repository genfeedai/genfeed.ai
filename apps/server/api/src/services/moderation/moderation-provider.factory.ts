import { resolveModerationSettings } from '@api/services/moderation/moderation.settings';
import { NullModerationProvider } from '@api/services/moderation/providers/null-moderation.provider';
import { OpenAiModerationProvider } from '@api/services/moderation/providers/openai-moderation.provider';
import type { IModerationProvider } from '@genfeedai/contracts/interfaces';
import type { ConfigService } from '@libs/config/config.service';
import type { LoggerService } from '@libs/logger/logger.service';

/**
 * Bind the configured moderation adapter (#4880). A selected provider without
 * its key degrades to "no moderation" with a warning rather than failing
 * boot, matching the self-host contract: gates are skipped, never errored.
 */
export function createModerationProvider(
  configService: ConfigService,
  logger: LoggerService,
): IModerationProvider {
  const settings = resolveModerationSettings(configService);
  if (settings.unknownThresholdKeys.length > 0) {
    logger.warn('MODERATION_THRESHOLDS names unknown categories; ignored', {
      unknownKeys: settings.unknownThresholdKeys,
    });
  }
  if (settings.provider !== 'openai') {
    return new NullModerationProvider();
  }
  const apiKey = String(configService.get('OPENAI_API_KEY') ?? '').trim();
  if (!apiKey) {
    logger.warn(
      'MODERATION_PROVIDER=openai without OPENAI_API_KEY; moderation is off',
    );
  }
  return new OpenAiModerationProvider(apiKey || undefined);
}
