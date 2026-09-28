import type { ModerationProviders } from '@api/services/moderation/moderation.tokens';
import { NullModerationProvider } from '@api/services/moderation/providers/null-moderation.provider';
import { OpenAiModerationProvider } from '@api/services/moderation/providers/openai-moderation.provider';
import type { ConfigService } from '@libs/config/config.service';
import type { LoggerService } from '@libs/logger/logger.service';

/**
 * Build every moderation adapter once (#4880). Which one runs is the
 * `moderation` PostHog flag, read per job (#5468). OpenAI without its key
 * stays disabled rather than failing boot, matching the self-host contract:
 * gates are skipped, never errored.
 */
export function createModerationProviders(
  configService: ConfigService,
  logger: LoggerService,
): ModerationProviders {
  const apiKey = String(configService.get('OPENAI_API_KEY') ?? '').trim();
  if (!apiKey) {
    logger.log('OPENAI_API_KEY is not set; OpenAI moderation is unavailable');
  }
  return {
    none: new NullModerationProvider(),
    openai: new OpenAiModerationProvider(apiKey || undefined),
  };
}
