import { CreateWorkflowExecutionDto } from '@api/collections/workflow-executions/dto/create-workflow-execution.dto';
import { WorkflowExecutionsService } from '@api/collections/workflow-executions/services/workflow-executions.service';
import { WorkflowExecutorService } from '@api/collections/workflows/services/workflow-executor.service';
import { WorkflowsService } from '@api/collections/workflows/services/workflows.service';
import { AdminApiKeyGuard } from '@api/helpers/guards/admin-api-key/admin-api-key.guard';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { WorkflowExecutionSerializer } from '@genfeedai/serializers';
import { Public } from '@libs/decorators/public.decorator';
import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { Types } from 'mongoose';

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
      _id: dto.workflow,
      isDeleted: false,
      organization: new Types.ObjectId(orgId),
    });

    if (!workflow?.user) {
      throw new NotFoundException('Workflow not found');
    }

    const result = await this.workflowExecutorService.executeManualWorkflow(
      dto.workflow.toString(),
      workflow.user.toString(),
      orgId,
      dto.inputValues ?? {},
      dto.metadata,
      dto.trigger,
    );
    const execution = await this.workflowExecutionsService.findOne({
      _id: result.executionId,
      isDeleted: false,
      organization: new Types.ObjectId(orgId),
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
      _id: id,
      isDeleted: false,
      organization: new Types.ObjectId(orgId),
    });

    if (!execution) {
      throw new NotFoundException('Execution not found');
    }

    return serializeSingle(req, WorkflowExecutionSerializer, execution);
  }

  @Post(':id/cancel')
  async cancel(
    @Req() req: Request,
    @Param('orgId') orgId: string,
    @Param('id') id: string,
  ) {
    const execution = await this.workflowExecutionsService.findOne({
      _id: id,
      isDeleted: false,
      organization: new Types.ObjectId(orgId),
    });

    if (!execution) {
      throw new NotFoundException('Execution not found');
    }

    const cancelled = await this.workflowExecutionsService.cancelExecution(id);
    return serializeSingle(req, WorkflowExecutionSerializer, cancelled);
  }
}
