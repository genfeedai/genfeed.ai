import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import type { RequestWithContext } from '@api/common/middleware/request-context.middleware';
import { CostReportingService } from '@api/endpoints/cost-reporting/cost-reporting.service';
import { buildCostReportCsv } from '@api/endpoints/cost-reporting/cost-reporting-export.util';
import {
  CostReportEntriesQueryDto,
  CostReportQueryDto,
} from '@api/endpoints/cost-reporting/dto/cost-report-query.dto';
import { RequiredScopes } from '@api/helpers/decorators/scopes/required-scopes.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { RateLimit } from '@api/shared/decorators/rate-limit/rate-limit.decorator';
import { ApiKeyScope } from '@genfeedai/enums';
import {
  CostReportEntrySerializer,
  CostReportSummarySerializer,
} from '@genfeedai/serializers';
import { Controller, Get, Query, Req, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';

@AutoSwagger()
@ApiTags('costs')
@Controller('costs')
export class CostReportingController {
  constructor(private readonly costReportingService: CostReportingService) {}

  @Get('summary')
  @RequiredScopes(ApiKeyScope.ANALYTICS_READ, ApiKeyScope.ADMIN)
  @RateLimit({ limit: 30, scope: 'user', windowMs: 60_000 })
  async getSummary(
    @Req() request: RequestWithContext,
    @CurrentUser() user: User,
    @Query() query: CostReportQueryDto,
  ) {
    const summary = await this.costReportingService.getSummary(
      this.organizationId(request, user),
      query,
    );
    return serializeSingle(request, CostReportSummarySerializer, summary);
  }

  @Get('entries')
  @RequiredScopes(ApiKeyScope.ANALYTICS_READ, ApiKeyScope.ADMIN)
  @RateLimit({ limit: 30, scope: 'user', windowMs: 60_000 })
  async getEntries(
    @Req() request: RequestWithContext,
    @CurrentUser() user: User,
    @Query() query: CostReportEntriesQueryDto,
  ) {
    const result = await this.costReportingService.getEntries(
      this.organizationId(request, user),
      query,
    );
    const page = Math.floor(result.skip / result.limit) + 1;

    return serializeCollection(request, CostReportEntrySerializer, {
      docs: result.docs,
      limit: result.limit,
      page,
      totalDocs: result.total,
      totalPages: Math.ceil(result.total / result.limit),
    });
  }

  @Get('export')
  @RequiredScopes(ApiKeyScope.ANALYTICS_READ, ApiKeyScope.ADMIN)
  @RateLimit({ limit: 10, scope: 'user', windowMs: 60_000 })
  async exportCsv(
    @Req() request: RequestWithContext,
    @CurrentUser() user: User,
    @Query() query: CostReportQueryDto,
    @Res() response: Response,
  ): Promise<void> {
    const entries = await this.costReportingService.getExportEntries(
      this.organizationId(request, user),
      query,
    );
    const date = new Date().toISOString().slice(0, 10);

    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="generation-costs-${date}.csv"`,
    );
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('X-Cost-Export-Limit', '10000');
    response.send(buildCostReportCsv(entries));
  }

  private organizationId(request: RequestWithContext, user: User): string {
    return request.context?.organizationId ?? user.organizationId.toString();
  }
}
