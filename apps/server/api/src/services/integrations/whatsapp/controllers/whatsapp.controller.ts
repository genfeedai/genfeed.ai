import { BrandsService } from '@api/collections/brands/services/brands.service';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { getPublicMetadata } from '@api/helpers/utils/clerk/clerk.util';
import { returnBadRequest } from '@api/helpers/utils/response/response.util';
import { WhatsappService } from '@api/services/integrations/whatsapp/services/whatsapp.service';
import type { User } from '@clerk/backend';
import type {
  IWhatsappSendMessageParams,
  IWhatsappSendTemplateParams,
} from '@genfeedai/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { Types } from 'mongoose';

@AutoSwagger()
@Controller('services/whatsapp')
export class WhatsappController {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly whatsappService: WhatsappService,
    private readonly brandsService: BrandsService,
    private readonly loggerService: LoggerService,
  ) {}

  @Post('send')
  async sendMessage(
    @CurrentUser() user: User,
    @Body() body: IWhatsappSendMessageParams & { brandId: string },
  ) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(url, { to: body.to });

    const publicMetadata = getPublicMetadata(user);

    if (!body.brandId) {
      return returnBadRequest({
        detail: 'Brand ID is required',
        title: 'Invalid payload',
      });
    }

    const brand = await this.brandsService.findOne({
      _id: new Types.ObjectId(body.brandId),
      isDeleted: false,
      organization: new Types.ObjectId(publicMetadata.organization),
    });

    if (!brand) {
      return returnBadRequest({
        detail: 'You do not have access to this brand',
        title: 'Invalid payload',
      });
    }

    if (body.mediaUrl) {
      const result = await this.whatsappService.sendMediaMessage(body);
      return { data: result };
    }

    const result = await this.whatsappService.sendTextMessage(body);
    return { data: result };
  }

  @Post('template')
  async sendTemplateMessage(
    @CurrentUser() user: User,
    @Body() body: IWhatsappSendTemplateParams & { brandId: string },
  ) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(url, {
      templateSid: body.templateSid,
      to: body.to,
    });

    const publicMetadata = getPublicMetadata(user);

    if (!body.brandId) {
      return returnBadRequest({
        detail: 'Brand ID is required',
        title: 'Invalid payload',
      });
    }

    const brand = await this.brandsService.findOne({
      _id: new Types.ObjectId(body.brandId),
      isDeleted: false,
      organization: new Types.ObjectId(publicMetadata.organization),
    });

    if (!brand) {
      return returnBadRequest({
        detail: 'You do not have access to this brand',
        title: 'Invalid payload',
      });
    }

    const result = await this.whatsappService.sendTemplateMessage(body);
    return { data: result };
  }

  @Get('status/:messageSid')
  async getMessageStatus(
    @CurrentUser() user: User,
    @Param('messageSid') messageSid: string,
    @Query('brandId') brandId: string,
  ) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(url, { messageSid });

    const publicMetadata = getPublicMetadata(user);

    if (!brandId) {
      return returnBadRequest({
        detail: 'Brand ID is required',
        title: 'Invalid payload',
      });
    }

    const brand = await this.brandsService.findOne({
      _id: new Types.ObjectId(brandId),
      isDeleted: false,
      organization: new Types.ObjectId(publicMetadata.organization),
    });

    if (!brand) {
      return returnBadRequest({
        detail: 'You do not have access to this brand',
        title: 'Invalid payload',
      });
    }

    const result = await this.whatsappService.getMessageStatus(messageSid);
    return { data: result };
  }
}
