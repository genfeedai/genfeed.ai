import { PLATFORM_SETTING_KEY } from '@genfeedai/constants';
import { setRuntimeMarginMultiplier } from '@genfeedai/helpers';
import { LoggerService } from '@libs/logger/logger.service';
import { PrismaService } from '@libs/prisma/prisma.service';
import { Injectable } from '@nestjs/common';

/**
 * Hydrates the process-scoped pricing runtime from the operator-configured
 * `PlatformSetting.marginMultiplier` so every `applyMargin` call during a model
 * discovery run bakes the configured margin into customer-facing model costs.
 */
@Injectable()
export class PlatformMarginService {
  private readonly context = PlatformMarginService.name;

  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
  ) {}

  /**
   * Read the singleton margin multiplier and apply it to the pricing runtime.
   * Non-fatal on failure — pricing falls back to the 1.0 default.
   *
   * @returns The multiplier that was applied.
   */
  async hydrate(): Promise<number> {
    try {
      const row = await this.prisma.platformSetting.findUnique({
        where: { key: PLATFORM_SETTING_KEY },
      });
      const multiplier = row?.marginMultiplier ?? 1;
      setRuntimeMarginMultiplier(multiplier);
      this.logger.log(`${this.context} hydrated margin multiplier`, {
        multiplier,
      });
      return multiplier;
    } catch (error) {
      this.logger.warn(
        `${this.context} failed to hydrate margin multiplier; using default 1.0`,
        error,
      );
      setRuntimeMarginMultiplier(1);
      return 1;
    }
  }
}
