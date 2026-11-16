import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import {
  returnBadRequest,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { TelegramGroupLinkService } from '@api/services/integrations/telegram/services/telegram-group-link.service';
import { CredentialOAuthSerializer } from '@genfeedai/serializers';
import { Body, Controller, Post, Req } from '@nestjs/common';
import type { Request } from 'express';

/**
 * Connect a Telegram group as a publishing account of a brand. The user opens
 * the returned add-bot link, picks a group on Telegram's own screen and the
 * Genfeed bot links the group to the brand; nothing is pasted into Genfeed.
 */
@AutoSwagger()
@Controller('services/telegram')
export class TelegramGroupConnectController {
  constructor(
    private readonly brandsService: BrandsService,
    private readonly groupLinkService: TelegramGroupLinkService,
  ) {}

  /**
   * POST /services/telegram/connect
   */
  @Post('connect')
  async connect(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() body: { brandId: string },
  ) {
    if (!body.brandId) {
      return returnBadRequest({
        detail: 'Brand ID is required',
        title: 'Invalid payload',
      });
    }

    const brand = await this.brandsService.findOne({
      id: body.brandId,
      organizationId: user.organizationId,
    });

    if (!brand) {
      return returnBadRequest({
        detail: 'You do not have access to this brand',
        title: 'Invalid payload',
      });
    }

    const { url } = await this.groupLinkService.createLink({
      brandId: brand.id,
      organizationId: brand.organizationId,
      userId: user.userId ?? user.id,
    });

    return serializeSingle(request, CredentialOAuthSerializer, { url });
  }
}
