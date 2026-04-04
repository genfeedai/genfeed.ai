import { CreativePatternsService } from '@api/collections/creative-patterns/creative-patterns.service';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { getPublicMetadata } from '@api/helpers/utils/clerk/clerk.util';
import type { User } from '@clerk/backend';
import type { PatternType } from '@genfeedai/interfaces';
import { Controller, Get, Param, Query } from '@nestjs/common';

@AutoSwagger()
@Controller('creative-patterns')
export class CreativePatternsController {
  constructor(
    private readonly creativePatternsService: CreativePatternsService,
  ) {}

  @Get()
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findAll(
    @Query('platform') platform?: string,
    @Query('patternType') patternType?: PatternType,
    @Query('scope') scope?: string,
  ) {
    const patterns = await this.creativePatternsService.findAll({
      patternType,
      platform,
      scope,
    });

    return {
      count: patterns.length,
      patterns,
    };
  }

  @Get('brand/:brandId')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findTopForBrand(
    @CurrentUser() user: User,
    @Param('brandId') brandId: string,
    @Query('limit') limit?: string,
    @Query('patternType') patternType?: PatternType,
  ) {
    const publicMetadata = getPublicMetadata(user);
    const organizationId = publicMetadata?.organization;

    const options: { limit?: number; patternTypes?: PatternType[] } = {};

    if (limit) {
      options.limit = parseInt(limit, 10);
    }

    if (patternType) {
      options.patternTypes = [patternType];
    }

    const patterns = await this.creativePatternsService.findTopForBrand(
      organizationId,
      brandId,
      options,
    );

    return {
      brandId,
      count: patterns.length,
      patterns,
    };
  }
}
