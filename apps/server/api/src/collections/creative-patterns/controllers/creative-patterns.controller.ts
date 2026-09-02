import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { CreativePatternsService } from '@api/collections/creative-patterns/creative-patterns.service';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import type { PatternType } from '@genfeedai/contracts/interfaces';
import { BadRequestException, Controller, Get, Query } from '@nestjs/common';

@AutoSwagger()
@Controller('creative-patterns')
export class CreativePatternsController {
  constructor(
    private readonly creativePatternsService: CreativePatternsService,
  ) {}

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
    if (!user.organizationId) {
      throw new BadRequestException('organizationId is required');
    }

    const patterns = await this.creativePatternsService.findAll({
      brandId,
      limit: limit ? parseInt(limit, 10) : undefined,
      organizationId: user.organizationId,
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
