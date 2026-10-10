import { PlatformSettingsService } from '@api/collections/platform-settings/services/platform-settings.service';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import type { IPlatformFlags } from '@genfeedai/contracts/interfaces';
import { Public } from '@libs/decorators/public.decorator';
import {
  Controller,
  Get,
  Header,
  ServiceUnavailableException,
} from '@nestjs/common';

@AutoSwagger()
@Public()
@Controller('public/platform-flags')
export class PublicPlatformFlagsController {
  constructor(
    private readonly platformSettingsService: PlatformSettingsService,
  ) {}

  /**
   * Which modules and features are on (#5468) — booleans only, read by the
   * app shell and by pages that render before sign-in (login, desktop).
   * Admin changes reach every process within the settings cache TTL.
   */
  @Get()
  @Header('Cache-Control', 'no-store')
  async getFlags(): Promise<IPlatformFlags> {
    const { isResolved, settings } =
      await this.platformSettingsService.getFeatureSettingsState();
    if (!isResolved) {
      throw new ServiceUnavailableException(
        'Platform flags are temporarily unavailable. Try again.',
      );
    }
    return settings.flags;
  }
}
