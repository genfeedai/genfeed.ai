import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { getPublicMetadata } from '@api/helpers/utils/clerk/clerk.util';
import { AgentWorkflowsService } from '@api/workflows/agent-workflows.service';
import { CreateAgentWorkflowDto } from '@api/workflows/dto/create-agent-workflow.dto';
import { RollbackAgentWorkflowDto } from '@api/workflows/dto/rollback-agent-workflow.dto';
import { UpdateAgentWorkflowStateDto } from '@api/workflows/dto/update-agent-workflow-state.dto';
import type { User } from '@clerk/backend';
import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

@AutoSwagger()
@ApiTags('agent-workflows')
@ApiBearerAuth()
@Controller('agent-workflows')
export class AgentWorkflowsController {
  constructor(private readonly agentWorkflowsService: AgentWorkflowsService) {}

  @Post()
  @ApiOperation({ summary: 'Create an agent workflow state machine' })
  async createWorkflow(
    @Body() dto: CreateAgentWorkflowDto,
    @CurrentUser() user: User,
  ) {
    const publicMetadata = getPublicMetadata(user);
    return this.agentWorkflowsService.createWorkflow(
      publicMetadata.user,
      publicMetadata.organization,
      dto,
    );
  }

  @Get(':workflowId')
  @ApiOperation({ summary: 'Get an agent workflow state machine' })
  async getWorkflow(
    @Param('workflowId') workflowId: string,
    @CurrentUser() user: User,
  ) {
    const publicMetadata = getPublicMetadata(user);
    return this.agentWorkflowsService.getWorkflow(
      workflowId,
      publicMetadata.organization,
    );
  }

  @Post(':workflowId/transition')
  @ApiOperation({
    summary: 'Advance an agent workflow if gate conditions are met',
  })
  async transition(
    @Param('workflowId') workflowId: string,
    @Body() dto: UpdateAgentWorkflowStateDto,
    @CurrentUser() user: User,
  ) {
    const publicMetadata = getPublicMetadata(user);
    return {
      workflow: await this.agentWorkflowsService.transition(
        workflowId,
        publicMetadata.organization,
        'agent',
        dto,
      ),
    };
  }

  @Post(':workflowId/approve')
  @ApiOperation({
    summary: 'Approve the selected approach and enter implementing',
  })
  async approve(
    @Param('workflowId') workflowId: string,
    @Body() dto: UpdateAgentWorkflowStateDto,
    @CurrentUser() user: User,
  ) {
    const publicMetadata = getPublicMetadata(user);
    return {
      workflow: await this.agentWorkflowsService.approve(
        workflowId,
        publicMetadata.organization,
        dto,
      ),
    };
  }

  @Post(':workflowId/rollback')
  @ApiOperation({
    summary: 'Roll an agent workflow back to a previous phase',
  })
  async rollback(
    @Param('workflowId') workflowId: string,
    @Body() dto: RollbackAgentWorkflowDto,
    @CurrentUser() user: User,
  ) {
    const publicMetadata = getPublicMetadata(user);
    return {
      workflow: await this.agentWorkflowsService.rollback(
        workflowId,
        publicMetadata.organization,
        dto.targetPhase,
      ),
    };
  }

  @Post(':workflowId/force-advance')
  @ApiOperation({ summary: 'Bypass gate checks and force the next phase' })
  async forceAdvance(
    @Param('workflowId') workflowId: string,
    @CurrentUser() user: User,
  ) {
    const publicMetadata = getPublicMetadata(user);
    return {
      workflow: await this.agentWorkflowsService.forceAdvance(
        workflowId,
        publicMetadata.organization,
      ),
    };
  }
}
