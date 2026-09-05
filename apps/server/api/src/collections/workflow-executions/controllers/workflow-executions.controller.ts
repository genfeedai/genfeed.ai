import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import {
  AgentFailureQueryDto,
  CreateWorkflowExecutionDto,
  UpdateWorkflowExecutionDto,
  WorkflowExecutionQueryDto,
} from '@api/collections/workflow-executions/dto/create-workflow-execution.dto';
import { WorkflowExecutionsService } from '@api/collections/workflow-executions/services/workflow-executions.service';
import { AGENT_CONVERSATION_WORKFLOW_IDS } from '@api/collections/workflows/services/agent-runtime-workflow-definitions';
import { WorkflowExecutionAuthorizationService } from '@api/collections/workflows/services/workflow-execution-authorization.service';
import { WorkflowExecutorService } from '@api/collections/workflows/services/workflow-executor.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { RolesDecorator } from '@api/helpers/decorators/roles/roles.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { getIsSuperAdmin } from '@api/helpers/utils/auth/auth.util';
import { customLabels } from '@api/helpers/utils/pagination.util';
import { QueryDefaultsUtil } from '@api/helpers/utils/query-defaults/query-defaults.util';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { handleQuerySort } from '@api/helpers/utils/sort/sort.util';
import type { PrismaFindAllInput } from '@api/shared/services/base/base.service';
import {
  AgentFailureReason,
  MemberRole,
  WorkflowExecutionStatus,
} from '@genfeedai/contracts';
import { HIDDEN_SYSTEM_WORKFLOW_SOURCE_TYPE } from '@genfeedai/contracts/interfaces';
import { WorkflowExecutionSerializer } from '@genfeedai/serializers';
import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';

@ApiTags('Workflow Executions')
@ApiBearerAuth()
@Controller('workflow-executions')
@UseGuards(RolesGuard)
export class WorkflowExecutionsController {
  constructor(
    private readonly workflowExecutionsService: WorkflowExecutionsService,
    private readonly workflowExecutionAuthorizationService: WorkflowExecutionAuthorizationService,
    private readonly moduleRef: ModuleRef,
  ) {}

  private get workflowExecutorService(): WorkflowExecutorService {
    const service = this.moduleRef.get(WorkflowExecutorService, {
      strict: false,
    });
    if (!service) {
      throw new Error('WorkflowExecutorService is not available');
    }
    return service;
  }

  private buildFindAllQuery(
    organizationId: string,
    query: WorkflowExecutionQueryDto,
  ): PrismaFindAllInput {
    const match: Record<string, unknown> = {
      isDeleted: false,
      organizationId: organizationId,
    };

    if (query.workflowId) {
      match.workflowId = query.workflowId;
    }

    if (query.brandId) {
      match.workflow = {
        brandId: query.brandId,
        isDeleted: false,
        organizationId,
      };
    }

    if (query.status) {
      match.status = query.status;
    }

    if (query.trigger) {
      match.trigger = query.trigger;
    }

    return {
      include: {
        workflow: { select: { description: true, id: true, label: true } },
      },
      orderBy: handleQuerySort(query.sort),
      where: match,
    };
  }

  @Get()
  @ApiOperation({ summary: 'List all workflow executions' })
  @ApiQuery({
    description: 'Filter by workflow ID',
    name: 'workflowId',
    required: false,
  })
  @ApiQuery({
    description: 'Filter by status',
    name: 'status',
    required: false,
  })
  @ApiQuery({
    description: 'Number of results',
    name: 'limit',
    required: false,
  })
  @ApiQuery({ description: 'Skip results', name: 'offset', required: false })
  @ApiResponse({ description: 'List of executions', status: 200 })
  async findAll(
    @Req() req: Request,
    @CurrentUser() user: User,
    @Query() query: WorkflowExecutionQueryDto,
    @Query('limit') limit?: string | number,
    @Query('offset') offset?: string | number,
  ) {
    const parsedLimit =
      limit !== undefined ? Number(limit) : (query.limit ?? undefined);
    const parsedOffset = offset !== undefined ? Number(offset) : 0;
    const result = await this.workflowExecutionsService.findAll(
      this.buildFindAllQuery(user.organizationId, query),
      {
        customLabels,
        ...QueryDefaultsUtil.getPaginationDefaults({
          ...query,
          limit:
            parsedLimit !== undefined && !Number.isNaN(parsedLimit)
              ? parsedLimit
              : 20,
        }),
        offset: !Number.isNaN(parsedOffset) ? parsedOffset : 0,
      },
    );
    return serializeCollection(req, WorkflowExecutionSerializer, result);
  }

  @Get('admin/failures')
  @RolesDecorator('superadmin')
  @ApiOperation({ summary: 'List agent failures across organizations' })
  async findAdminFailures(
    @Req() req: Request,
    @CurrentUser() user: User,
    @Query() query: AgentFailureQueryDto,
  ) {
    if (!getIsSuperAdmin(user, req)) {
      throw new ForbiddenException(
        'Only platform superadmins can access agent failures',
      );
    }
    if (query.offset % query.limit !== 0) {
      throw new BadRequestException('Offset must be a multiple of limit');
    }
    const result = await this.workflowExecutionsService.findAll(
      {
        include: { workflow: { select: { id: true, label: true } } },
        orderBy: [{ completedAt: 'desc' }, { id: 'desc' }],
        // tenant-scope-ignore: superadmin-only cross-tenant failure feed; both execution and workflow must be non-deleted
        where: {
          isDeleted: false,
          status: WorkflowExecutionStatus.FAILED,
          ...(query.failureReason
            ? query.failureReason === AgentFailureReason.UNKNOWN
              ? {
                  OR: [
                    { failureReason: AgentFailureReason.UNKNOWN },
                    { failureReason: null },
                  ],
                }
              : { failureReason: query.failureReason }
            : {}),
          workflow: {
            is: {
              isDeleted: false,
              AND: [
                {
                  metadata: {
                    path: ['sourceType'],
                    equals: HIDDEN_SYSTEM_WORKFLOW_SOURCE_TYPE,
                  },
                },
                {
                  metadata: {
                    path: ['systemWorkflow', 'visibility'],
                    equals: 'internal',
                  },
                },
                {
                  metadata: {
                    path: ['systemWorkflow', 'duplicable'],
                    equals: false,
                  },
                },
                {
                  OR: AGENT_CONVERSATION_WORKFLOW_IDS.map((canonicalId) => ({
                    metadata: {
                      path: ['systemWorkflow', 'canonicalId'],
                      equals: canonicalId,
                    },
                  })),
                },
              ],
            },
          },
        },
      },
      {
        customLabels,
        limit: query.limit,
        page: Math.floor(query.offset / query.limit) + 1,
      },
    );
    return serializeCollection(req, WorkflowExecutionSerializer, result);
  }

  @Get('workflow/:workflowId/stats')
  @ApiOperation({ summary: 'Get execution statistics for a workflow' })
  @ApiParam({ description: 'Workflow ID', name: 'workflowId' })
  @ApiResponse({ description: 'Execution statistics', status: 200 })
  getExecutionStats(
    @CurrentUser() user: User,
    @Param('workflowId') workflowId: string,
  ) {
    return this.workflowExecutionsService.getExecutionStats(
      workflowId,
      user.organizationId,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a specific execution by ID' })
  @ApiParam({ description: 'Execution ID', name: 'id' })
  @ApiResponse({ description: 'Execution details', status: 200 })
  @ApiResponse({ description: 'Execution not found', status: 404 })
  async findOne(
    @Req() req: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
  ) {
    const execution = await this.workflowExecutionsService.findOne({
      id: id,
      organizationId: user.organizationId,
    });
    return serializeSingle(req, WorkflowExecutionSerializer, execution);
  }

  @Post()
  @RolesDecorator(MemberRole.OWNER, MemberRole.ADMIN, MemberRole.CREATOR)
  @ApiOperation({ summary: 'Create and start a new workflow execution' })
  @ApiResponse({ description: 'Execution created', status: 201 })
  async create(
    @Req() req: Request,
    @CurrentUser() user: User,
    @Body() dto: CreateWorkflowExecutionDto,
  ) {
    const scope = await this.workflowExecutionAuthorizationService.authorize({
      expectedContextVersion: dto.expectedContextVersion,
      organizationId: user.organizationId,
      requestedBrandId: user.brandId || undefined,
      threadId: dto.threadId,
      userId: user.userId ?? user.id,
      workflowId: dto.workflowId,
    });
    const result = await this.workflowExecutorService.executeManualWorkflow(
      dto.workflowId,
      user.userId ?? user.id,
      user.organizationId,
      dto.inputValues ?? {},
      dto.metadata,
      dto.trigger,
      scope,
    );
    const execution = await this.workflowExecutionsService.findOne({
      id: result.executionId,
      organizationId: user.organizationId,
    });
    return serializeSingle(req, WorkflowExecutionSerializer, execution);
  }

  @Patch(':id')
  @RolesDecorator(MemberRole.OWNER, MemberRole.ADMIN, MemberRole.CREATOR)
  @ApiOperation({ summary: 'Update an execution (cancel a running execution)' })
  @ApiParam({ description: 'Execution ID', name: 'id' })
  @ApiResponse({ description: 'Execution updated', status: 200 })
  @ApiResponse({ description: 'Execution not found', status: 404 })
  async update(
    @Req() req: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: UpdateWorkflowExecutionDto,
  ) {
    // Verify ownership first
    const execution = await this.workflowExecutionsService.findOne({
      id: id,
      organizationId: user.organizationId,
    });

    if (!execution) {
      throw new NotFoundException('Execution');
    }

    // Collapsed from the former `POST /:id/cancel` RPC route (#1354). The only
    // supported transition on this surface is cancellation.
    if (dto.status !== WorkflowExecutionStatus.CANCELLED) {
      throw new BadRequestException(
        'Only cancellation (status: cancelled) is supported',
      );
    }

    const cancelled = await this.workflowExecutionsService.cancelExecution(id);
    return serializeSingle(req, WorkflowExecutionSerializer, cancelled);
  }
}
