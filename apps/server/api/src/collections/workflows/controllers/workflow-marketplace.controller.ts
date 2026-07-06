import type { WorkflowDocument } from '@api/collections/workflows/schemas/workflow.schema';
import { WorkflowsService } from '@api/collections/workflows/services/workflows.service';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { customLabels } from '@api/helpers/utils/pagination/pagination.util';
import { QueryDefaultsUtil } from '@api/helpers/utils/query-defaults/query-defaults.util';
import { serializeCollection } from '@api/helpers/utils/response/response.util';
import { handleQuerySort } from '@api/helpers/utils/sort/sort.util';
import { AggregatePaginateResult } from '@api/types/aggregate-paginate-result';
import type { JsonApiCollectionResponse } from '@genfeedai/interfaces';
import { WorkflowSerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import { Controller, Get, Query, Req } from '@nestjs/common';
import type { Request } from 'express';

type WorkflowTemplates = Awaited<
  ReturnType<WorkflowsService['getWorkflowTemplates']>
>;

/**
 * Marketplace + template discovery for workflows. Split out of the former
 * monolithic `WorkflowsController`.
 *
 * `referencable` list and marketplace publish/unpublish were collapsed by the
 * REST audit (#1354): the former into `GET /workflows?referencable=true`
 * (WorkflowCrudController), the latter into
 * `PATCH /workflows/:id { isPublic, isTemplate }` with the seller/listing
 * cascade behind `WorkflowsService.publishToMarketplace`.
 */
@AutoSwagger()
@Controller('workflows')
export class WorkflowMarketplaceController {
  constructor(
    private readonly workflowsService: WorkflowsService,
    readonly _loggerService: LoggerService,
  ) {}

  @Get('templates')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async getTemplates(): Promise<{ data: WorkflowTemplates }> {
    const templates = await this.workflowsService.getWorkflowTemplates();

    return { data: templates };
  }

  @Get('marketplace')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async getMarketplace(
    @Req() request: Request,
    @Query() query: BaseQueryDto,
  ): Promise<JsonApiCollectionResponse> {
    const options = {
      customLabels,
      ...QueryDefaultsUtil.getPaginationDefaults(query),
    };

    const aggregate = {
      where: {
        isDeleted: false,
        isPublic: true,
        isTemplate: true,
      },
      orderBy: handleQuerySort(query.sort || '-executionCount'),
    };

    const data: AggregatePaginateResult<WorkflowDocument> =
      await this.workflowsService.findAll(aggregate, options);
    return serializeCollection(request, WorkflowSerializer, data);
  }
}
