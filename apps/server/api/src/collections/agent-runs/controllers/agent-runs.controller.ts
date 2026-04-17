import {
  AgentRunStatsQueryDto,
  AgentRunsQueryDto,
} from '@api/collections/agent-runs/dto/agent-runs-query.dto';
import { CreateAgentRunDto } from '@api/collections/agent-runs/dto/create-agent-run.dto';
import { UpdateAgentRunDto } from '@api/collections/agent-runs/dto/update-agent-run.dto';
import {
  AgentRun,
  type AgentRunDocument,
} from '@api/collections/agent-runs/schemas/agent-run.schema';
import { AgentRunsService } from '@api/collections/agent-runs/services/agent-runs.service';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { getPublicMetadata } from '@api/helpers/utils/clerk/clerk.util';
import { customLabels } from '@api/helpers/utils/pagination/pagination.util';
import { QueryDefaultsUtil } from '@api/helpers/utils/query-defaults/query-defaults.util';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { handleQuerySort } from '@api/helpers/utils/sort/sort.util';
import { AgentThreadEngineService } from '@api/services/agent-threading/services/agent-thread-engine.service';
import { BaseCRUDController } from '@api/shared/controllers/base-crud/base-crud.controller';
import type { User } from '@clerk/backend';
import { AgentExecutionStatus } from '@genfeedai/enums';
import { AgentRunSerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Optional,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

@ApiTags('Agent Runs')
@AutoSwagger()
@Controller('runs')
export class AgentRunsController extends BaseCRUDController<
  AgentRunDocument,
  CreateAgentRunDto,
  UpdateAgentRunDto,
  AgentRunsQueryDto
> {
  constructor(
    public readonly agentRunsService: AgentRunsService,
    public readonly loggerService: LoggerService,
    @Optional()
    private readonly agentThreadEngineService?: AgentThreadEngineService,
  ) {
    super(loggerService, agentRunsService, AgentRunSerializer, 'AgentRun', [
      'organization',
      'user',
    ]);
  }

  public buildFindAllPipeline(
    user: User,
    query: AgentRunsQueryDto,
  ): Record<string, unknown>[] {
    const publicMetadata = getPublicMetadata(user);
    const match: Record<string, unknown> = {
      isDeleted: false,
    };

    const organizationId = publicMetadata.organization?.toString();
    if (organizationId) {
      match.organization = organizationId;
    }

    if (query.historyOnly) {
      match.status = {
        $nin: [AgentExecutionStatus.PENDING, AgentExecutionStatus.RUNNING],
      };
    } else if (query.status) {
      match.status = query.status;
    }

    if (query.strategy) {
      match.strategy = query.strategy;
    }

    if (query.trigger) {
      match.trigger = query.trigger;
    }

    if (query.routingPolicy) {
      match['metadata.routingPolicy'] = query.routingPolicy;
    }

    if (query.webSearchEnabled !== undefined) {
      match['metadata.webSearchEnabled'] = query.webSearchEnabled;
    }

    if (query.model) {
      match.$or = [
        { 'metadata.actualModel': query.model },
        { 'metadata.requestedModel': query.model },
      ];
    }

    if (query.q) {
      const escapedQuery = query.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const searchRegex = new RegExp(escapedQuery, 'i');
      const searchConditions = [
        { label: searchRegex },
        { objective: searchRegex },
        { 'metadata.actualModel': searchRegex },
        { 'metadata.requestedModel': searchRegex },
        { 'metadata.routingPolicy': searchRegex },
      ];

      if (Array.isArray(match.$or)) {
        match.$and = [{ $or: [...match.$or] }, { $or: searchConditions }];
        delete match.$or;
      } else {
        match.$or = searchConditions;
      }
    }

    const pipeline: Record<string, unknown>[] = [{ $match: match }];

    if (query.sortMode === 'model') {
      pipeline.push({
        $addFields: {
          _sortModel: {
            $ifNull: ['$metadata.actualModel', '$metadata.requestedModel'],
          },
        },
      });
      pipeline.push({ $sort: { _sortModel: 1, createdAt: -1 } });
    } else if (query.sortMode === 'credits') {
      pipeline.push({ $sort: { createdAt: -1, creditsUsed: -1 } });
    } else if (query.sortMode === 'duration') {
      pipeline.push({ $sort: { createdAt: -1, durationMs: -1 } });
    } else {
      pipeline.push({ $sort: handleQuerySort(query.sort) });
    }

    return pipeline;
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List agent runs with filtering and sorting' })
  @ApiResponse({ description: 'Runs returned', status: 200 })
  async findAll(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Query() query: AgentRunsQueryDto,
  ) {
    const options = {
      customLabels,
      ...QueryDefaultsUtil.getPaginationDefaults(query),
    };
    const aggregate = this.buildFindAllPipeline(user, query);
    const data = await this.agentRunsService.findAll(aggregate, options);
    return serializeCollection(request, AgentRunSerializer, data);
  }

  public canUserModifyEntity(user: User, entity: AgentRunDocument): boolean {
    const publicMetadata = getPublicMetadata(user);

    const entityOrganizationId =
      (entity.organization as unknown as { _id: string })?._id?.toString() ||
      entity.organization?.toString();

    if (
      entityOrganizationId &&
      publicMetadata.organization &&
      entityOrganizationId === publicMetadata.organization
    ) {
      return true;
    }

    return Boolean(publicMetadata?.isSuperAdmin);
  }

  @Get('active')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get active agent runs' })
  @ApiResponse({ description: 'Active runs returned', status: 200 })
  async getActiveRuns(@Req() request: Request, @CurrentUser() user: User) {
    const publicMetadata = getPublicMetadata(user);
    const runs = await this.agentRunsService.getActiveRuns(
      publicMetadata.organization,
    );
    return serializeCollection(request, AgentRunSerializer, { docs: runs });
  }

  @Get('stats')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get agent run statistics' })
  @ApiResponse({ description: 'Stats returned', status: 200 })
  async getStats(
    @CurrentUser() user: User,
    @Query() query: AgentRunStatsQueryDto,
  ) {
    const publicMetadata = getPublicMetadata(user);
    return await this.agentRunsService.getStats(
      publicMetadata.organization,
      query,
    );
  }

  @Get(':id/content')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get content produced by an agent run' })
  @ApiResponse({ description: 'Run content returned', status: 200 })
  async getRunContent(@Param('id') id: string, @CurrentUser() user: User) {
    const publicMetadata = getPublicMetadata(user);
    const content = await this.agentRunsService.getRunContent(
      id,
      publicMetadata.organization,
    );

    if (!content) {
      throw new NotFoundException('Agent run not found');
    }

    return content;
  }

  @Post(':id/cancellations')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel a running agent' })
  @ApiResponse({ description: 'Run cancelled', status: 200 })
  async cancelRun(
    @Req() request: Request,
    @Param('id') id: string,
    @CurrentUser() user: User,
  ) {
    const publicMetadata = getPublicMetadata(user);
    const run = await this.agentRunsService.cancel(
      id,
      publicMetadata.organization,
    );

    if (!run) {
      throw new NotFoundException('Agent run not found');
    }

    const threadId =
      (run.thread as unknown as { _id?: string })?._id?.toString() ??
      run.thread?.toString();

    if (threadId) {
      await this.agentThreadEngineService?.appendEvent({
        commandId: `run-cancelled:${id}`,
        organizationId: publicMetadata.organization,
        payload: {
          detail: 'The active run was cancelled by the user.',
          label: 'Run cancelled',
          status: 'cancelled',
        },
        runId: id,
        threadId: threadId,
        type: 'run.cancelled',
        userId: publicMetadata.user,
      });
    }

    return serializeSingle(request, AgentRunSerializer, run);
  }
}
