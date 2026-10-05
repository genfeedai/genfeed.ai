import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import {
  MOST_USED_WORKFLOWS_DEFAULT_LIMIT,
  MostUsedWorkflowsQueryDto,
} from '@api/collections/workflows/dto/most-used-workflows-query.dto';
import type {
  FeaturedWorkflowDocument,
  WorkflowDocument,
} from '@api/collections/workflows/schemas/workflow.schema';
import { FeaturedWorkflowsService } from '@api/collections/workflows/services/featured-workflows.service';
import { WorkflowsService } from '@api/collections/workflows/services/workflows.service';
import { toMarketplaceWorkflow } from '@api/collections/workflows/utils/workflow-marketplace-projection.util';
import { withNextRunAt } from '@api/collections/workflows/utils/workflow-next-run.util';
import { FeatureFlag } from '@api/feature-flag/feature-flag.decorator';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { customLabels } from '@api/helpers/utils/pagination.util';
import { QueryDefaultsUtil } from '@api/helpers/utils/query-defaults/query-defaults.util';
import { serializeCollection } from '@api/helpers/utils/response/response.util';
import { handleQuerySort } from '@api/helpers/utils/sort/sort.util';
import { AggregatePaginateResult } from '@api/types/aggregate-paginate-result';
import type { JsonApiCollectionResponse } from '@genfeedai/contracts/interfaces';
import {
  MarketplaceWorkflowSerializer,
  WorkflowSerializer,
} from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import { crossOrgUnsafe } from '@libs/prisma/tenant-context';
import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
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
@FeatureFlag('automation')
@Controller('workflows')
export class WorkflowMarketplaceController {
  constructor(
    private readonly workflowsService: WorkflowsService,
    private readonly featuredWorkflowsService: FeaturedWorkflowsService,
    readonly _loggerService: LoggerService,
  ) {}

  @Get('templates')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async getTemplates(): Promise<{ data: WorkflowTemplates }> {
    const templates = await this.workflowsService.getWorkflowTemplates();

    return { data: templates };
  }

  /**
   * The templates page Featured row (#5511): the workflows a platform
   * superadmin pinned, in pin order with `featuredRank`, read-only to every
   * organization. Each carries only display fields and the sanitized graph.
   * Empty when nothing is pinned, and the page then hides Featured. "Use" is
   * `POST /workflows { sourceType: 'featured-workflow', sourceWorkflowId }`.
   */
  @Get('featured')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async getFeatured(): Promise<{ data: FeaturedWorkflowDocument[] }> {
    return { data: await this.featuredWorkflowsService.listFeatured() };
  }

  /**
   * "Most used by your team" (#5510): the caller organization's most-run
   * tenant workflows, serialized like the list endpoint plus
   * `executionCount`. Returns an empty collection when nothing has run.
   * Requires active membership of that organization, like workflow CRUD.
   */
  @Get('most-used')
  @UseGuards(RolesGuard)
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async getMostUsed(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Query() query: MostUsedWorkflowsQueryDto,
  ): Promise<JsonApiCollectionResponse> {
    const docs = await this.workflowsService.findMostUsed(
      user.organizationId,
      query.limit ?? MOST_USED_WORKFLOWS_DEFAULT_LIMIT,
    );

    return serializeCollection(request, WorkflowSerializer, {
      docs: docs.map(withNextRunAt),
    });
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
        AND: [
          { config: { equals: true, path: ['isPublic'] } },
          { config: { equals: true, path: ['isTemplate'] } },
        ],
        isDeleted: false,
      },
      orderBy: handleQuerySort(query.sort || '-executionCount'),
    };

    // The marketplace lists public template workflows published by every
    // organization, so this read is an explicit cross-org operation.
    const data: AggregatePaginateResult<WorkflowDocument> =
      await crossOrgUnsafe(
        async () => await this.workflowsService.findAll(aggregate, options),
      );
    return serializeCollection(request, MarketplaceWorkflowSerializer, {
      ...data,
      docs: data.docs.map(toMarketplaceWorkflow),
    });
  }
}
