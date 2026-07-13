import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import {
  CreateWorkflowExecutionDto,
  UpdateWorkflowExecutionDto,
  WorkflowExecutionQueryDto,
} from '@api/collections/workflow-executions/dto/create-workflow-execution.dto';
import { WorkflowExecutionsService } from '@api/collections/workflow-executions/services/workflow-executions.service';
import { WorkflowExecutionAuthorizationService } from '@api/collections/workflows/services/workflow-execution-authorization.service';
import { WorkflowExecutorService } from '@api/collections/workflows/services/workflow-executor.service';
import { RolesDecorator } from '@api/helpers/decorators/roles/roles.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { getPublicMetadata } from '@api/helpers/utils/auth/auth.util';
import { customLabels } from '@api/helpers/utils/pagination/pagination.util';
import { QueryDefaultsUtil } from '@api/helpers/utils/query-defaults/query-defaults.util';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { handleQuerySort } from '@api/helpers/utils/sort/sort.util';
import type { PrismaFindAllInput } from '@api/shared/services/base/base.service';
import { MemberRole, WorkflowExecutionStatus } from '@genfeedai/enums';
import { WorkflowExecutionSerializer } from '@genfeedai/serializers';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
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
    private readonly workflowExecutorService: WorkflowExecutorService,
  ) {}

  private buildFindAllQuery(
    organizationId: string,
    query: WorkflowExecutionQueryDto,
  ): PrismaFindAllInput {
    const match: Record<string, unknown> = {
      isDeleted: false,
      organization: organizationId,
    };

    if (query.workflow) {
      match.workflow = query.workflow;
    }

    if (query.status) {
      match.status = query.status;
    }

    if (query.trigger) {
      match.trigger = query.trigger;
    }

    return {
      orderBy: handleQuerySort(query.sort),
      where: match,
    };
  }

  @Get()
  @ApiOperation({ summary: 'List all workflow executions' })
  @ApiQuery({
    description: 'Filter by workflow ID',
    name: 'workflow',
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
    const publicMetadata = getPublicMetadata(user);
    const parsedLimit =
      limit !== undefined ? Number(limit) : (query.limit ?? undefined);
    const parsedOffset = offset !== undefined ? Number(offset) : 0;
    const result = await this.workflowExecutionsService.findAll(
      this.buildFindAllQuery(publicMetadata.organization, query),
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

  @Get('workflow/:workflowId/stats')
  @ApiOperation({ summary: 'Get execution statistics for a workflow' })
  @ApiParam({ description: 'Workflow ID', name: 'workflowId' })
  @ApiResponse({ description: 'Execution statistics', status: 200 })
  getExecutionStats(
    @CurrentUser() user: User,
    @Param('workflowId') workflowId: string,
  ) {
    const publicMetadata = getPublicMetadata(user);
    return this.workflowExecutionsService.getExecutionStats(
      workflowId,
      publicMetadata.organization,
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
    const publicMetadata = getPublicMetadata(user);
    const execution = await this.workflowExecutionsService.findOne({
      _id: id,
      isDeleted: false,
      organization: publicMetadata.organization,
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
    const publicMetadata = getPublicMetadata(user);
    const scope = await this.workflowExecutionAuthorizationService.authorize({
      expectedContextVersion: dto.expectedContextVersion,
      organizationId: publicMetadata.organization,
      requestedBrandId: publicMetadata.brand || undefined,
      threadId: dto.threadId,
      userId: publicMetadata.user,
      workflowId: dto.workflow.toString(),
    });
    const result = await this.workflowExecutorService.executeManualWorkflow(
      dto.workflow.toString(),
      publicMetadata.user,
      publicMetadata.organization,
      dto.inputValues ?? {},
      dto.metadata,
      dto.trigger,
      scope,
    );
    const execution = await this.workflowExecutionsService.findOne({
      _id: result.executionId,
      isDeleted: false,
      organization: publicMetadata.organization,
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
    const publicMetadata = getPublicMetadata(user);
    // Verify ownership first
    const execution = await this.workflowExecutionsService.findOne({
      _id: id,
      isDeleted: false,
      organization: publicMetadata.organization,
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
