import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { CreativePatternsService } from '@api/collections/creative-patterns/creative-patterns.service';
import { FeatureFlag } from '@api/feature-flag/feature-flag.decorator';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { TenantReadPolicy } from '@api/helpers/interceptors/tenant-context/tenant-read-policy.decorator';
import { resolveTenantReadScope } from '@api/helpers/interceptors/tenant-context/tenant-read-scope.context';
import type { PatternType } from '@genfeedai/contracts/interfaces';
import { BadRequestException, Controller, Get, Query } from '@nestjs/common';

@AutoSwagger()
@FeatureFlag('analytics')
@Controller('creative-patterns')
export class CreativePatternsController {
  constructor(
    private readonly creativePatternsService: CreativePatternsService,
  ) {}

  @TenantReadPolicy('selected')
  @Get()
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findAll(
    @CurrentUser() user: User,
    @Query('platform') platform?: string,
    @Query('patternType') patternType?: PatternType,
    @Query('scope') scope?: string,
    @Query('brandId') brandId?: string,
    @Query('top') top?: string,
    @Query('limit') limit?: string,
  ) {
    const readScope = resolveTenantReadScope(user);
    if (!user.organizationId) {
      throw new BadRequestException('organizationId is required');
    }

    const patterns = await this.creativePatternsService.findAll({
      brandId,
      limit: limit ? parseInt(limit, 10) : undefined,
      organizationId: readScope.organizationId,
      patternType,
      platform,
      scope,
      top: top === 'true',
    });

    return {
      count: patterns.length,
      patterns,
    };
  }
}
