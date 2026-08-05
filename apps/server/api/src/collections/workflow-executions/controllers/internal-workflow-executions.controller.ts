import {
  CreateWorkflowExecutionDto,
  UpdateWorkflowExecutionDto,
} from '@api/collections/workflow-executions/dto/create-workflow-execution.dto';
import { WorkflowExecutionsService } from '@api/collections/workflow-executions/services/workflow-executions.service';
import { WorkflowExecutorService } from '@api/collections/workflows/services/workflow-executor.service';
import { WorkflowsService } from '@api/collections/workflows/services/workflows.service';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import { AdminApiKeyGuard } from '@api/helpers/guards/admin-api-key/admin-api-key.guard';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { WorkflowExecutionStatus } from '@genfeedai/enums';
import { WorkflowExecutionSerializer } from '@genfeedai/serializers';
import { Public } from '@libs/decorators/public.decorator';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';

@Controller('internal/orgs/:orgId/workflow-executions')
@Public()
@UseGuards(AdminApiKeyGuard)
export class InternalWorkflowExecutionsController {
  constructor(
    private readonly workflowExecutorService: WorkflowExecutorService,
    private readonly workflowExecutionsService: WorkflowExecutionsService,
    private readonly workflowsService: WorkflowsService,
  ) {}

  @Post()
  async create(
    @Req() req: Request,
    @Param('orgId') orgId: string,
    @Body() dto: CreateWorkflowExecutionDto,
  ) {
    const workflow = await this.workflowsService.findOne({
      id: dto.workflowId,
      isDeleted: false,
      organizationId: orgId,
    });

    // An ownerless system template cannot be executed through this route.
    const userId = workflow?.userId;

    if (!userId) {
      throw new NotFoundException('Workflow');
    }

    const result = await this.workflowExecutorService.executeManualWorkflow(
      dto.workflowId,
      userId,
      orgId,
      dto.inputValues ?? {},
      dto.metadata,
      dto.trigger,
    );
    const execution = await this.workflowExecutionsService.findOne({
      id: result.executionId,
      isDeleted: false,
      organizationId: orgId,
    });

    return serializeSingle(req, WorkflowExecutionSerializer, execution);
  }

  @Get(':id')
  async findOne(
    @Req() req: Request,
    @Param('orgId') orgId: string,
    @Param('id') id: string,
  ) {
    const execution = await this.workflowExecutionsService.findOne({
      id: id,
      isDeleted: false,
      organizationId: orgId,
    });

    if (!execution) {
      throw new NotFoundException('Execution');
    }

    return serializeSingle(req, WorkflowExecutionSerializer, execution);
  }

  @Patch(':id')
  async update(
    @Req() req: Request,
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Body() dto: UpdateWorkflowExecutionDto,
  ) {
    const execution = await this.workflowExecutionsService.findOne({
      id: id,
      isDeleted: false,
      organizationId: orgId,
    });

    if (!execution) {
      throw new NotFoundException('Execution');
    }

    // Collapsed from the former `POST /:id/cancel` RPC route (#1354), kept in
    // lockstep with the public controller. Only cancellation is supported.
    if (dto.status !== WorkflowExecutionStatus.CANCELLED) {
      throw new BadRequestException(
        'Only cancellation (status: cancelled) is supported',
      );
    }

    const cancelled = await this.workflowExecutionsService.cancelExecution(id);
    return serializeSingle(req, WorkflowExecutionSerializer, cancelled);
  }
}
