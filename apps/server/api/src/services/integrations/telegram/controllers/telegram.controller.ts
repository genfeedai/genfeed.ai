import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import {
  type TelegramAuthData,
  TelegramService,
} from '@api/services/integrations/telegram/services/telegram.service';
import {
  Body,
  Controller,
  HttpException,
  HttpStatus,
  Post,
} from '@nestjs/common';

@Controller('services/telegram')
export class TelegramController {
  constructor(
    private readonly telegramService: TelegramService,
    private readonly brandsService: BrandsService,
  ) {}

  /**
   * Verify Telegram authentication and link account
   *
   * POST /services/telegram/verify
   */
  @Post('verify')
  async verify(
    @CurrentUser() user: AuthenticatedUser,
    @Body('brandId') brandId: string,
    @Body('authData') authData: TelegramAuthData,
  ) {
    const organizationId = user.organizationId;
    const brand = await this.brandsService.findOne({
      id: brandId,
      organizationId,
    });

    if (!brand) {
      throw new HttpException(
        {
          detail: 'You do not have access to this brand',
          title: 'Invalid payload',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    return this.telegramService.verifyAndSaveAuth(
      organizationId,
      brandId,
      user.userId ?? user.id,
      authData,
    );
  }
}
