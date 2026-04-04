import {
  CreateWorkflowExecutionDto,
  WorkflowExecutionQueryDto,
} from '@api/collections/workflow-executions/dto/create-workflow-execution.dto';
import { WorkflowExecutionsService } from '@api/collections/workflow-executions/services/workflow-executions.service';
import { WorkflowExecutorService } from '@api/collections/workflows/services/workflow-executor.service';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { getPublicMetadata } from '@api/helpers/utils/clerk/clerk.util';
import { customLabels } from '@api/helpers/utils/pagination/pagination.util';
import { QueryDefaultsUtil } from '@api/helpers/utils/query-defaults/query-defaults.util';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { handleQuerySort } from '@api/helpers/utils/sort/sort.util';
import type { User } from '@clerk/backend';
import { WorkflowExecutionSerializer } from '@genfeedai/serializers';
import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
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
import { PipelineStage, Types } from 'mongoose';

@ApiTags('Workflow Executions')
@ApiBearerAuth()
@Controller('workflow-executions')
export class WorkflowExecutionsController {
  constructor(
    private readonly workflowExecutionsService: WorkflowExecutionsService,
    private readonly workflowExecutorService: WorkflowExecutorService,
  ) {}

  private buildFindAllPipeline(
    organizationId: string,
    query: WorkflowExecutionQueryDto,
  ): PipelineStage[] {
    const match: Record<string, unknown> = {
      isDeleted: false,
      organization: new Types.ObjectId(organizationId),
    };

    if (query.workflow) {
      match.workflow = new Types.ObjectId(query.workflow);
    }

    if (query.status) {
      match.status = query.status;
    }

    if (query.trigger) {
      match.trigger = query.trigger;
    }

    return [{ $match: match }, { $sort: handleQuerySort(query.sort) }];
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
      this.buildFindAllPipeline(publicMetadata.organization, query),
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

  @Get('workflow/:workflowId')
  @ApiOperation({ summary: 'Get executions for a specific workflow' })
  @ApiParam({ description: 'Workflow ID', name: 'workflowId' })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'offset', required: false })
  @ApiResponse({ description: 'List of workflow executions', status: 200 })
  async getWorkflowExecutions(
    @Req() req: Request,
    @CurrentUser() user: User,
    @Param('workflowId') workflowId: string,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ) {
    const publicMetadata = getPublicMetadata(user);
    const docs = await this.workflowExecutionsService.getWorkflowExecutions(
      workflowId,
      publicMetadata.organization,
      limit || 20,
      offset || 0,
    );
    return serializeCollection(req, WorkflowExecutionSerializer, { docs });
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
  @ApiOperation({ summary: 'Create and start a new workflow execution' })
  @ApiResponse({ description: 'Execution created', status: 201 })
  async create(
    @Req() req: Request,
    @CurrentUser() user: User,
    @Body() dto: CreateWorkflowExecutionDto,
  ) {
    const publicMetadata = getPublicMetadata(user);
    const result = await this.workflowExecutorService.executeManualWorkflow(
      dto.workflow.toString(),
      publicMetadata.user,
      publicMetadata.organization,
      dto.inputValues ?? {},
      dto.metadata,
      dto.trigger,
    );
    const execution = await this.workflowExecutionsService.findOne({
      _id: result.executionId,
      isDeleted: false,
      organization: publicMetadata.organization,
    });
    return serializeSingle(req, WorkflowExecutionSerializer, execution);
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Cancel a running execution' })
  @ApiParam({ description: 'Execution ID', name: 'id' })
  @ApiResponse({ description: 'Execution cancelled', status: 200 })
  @ApiResponse({ description: 'Execution not found', status: 404 })
  async cancel(
    @Req() req: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
  ) {
    const publicMetadata = getPublicMetadata(user);
    // Verify ownership first
    const execution = await this.workflowExecutionsService.findOne({
      _id: id,
      isDeleted: false,
      organization: publicMetadata.organization,
    });

    if (!execution) {
      throw new NotFoundException('Execution not found');
    }

    const cancelled = await this.workflowExecutionsService.cancelExecution(id);
    return serializeSingle(req, WorkflowExecutionSerializer, cancelled);
  }
}
