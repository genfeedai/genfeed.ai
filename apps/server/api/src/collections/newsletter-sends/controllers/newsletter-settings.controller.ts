import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { BrandAccessService } from '@api/authorization/brand-access/brand-access.service';
import { UpdateNewsletterSettingsDto } from '@api/collections/newsletter-sends/dto/update-newsletter-settings.dto';
import { NewsletterSettingsService } from '@api/collections/newsletter-sends/services/newsletter-settings.service';
import { NewsletterUsageService } from '@api/collections/newsletter-sends/services/newsletter-usage.service';
import { OrganizationModule } from '@api/common/organization-modules/organization-module.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import type { INewsletterUsage } from '@genfeedai/contracts/interfaces';
import { NewsletterSettingsSerializer } from '@genfeedai/serializers';
import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

/** The Newsletter Settings page: sender, footer, welcome email, plan usage (#9723). */
@AutoSwagger()
@ApiTags('Newsletters')
@Controller('brands/:brandId/newsletter')
@UseGuards(RolesGuard)
@OrganizationModule('publishing')
export class NewsletterSettingsController {
  constructor(
    private readonly brandAccess: BrandAccessService,
    private readonly settings: NewsletterSettingsService,
    private readonly usage: NewsletterUsageService,
  ) {}

  @Get('settings')
  async get(
    @Req() request: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Param('brandId') brandId: string,
  ) {
    await this.brandAccess.assert(user, brandId);
    const settings = await this.settings.get(user.organizationId, brandId);
    return serializeSingle(request, NewsletterSettingsSerializer, {
      ...settings,
      id: settings.id ?? brandId,
    });
  }

  @Patch('settings')
  async update(
    @Req() request: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Param('brandId') brandId: string,
    @Body() dto: UpdateNewsletterSettingsDto,
  ) {
    await this.brandAccess.assert(user, brandId);
    return serializeSingle(
      request,
      NewsletterSettingsSerializer,
      await this.settings.update(user.organizationId, brandId, dto),
    );
  }

  @Get('usage')
  async getUsage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('brandId') brandId: string,
  ): Promise<{ data: INewsletterUsage }> {
    await this.brandAccess.assert(user, brandId);
    return { data: await this.usage.getUsage(user.organizationId) };
  }
}
