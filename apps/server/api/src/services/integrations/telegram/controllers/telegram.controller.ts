import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { getPublicMetadata } from '@api/helpers/utils/clerk/clerk.util';
import {
  type TelegramAuthData,
  TelegramService,
} from '@api/services/integrations/telegram/services/telegram.service';
import { Body, Controller, Post } from '@nestjs/common';

@Controller('services/telegram')
export class TelegramController {
  constructor(private readonly telegramService: TelegramService) {}

  /**
   * Verify Telegram authentication and link account
   *
   * POST /services/telegram/verify
   */
  @Post('verify')
  verify(
    @CurrentUser() user: Record<string, unknown>,
    @Body('organizationId') organizationId: string,
    @Body('brandId') brandId: string,
    @Body('authData') authData: TelegramAuthData,
  ) {
    const publicMetadata = getPublicMetadata(user as never);

    return this.telegramService.verifyAndSaveAuth(
      organizationId,
      brandId,
      publicMetadata.user,
      authData,
    );
  }

  /**
   * Disconnect Telegram account
   *
   * POST /services/telegram/disconnect
   */
  @Post('disconnect')
  disconnect(
    @CurrentUser() _user: Record<string, unknown>,
    @Body('organizationId') organizationId: string,
    @Body('brandId') brandId: string,
  ) {
    return this.telegramService.disconnect(organizationId, brandId);
  }
}
