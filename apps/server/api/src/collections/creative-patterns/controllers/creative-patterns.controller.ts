import { CreativePatternsService } from '@api/collections/creative-patterns/creative-patterns.service';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import type { PatternType } from '@genfeedai/interfaces';
import { Controller, Get, Query } from '@nestjs/common';

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
    @Query('brandId') brandId?: string,
    @Query('top') top?: string,
    @Query('limit') limit?: string,
  ) {
    const patterns = await this.creativePatternsService.findAll({
      brandId,
      limit: limit ? parseInt(limit, 10) : undefined,
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
