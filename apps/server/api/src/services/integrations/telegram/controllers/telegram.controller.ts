import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
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
    @CurrentUser() user: AuthenticatedUser,
    @Body('organizationId') organizationId: string,
    @Body('brandId') brandId: string,
    @Body('authData') authData: TelegramAuthData,
  ) {
    return this.telegramService.verifyAndSaveAuth(
      organizationId,
      brandId,
      user.userId ?? user.id,
      authData,
    );
  }
}
