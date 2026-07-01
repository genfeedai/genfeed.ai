import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import type { WorkflowDocument } from '@api/collections/workflows/schemas/workflow.schema';
import { WorkflowsService } from '@api/collections/workflows/services/workflows.service';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { getPublicMetadata } from '@api/helpers/utils/auth/auth.util';
import { customLabels } from '@api/helpers/utils/pagination/pagination.util';
import { QueryDefaultsUtil } from '@api/helpers/utils/query-defaults/query-defaults.util';
import {
  returnNotFound,
  serializeCollection,
} from '@api/helpers/utils/response/response.util';
import { handleQuerySort } from '@api/helpers/utils/sort/sort.util';
import { MarketplaceApiClient } from '@api/marketplace-integration/marketplace-api-client';
import { AggregatePaginateResult } from '@api/types/aggregate-paginate-result';
import { ListingType } from '@genfeedai/enums';
import type {
  JsonApiCollectionResponse,
  JsonApiSingleResponse,
} from '@genfeedai/interfaces';
import { WorkflowSerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import {
  Controller,
  Delete,
  Get,
  Optional,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';

type WorkflowTemplates = Awaited<
  ReturnType<WorkflowsService['getWorkflowTemplates']>
>;

type JsonApiResourceLike = {
  id: string;
  type: string;
  attributes?: Record<string, unknown>;
};

/**
 * Marketplace + template discovery and publish/unpublish endpoints for
 * workflows. Split out of the former monolithic `WorkflowsController`.
 */
@AutoSwagger()
@Controller('workflows')
export class WorkflowMarketplaceController {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly workflowsService: WorkflowsService,
    @Optional()
    private readonly marketplaceApiClient: MarketplaceApiClient | undefined,
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

  @Get('referencable')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async getReferencableWorkflows(
    @Req() request: Request,
    @CurrentUser() user: User,
  ): Promise<JsonApiCollectionResponse> {
    const publicMetadata = getPublicMetadata(user);
    const aggregate = {
      where: {
        isDeleted: false,
        organization: publicMetadata.organization,
      },
    };
    const options = {
      customLabels,
      ...QueryDefaultsUtil.getPaginationDefaults({}),
    };
    const data = await this.workflowsService.findAll(aggregate, options);
    return serializeCollection(request, WorkflowSerializer, data);
  }

  @Post(':workflowId/publish')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async publishToMarketplace(
    @Param('workflowId') workflowId: string,
    @CurrentUser() user: User,
  ): Promise<JsonApiSingleResponse> {
    const publicMetadata = getPublicMetadata(user);
    const workflow = await this.workflowsService.findMutableOwnedOrThrow(
      workflowId,
      {
        organization: publicMetadata.organization,
        user: publicMetadata.user,
      },
    );

    // Mark workflow as public/template
    await this.workflowsService.patch(workflowId, {
      isPublic: true,
      isTemplate: true,
    });

    // Create marketplace listing if seller profile exists and marketplace API is available
    let listingId: string | undefined;

    if (this.marketplaceApiClient) {
      const seller = await this.marketplaceApiClient.getSellerByUserId(
        publicMetadata.user,
      );

      if (seller) {
        const nodes = (workflow as WorkflowDocument).nodes || [];
        const edges = (workflow as WorkflowDocument).edges || [];
        const nodeTypes = [
          ...new Set(nodes.map((n: { type: string }) => n.type)),
        ];

        const listing = await this.marketplaceApiClient.createListing(
          seller._id.toString(),
          publicMetadata.organization,
          {
            description:
              (workflow as WorkflowDocument).description ||
              workflow.name ||
              'A workflow published from the builder',
            downloadData: {
              edges,
              name: workflow.name,
              nodes,
              version: 1,
            },
            previewData: {
              connections: edges.length,
              nodes: nodes.length,
              nodeTypes,
            },
            price: 0,
            shortDescription:
              (workflow as WorkflowDocument).description?.slice(0, 300) ||
              workflow.name ||
              'Workflow',
            tags: ['community', 'workflow'],
            title: workflow.name || 'Untitled Workflow',
            type: ListingType.WORKFLOW,
          },
        );

        if (listing) {
          // Auto-approve (submit for review)
          await this.marketplaceApiClient.submitForReview(
            listing._id.toString(),
            seller._id.toString(),
          );

          listingId = listing._id.toString();
        }
      }
    }

    return {
      data: {
        attributes: {
          listingId,
          message: 'Published to marketplace',
          workflowId,
        },
        id: workflowId,
        type: 'workflow-publish',
      },
    } as unknown as JsonApiSingleResponse;
  }

  @Delete(':workflowId/publish')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async unpublishFromMarketplace(
    @Param('workflowId') workflowId: string,
    @CurrentUser() user: User,
  ): Promise<JsonApiSingleResponse> {
    const publicMetadata = getPublicMetadata(user);
    await this.workflowsService.findMutableOwnedOrThrow(workflowId, {
      organization: publicMetadata.organization,
      user: publicMetadata.user,
    });

    const updated = await this.workflowsService.patch(workflowId, {
      isPublic: false,
    });

    return updated
      ? {
          data: {
            id: workflowId,
            message: 'Removed from marketplace',
          } as unknown as JsonApiResourceLike,
        }
      : returnNotFound(this.constructorName, workflowId);
  }
}
