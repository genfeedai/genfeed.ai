import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { WorkflowExecutionsService } from '@api/collections/workflow-executions/services/workflow-executions.service';
import { ExecuteWorkflowBatchDto } from '@api/collections/workflows/dto/execute-workflow.dto';
import { BatchWorkflowExecutionService } from '@api/collections/workflows/services/batch-workflow-execution.service';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { RolesDecorator } from '@api/helpers/decorators/roles/roles.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { MemberRole } from '@genfeedai/enums';
import type { JsonApiSingleResponse } from '@genfeedai/interfaces';
import { WorkflowExecutionSerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import { Body, Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';

@AutoSwagger()
@Controller('workflows')
@UseGuards(RolesGuard)
export class WorkflowBatchController {
  constructor(
    private readonly batchWorkflowExecutionService: BatchWorkflowExecutionService,
    private readonly workflowExecutionsService: WorkflowExecutionsService,
    readonly _loggerService: LoggerService,
  ) {}

  @Post(':workflowId/executions/batch')
  @RolesDecorator(MemberRole.OWNER, MemberRole.ADMIN, MemberRole.CREATOR)
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async startBatchExecution(
    @Req() request: Request,
    @Param('workflowId') workflowId: string,
    @Body() body: ExecuteWorkflowBatchDto,
    @CurrentUser() user: User,
  ): Promise<JsonApiSingleResponse> {
    const executionId =
      await this.batchWorkflowExecutionService.startBatchExecution({
        ingredientIds: body.ingredientIds,
        organizationId: user.organizationId,
        userId: user.userId ?? user.id,
        workflowId,
      });
    const execution = await this.workflowExecutionsService.findOne({
      id: executionId,
      organizationId: user.organizationId,
    });
    return serializeSingle(request, WorkflowExecutionSerializer, execution);
  }
}
