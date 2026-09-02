import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { AgentWorkflowsService } from '@api/workflows/agent-workflows.service';
import { CreateAgentWorkflowDto } from '@api/workflows/dto/create-agent-workflow.dto';
import { PatchAgentWorkflowDto } from '@api/workflows/dto/patch-agent-workflow.dto';
import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
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
    return this.agentWorkflowsService.createWorkflow(
      user.userId ?? user.id,
      user.organizationId,
      dto,
    );
  }

  @Get(':workflowId')
  @ApiOperation({ summary: 'Get an agent workflow state machine' })
  async getWorkflow(
    @Param('workflowId') workflowId: string,
    @CurrentUser() user: User,
  ) {
    return this.agentWorkflowsService.getWorkflow(
      workflowId,
      user.organizationId,
    );
  }

  @Patch(':workflowId')
  @ApiOperation({
    summary: 'Apply an event to an agent workflow state machine',
  })
  async applyEvent(
    @Param('workflowId') workflowId: string,
    @Body() dto: PatchAgentWorkflowDto,
    @CurrentUser() user: User,
  ) {
    return {
      workflow: await this.agentWorkflowsService.applyEvent(
        workflowId,
        user.organizationId,
        dto,
      ),
    };
  }
}
