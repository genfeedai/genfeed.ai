import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import {
  AddBrandSubscribersDto,
  BrandSubscribersQueryDto,
  ImportBrandSubscribersDto,
} from '@api/collections/newsletter-subscribers/dto/brand-subscribers.dto';
import { BrandSubscribersService } from '@api/collections/newsletter-subscribers/services/brand-subscribers.service';
import { OrganizationModule } from '@api/common/organization-modules/organization-module.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { TenantReadPolicy } from '@api/helpers/interceptors/tenant-context/tenant-read-policy.decorator';
import { serializeCollection } from '@api/helpers/utils/response/response.util';
import type {
  IBrandSubscriberImportSummary,
  IBrandSubscriberStats,
} from '@genfeedai/contracts/interfaces';
import { BrandSubscriberSerializer } from '@genfeedai/serializers';
import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

/** The Newsletter Subscribers page (#9724). */
@AutoSwagger()
@ApiTags('Newsletters')
@Controller('brands/:brandId/newsletter/subscribers')
@UseGuards(RolesGuard)
@OrganizationModule('publishing')
export class BrandSubscribersController {
  constructor(private readonly subscribers: BrandSubscribersService) {}

  @TenantReadPolicy('owner')
  @Get()
  async list(
    @Req() request: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Param('brandId') brandId: string,
    @Query() query: BrandSubscribersQueryDto,
  ) {
    const result = await this.subscribers.list(user, brandId, query);
    return serializeCollection(request, BrandSubscriberSerializer, {
      docs: result.docs,
      limit: result.limit,
      page: result.page,
      pages: Math.ceil(result.total / result.limit),
      total: result.total,
    });
  }

  @TenantReadPolicy('owner')
  @Get('stats')
  async stats(
    @CurrentUser() user: AuthenticatedUser,
    @Param('brandId') brandId: string,
  ): Promise<{ data: IBrandSubscriberStats }> {
    return { data: await this.subscribers.stats(user, brandId) };
  }

  @TenantReadPolicy('owner')
  @Get('export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="subscribers.csv"')
  @Header('Cache-Control', 'no-store')
  exportCsv(
    @CurrentUser() user: AuthenticatedUser,
    @Param('brandId') brandId: string,
  ): Promise<string> {
    return this.subscribers.exportCsv(user, brandId);
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  async add(
    @CurrentUser() user: AuthenticatedUser,
    @Param('brandId') brandId: string,
    @Body() dto: AddBrandSubscribersDto,
  ): Promise<{ data: IBrandSubscriberImportSummary }> {
    return { data: await this.subscribers.add(user, brandId, dto) };
  }

  @Post('imports')
  @HttpCode(HttpStatus.OK)
  async importCsv(
    @CurrentUser() user: AuthenticatedUser,
    @Param('brandId') brandId: string,
    @Body() dto: ImportBrandSubscribersDto,
  ): Promise<{ data: IBrandSubscriberImportSummary }> {
    return { data: await this.subscribers.importCsv(user, brandId, dto) };
  }

  @Post(':subscriberId/confirmation')
  @HttpCode(HttpStatus.NO_CONTENT)
  async resendConfirmation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('brandId') brandId: string,
    @Param('subscriberId') subscriberId: string,
  ): Promise<void> {
    await this.subscribers.resendConfirmation(user, brandId, subscriberId);
  }

  @Delete(':subscriberId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('brandId') brandId: string,
    @Param('subscriberId') subscriberId: string,
  ): Promise<void> {
    await this.subscribers.remove(user, brandId, subscriberId);
  }
}
