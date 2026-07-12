import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { UpsertDashboardLayoutDto } from '@api/collections/dashboard-layouts/dto/upsert-dashboard-layout.dto';
import { DashboardLayoutsService } from '@api/collections/dashboard-layouts/services/dashboard-layouts.service';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import { getPublicMetadata } from '@api/helpers/utils/auth/auth.util';
import {
  returnNotFound,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import type { JsonApiSingleResponse } from '@genfeedai/interfaces';
import { DashboardLayoutSerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';

const DEFAULT_PAGE_KEY = 'workspace-overview';

@AutoSwagger()
@Controller('dashboard-layouts')
export class DashboardLayoutsController {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    readonly logger: LoggerService,
    readonly service: DashboardLayoutsService,
  ) {}

  @Get()
  async findForPage(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Query('brand') brandId: string,
    @Query('pageKey') pageKey?: string,
  ): Promise<JsonApiSingleResponse> {
    if (!brandId) {
      throw new NotFoundException({
        message: 'Query param `brand` is required',
      });
    }

    const { organization: organizationId } = getPublicMetadata(user);

    const data = await this.service.findForPage(
      brandId,
      organizationId,
      pageKey ?? DEFAULT_PAGE_KEY,
    );

    return data
      ? serializeSingle(request, DashboardLayoutSerializer, data)
      : returnNotFound(this.constructorName, brandId);
  }

  @Put()
  async upsert(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() dto: UpsertDashboardLayoutDto,
  ): Promise<JsonApiSingleResponse> {
    const { organization: organizationId } = getPublicMetadata(user);

    const data = await this.service.upsertForPage(organizationId, dto);
    return serializeSingle(request, DashboardLayoutSerializer, data);
  }

  @Delete(':id')
  async remove(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
  ): Promise<JsonApiSingleResponse> {
    const { organization: organizationId } = getPublicMetadata(user);

    const data = await this.service.removeScoped(id, organizationId);
    return data
      ? serializeSingle(request, DashboardLayoutSerializer, data)
      : returnNotFound(this.constructorName, id);
  }
}
