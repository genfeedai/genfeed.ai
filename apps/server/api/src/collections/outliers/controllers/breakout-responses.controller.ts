import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import {
  BreakoutResponseDetailDto,
  BreakoutResponseListDto,
} from '@api/collections/outliers/dto/breakout-response-query.dto';
import { BreakoutResponseReadsService } from '@api/collections/outliers/services/breakout-response-reads.service';
import { FeatureFlag } from '@api/feature-flag/feature-flag.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { TenantReadPolicy } from '@api/helpers/interceptors/tenant-context/tenant-read-policy.decorator';
import { resolveTenantReadScope } from '@api/helpers/interceptors/tenant-context/tenant-read-scope.context';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { BreakoutResponseSerializer } from '@genfeedai/serializers';
import {
  Controller,
  ForbiddenException,
  Get,
  Param,
  Query,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

@ApiTags('Breakout responses')
@FeatureFlag('analytics')
@Controller('brands/:brandId/breakout-responses')
@UseGuards(RolesGuard)
@UsePipes(
  new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }),
)
export class BreakoutResponsesController {
  constructor(private readonly reads: BreakoutResponseReadsService) {}
  private actor(user: AuthenticatedUser, brandId: string) {
    // The guard's canonical users.id is mandatory; no legacy identity fallback.
    if (
      !user?.userId ||
      !user.organizationId ||
      !brandId ||
      user.isApiKey ||
      user.apiKeyId
    )
      throw new ForbiddenException('breakout_access_denied');
    return {
      organizationId: resolveTenantReadScope(user).organizationId,
      brandId,
      actorId: user.userId,
    };
  }
  @TenantReadPolicy('selected')
  @Get()
  async list(
    @Req() request: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Param('brandId') brandId: string,
    @Query() query: BreakoutResponseListDto,
  ) {
    return serializeCollection(request, BreakoutResponseSerializer, {
      ...(await this.reads.list(this.actor(user, brandId), query)),
    });
  }
  @TenantReadPolicy('selected')
  @Get(':id')
  async detail(
    @Req() request: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Param('brandId') brandId: string,
    @Param('id') id: string,
    @Query() query: BreakoutResponseDetailDto,
  ) {
    return serializeSingle(
      request,
      BreakoutResponseSerializer,
      await this.reads.detail(this.actor(user, brandId), id, query.strategyId),
    );
  }
}
