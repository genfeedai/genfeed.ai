import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { CancelAgentRunDto } from '@api/collections/workflow-executions/dto/create-workflow-execution.dto';
import { buildCancellableAgentRunWhere } from '@api/collections/workflow-executions/services/workflow-execution-query.util';
import { WorkflowExecutionsService } from '@api/collections/workflow-executions/services/workflow-executions.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { FeatureFlag } from '@api/feature-flag/feature-flag.decorator';
import { RolesDecorator } from '@api/helpers/decorators/roles/roles.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { MemberRole } from '@genfeedai/contracts';
import { WorkflowExecutionSerializer } from '@genfeedai/serializers';
import { Body, Controller, Param, Patch, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';

/**
 * Stop in the agent chat. It does not carry the automation module policy that
 * `PATCH /workflow-executions/:id` does: stopping a run the person started
 * themselves must keep working when the automation platform switch is off, or
 * the turn runs on and keeps spending credits.
 */
@ApiTags('Agent Runs')
@ApiBearerAuth()
@FeatureFlag('agent')
@Controller('agent/runs')
@UseGuards(RolesGuard)
export class AgentRunCancelController {
  constructor(
    private readonly workflowExecutionsService: WorkflowExecutionsService,
  ) {}

  @Patch(':id')
  @RolesDecorator(MemberRole.OWNER, MemberRole.ADMIN, MemberRole.CREATOR)
  @ApiOperation({ summary: 'Cancel the caller’s own running agent run' })
  @ApiParam({ description: 'Agent run (execution) ID', name: 'id' })
  @ApiResponse({ description: 'Run cancelled', status: 200 })
  @ApiResponse({ description: 'Run not found', status: 404 })
  async cancel(
    @Req() req: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() _dto: CancelAgentRunDto,
  ) {
    const run = await this.workflowExecutionsService.findOneSelect(
      buildCancellableAgentRunWhere(
        user.organizationId,
        user.userId ?? user.id,
        id,
      ),
      { id: true },
    );
    if (!run) {
      throw new NotFoundException('Agent run');
    }

    const cancelled = await this.workflowExecutionsService.cancelExecution(
      id,
      user.organizationId,
    );
    return serializeSingle(req, WorkflowExecutionSerializer, cancelled);
  }
}
