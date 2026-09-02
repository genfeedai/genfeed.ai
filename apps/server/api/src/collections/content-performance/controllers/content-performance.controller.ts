import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { CreateContentPerformanceDto } from '@api/collections/content-performance/dto/create-content-performance.dto';
import { ImportCsvDto } from '@api/collections/content-performance/dto/import-csv.dto';
import { ImportManualDto } from '@api/collections/content-performance/dto/import-manual.dto';
import { ManualInputDto } from '@api/collections/content-performance/dto/manual-input.dto';
import { QueryContentPerformanceDto } from '@api/collections/content-performance/dto/query-content-performance.dto';
import { AttributionService } from '@api/collections/content-performance/services/attribution.service';
import { ContentPerformanceService } from '@api/collections/content-performance/services/content-performance.service';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import {
  returnNotFound,
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { ContentPerformanceSerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';

@AutoSwagger()
@Controller('content-performance')
@UseGuards(RolesGuard)
export class ContentPerformanceController {
  private readonly constructorName = this.constructor.name;

  constructor(
    private readonly contentPerformanceService: ContentPerformanceService,
    private readonly attributionService: AttributionService,
    readonly _loggerService: LoggerService,
  ) {}

  /**
   * Create a content performance record
   * POST /content-performance
   */
  @Post()
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async create(
    @Req() req: Request,
    @Body() dto: CreateContentPerformanceDto,
    @CurrentUser() user: User,
  ) {
    const data = await this.contentPerformanceService.createPerformance(
      dto,
      user.organizationId,
      user.userId ?? user.id,
    );

    return serializeSingle(req, ContentPerformanceSerializer, data);
  }

  /**
   * Query content performance with filters
   * GET /content-performance
   */
  @Get()
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async query(
    @Req() req: Request,
    @Query() filters: QueryContentPerformanceDto,
    @CurrentUser() user: User,
  ) {
    const docs = await this.contentPerformanceService.queryPerformance(
      filters,
      user.organizationId,
    );

    return serializeCollection(req, ContentPerformanceSerializer, { docs });
  }

  /**
   * Import CSV-style bulk metrics (structured JSON array)
   * POST /content-performance/import/csv
   */
  @Post('import/csv')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async importCsv(@Body() dto: ImportCsvDto, @CurrentUser() user: User) {
    return this.contentPerformanceService.importCsv(
      dto,
      user.organizationId,
      user.userId ?? user.id,
    );
  }

  /**
   * Import a single manual metric entry (for screenshot-based input)
   * POST /content-performance/import/manual
   */
  @Post('import/manual')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async importManual(
    @Req() req: Request,
    @Body() dto: ImportManualDto,
    @CurrentUser() user: User,
  ) {
    const data = await this.contentPerformanceService.importManual(
      dto,
      user.organizationId,
      user.userId ?? user.id,
    );

    return serializeSingle(req, ContentPerformanceSerializer, data);
  }

  /**
   * Bulk import manual metrics (CSV/screenshot)
   * POST /content-performance/manual-import
   */
  @Post('manual-import')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async manualImport(
    @Req() req: Request,
    @Body() dto: ManualInputDto,
    @CurrentUser() user: User,
  ) {
    const docs = await this.contentPerformanceService.bulkManualImport(
      dto,
      user.organizationId,
      user.userId ?? user.id,
    );

    return serializeCollection(req, ContentPerformanceSerializer, { docs });
  }

  /**
   * Rank generation strategies by performance
   * GET /content-performance/attribution/ranking
   * NOTE: Must be defined BEFORE :generationId to avoid param capture
   */
  @Get('attribution/ranking')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async getStrategyRanking(
    @Query('brand') brandId: string,
    @Query('limit') limit: string,
    @CurrentUser() user: User,
  ) {
    return this.attributionService.rankGenerationStrategies(
      user.organizationId,
      brandId,
      limit ? parseInt(limit, 10) || 20 : 20,
    );
  }

  /**
   * Get attribution data for a generationId
   * GET /content-performance/attribution/:generationId
   */
  @Get('attribution/:generationId')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async getAttribution(
    @Param('generationId') generationId: string,
    @CurrentUser() user: User,
  ) {
    const result = await this.attributionService.getAttributionByGenerationId(
      user.organizationId,
      generationId,
    );

    if (!result) {
      return returnNotFound(this.constructorName, generationId);
    }

    return result;
  }

  /**
   * Get aggregated metrics for a generationId
   * GET /content-performance/aggregate/:generationId
   */
  @Get('aggregate/:generationId')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async getAggregated(
    @Param('generationId') generationId: string,
    @CurrentUser() user: User,
  ) {
    return this.contentPerformanceService.aggregateByGenerationId(
      user.organizationId,
      generationId,
    );
  }

  /**
   * Get a single performance record
   * GET /content-performance/:id
   */
  @Get(':id')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findOne(
    @Req() req: Request,
    @Param('id') id: string,
    @CurrentUser() user: User,
  ) {
    const record = await this.contentPerformanceService.findOne({
      id: id,
      organizationId: user.organizationId,
    });

    if (!record) {
      return returnNotFound(this.constructorName, id);
    }

    return serializeSingle(req, ContentPerformanceSerializer, record);
  }

  /**
   * Soft delete a performance record
   * DELETE /content-performance/:id
   */
  @Delete(':id')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async delete(@Param('id') id: string, @CurrentUser() user: User) {
    const record = await this.contentPerformanceService.findOne({
      id: id,
      organizationId: user.organizationId,
    });

    if (!record) {
      return returnNotFound(this.constructorName, id);
    }

    await this.contentPerformanceService.patch(id, { isDeleted: true });

    return { success: true };
  }
}
