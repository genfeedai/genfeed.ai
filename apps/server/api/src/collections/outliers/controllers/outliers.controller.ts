import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import {
  OutlierAccountDto,
  OutlierPaginationDto,
  OutlierQueryDto,
} from '@api/collections/outliers/dto/outlier-query.dto';
import { OutlierConfigurationService } from '@api/collections/outliers/services/outlier-configuration.service';
import { OutliersService } from '@api/collections/outliers/services/outliers.service';
import { RolesDecorator } from '@api/helpers/decorators/roles/roles.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { MemberRole } from '@genfeedai/contracts';
import {
  OutlierBaselineSnapshotSerializer,
  OutlierConfigurationSerializer,
  OutlierPostPerformanceSerializer,
} from '@genfeedai/serializers';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

@ApiTags('Outlier baselines')
@Controller('outlier-baselines')
@UseGuards(RolesGuard)
export class OutliersController {
  constructor(
    private readonly service: OutliersService,
    private readonly configuration: OutlierConfigurationService,
  ) {}
  private organization(user: AuthenticatedUser): string {
    if (!user.organizationId)
      throw new BadRequestException('Organization context is required');
    return user.organizationId;
  }
  @Get('configuration') async getConfiguration(
    @Req() request: Request,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return serializeSingle(
      request,
      OutlierConfigurationSerializer,
      await this.configuration.resolve(this.organization(user)),
    );
  }
  @Patch('configuration')
  @RolesDecorator(MemberRole.OWNER, MemberRole.ADMIN)
  async patchConfiguration(
    @Req() request: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
  ) {
    return serializeSingle(
      request,
      OutlierConfigurationSerializer,
      await this.configuration.update(this.organization(user), body),
    );
  }
  @Post('refresh')
  @RolesDecorator(MemberRole.OWNER, MemberRole.ADMIN)
  async refresh(
    @Req() request: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: OutlierAccountDto,
  ) {
    return serializeCollection(request, OutlierBaselineSnapshotSerializer, {
      docs: await this.service.refresh({
        brandId: body.brandId,
        accountType: body.accountType,
        accountId: body.accountId,
        organizationId: this.organization(user),
      }),
    });
  }
  @Get() async list(
    @Req() request: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: OutlierQueryDto,
  ) {
    return serializeCollection(
      request,
      OutlierBaselineSnapshotSerializer,
      await this.service.list(
        {
          organizationId: this.organization(user),
          brandId: query.brandId,
          accountType: query.accountType,
          accountId: query.accountId,
        },
        query,
      ),
    );
  }
  @Get(':id') async findOne(
    @Req() request: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return serializeSingle(
      request,
      OutlierBaselineSnapshotSerializer,
      await this.service.findOne(this.organization(user), id),
    );
  }
  @Get(':id/posts') async posts(
    @Req() request: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query() query: OutlierPaginationDto,
  ) {
    return serializeCollection(
      request,
      OutlierPostPerformanceSerializer,
      await this.service.posts(
        this.organization(user),
        id,
        query.page,
        query.limit,
      ),
    );
  }
}
