import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { ControlNewsletterSendDto } from '@api/collections/newsletter-sends/dto/control-newsletter-send.dto';
import { CreateNewsletterSendDto } from '@api/collections/newsletter-sends/dto/create-newsletter-send.dto';
import { NewsletterSendsService } from '@api/collections/newsletter-sends/services/newsletter-sends.service';
import { OrganizationModule } from '@api/common/organization-modules/organization-module.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { TenantReadPolicy } from '@api/helpers/interceptors/tenant-context/tenant-read-policy.decorator';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import type { INewsletterEmailPreview } from '@genfeedai/contracts/interfaces';
import { NewsletterSendSerializer } from '@genfeedai/serializers';
import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseBoolPipe,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

/** Send an issue to subscribers, preview it, and control a running send (#9726). */
@AutoSwagger()
@ApiTags('Newsletters')
@Controller()
@UseGuards(RolesGuard)
@OrganizationModule('publishing')
export class NewsletterSendsController {
  constructor(private readonly sends: NewsletterSendsService) {}

  @Post('newsletters/:newsletterId/sends')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Req() request: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Param('newsletterId') newsletterId: string,
    @Body() dto: CreateNewsletterSendDto,
  ) {
    return serializeSingle(
      request,
      NewsletterSendSerializer,
      await this.sends.create(user, newsletterId, dto),
    );
  }

  @TenantReadPolicy('owner')
  @Get('newsletters/:newsletterId/email-preview')
  async preview(
    @CurrentUser() user: AuthenticatedUser,
    @Param('newsletterId') newsletterId: string,
    @Query('gated', new DefaultValuePipe(false), ParseBoolPipe)
    isGatedPreview: boolean,
  ): Promise<{ data: INewsletterEmailPreview }> {
    return {
      data: await this.sends.preview(user, newsletterId, isGatedPreview),
    };
  }

  @Post('newsletters/:newsletterId/test-send')
  @HttpCode(HttpStatus.OK)
  async sendTest(
    @CurrentUser() user: AuthenticatedUser,
    @Param('newsletterId') newsletterId: string,
  ): Promise<{ data: { to: string } }> {
    return { data: await this.sends.sendTest(user, newsletterId) };
  }

  @TenantReadPolicy('owner')
  @Get('brands/:brandId/newsletter/sends')
  async list(
    @Req() request: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Param('brandId') brandId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    const safeLimit = Math.min(Math.max(limit, 1), 100);
    const safePage = Math.max(page, 1);
    const { docs, total } = await this.sends.list(
      user,
      brandId,
      safePage,
      safeLimit,
    );
    return serializeCollection(request, NewsletterSendSerializer, {
      docs,
      limit: safeLimit,
      page: safePage,
      pages: Math.ceil(total / safeLimit),
      total,
    });
  }

  @Patch('newsletter-sends/:sendId')
  async control(
    @Req() request: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Param('sendId') sendId: string,
    @Body() dto: ControlNewsletterSendDto,
  ) {
    return serializeSingle(
      request,
      NewsletterSendSerializer,
      await this.sends.control(user, sendId, dto.action),
    );
  }
}
