import { PLATFORM_SETTING_KEY } from '@genfeedai/contracts/constants';
import {
  DEFAULT_GENERATION_MARGIN_MULTIPLIER,
  setRuntimeMarginMultiplier,
} from '@genfeedai/pricing';
import { LoggerService } from '@libs/logger/logger.service';
import { PrismaService } from '@libs/prisma/prisma.service';
import { Injectable } from '@nestjs/common';

/**
 * Hydrates the process-scoped **generation** pricing runtime from the
 * operator-configured `PlatformSetting.marginMultiplierGeneration` so every
 * `applyMargin` call during a model discovery run bakes the configured margin
 * into customer-facing model costs. Workers never bill agent chat, so this
 * service does not touch `PlatformSetting.marginMultiplierAgentChat` — see
 * `PlatformSettingsService.onModuleInit` in the API for that hydration.
 */
@Injectable()
export class PlatformMarginService {
  private readonly context = PlatformMarginService.name;

  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
  ) {}

  /**
   * Read the singleton generation margin multiplier and apply it to the
   * pricing runtime. Non-fatal on failure — pricing falls back to the 3.33
   * default.
   *
   * @returns The multiplier that was applied.
   */
  async hydrate(): Promise<number> {
    try {
      const row = await this.prisma.platformSetting.findUnique({
        where: { key: PLATFORM_SETTING_KEY },
      });
      const multiplier =
        row?.marginMultiplierGeneration ?? DEFAULT_GENERATION_MARGIN_MULTIPLIER;
      setRuntimeMarginMultiplier(multiplier);
      this.logger.log(`${this.context} hydrated margin multiplier`, {
        multiplier,
      });
      return multiplier;
    } catch (error) {
      this.logger.warn(
        `${this.context} failed to hydrate margin multiplier; using default ${DEFAULT_GENERATION_MARGIN_MULTIPLIER}`,
        error,
      );
      setRuntimeMarginMultiplier(DEFAULT_GENERATION_MARGIN_MULTIPLIER);
      return DEFAULT_GENERATION_MARGIN_MULTIPLIER;
    }
  }
}
