import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { CreativePatternsService } from '@api/collections/creative-patterns/creative-patterns.service';
import { CreativePatternsQueryDto } from '@api/collections/creative-patterns/dto/creative-patterns-query.dto';
import { OrganizationModule } from '@api/common/organization-modules/organization-module.decorator';
import { FeatureFlag } from '@api/feature-flag/feature-flag.decorator';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { TenantReadPolicy } from '@api/helpers/interceptors/tenant-context/tenant-read-policy.decorator';
import { resolveTenantReadScope } from '@api/helpers/interceptors/tenant-context/tenant-read-scope.context';
import { serializeCollection } from '@api/helpers/utils/response/response.util';
import type { JsonApiCollectionResponse } from '@genfeedai/contracts/interfaces';
import { CreativePatternSerializer } from '@genfeedai/serializers';
import {
  BadRequestException,
  Controller,
  Get,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';

@AutoSwagger()
@FeatureFlag('analytics')
@OrganizationModule('analytics')
@Controller('creative-patterns')
export class CreativePatternsController {
  constructor(
    private readonly creativePatternsService: CreativePatternsService,
  ) {}

  @TenantReadPolicy('selected')
  @Get()
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findAll(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Query() query: CreativePatternsQueryDto,
  ): Promise<JsonApiCollectionResponse> {
    const readScope = resolveTenantReadScope(user);
    if (!user.organizationId) {
      throw new BadRequestException('organizationId is required');
    }

    const result = await this.creativePatternsService.findAll(
      {
        brandId: query.brandId,
        organizationId: readScope.organizationId,
        patternType: query.patternType,
        platform: query.platform,
        scope: query.scope,
      },
      { limit: query.limit, page: query.page },
    );

    return serializeCollection(request, CreativePatternSerializer, result);
  }
}
