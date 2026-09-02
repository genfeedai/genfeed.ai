import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { AgentStrategiesQueryDto } from '@api/collections/agent-strategies/dto/agent-strategies-query.dto';
import { CreateAgentStrategyDto } from '@api/collections/agent-strategies/dto/create-agent-strategy.dto';
import { RunAgentStrategyWorkflowDto } from '@api/collections/agent-strategies/dto/run-agent-strategy-workflow.dto';
import { UpdateAgentStrategyDto } from '@api/collections/agent-strategies/dto/update-agent-strategy.dto';
import type { AgentStrategyDocument } from '@api/collections/agent-strategies/schemas/agent-strategy.schema';
import { AgentStrategiesService } from '@api/collections/agent-strategies/services/agent-strategies.service';
import { AgentStrategyAutopilotService } from '@api/collections/agent-strategies/services/agent-strategy-autopilot.service';
import { AgentStrategyReportsService } from '@api/collections/agent-strategies/services/agent-strategy-reports.service';
import { AgentStrategyWorkflowRunService } from '@api/collections/agent-strategies/services/agent-strategy-workflow-run.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { handleQuerySort } from '@api/helpers/utils/sort/sort.util';
import { BaseCRUDController } from '@api/shared/controllers/base-crud/base-crud.controller';
import type { JsonApiSingleResponse } from '@genfeedai/contracts/interfaces';
import { AgentStrategySerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

@ApiTags('Agent Strategies')
@AutoSwagger()
@Controller('agent-strategies')
export class AgentStrategiesController extends BaseCRUDController<
  AgentStrategyDocument,
  CreateAgentStrategyDto,
  UpdateAgentStrategyDto,
  AgentStrategiesQueryDto
> {
  constructor(
    public readonly agentStrategiesService: AgentStrategiesService,
    private readonly agentStrategyAutopilotService: AgentStrategyAutopilotService,
    private readonly agentStrategyReportsService: AgentStrategyReportsService,
    private readonly agentStrategyWorkflowRunService: AgentStrategyWorkflowRunService,
    public readonly loggerService: LoggerService,
  ) {
    super(
      loggerService,
      agentStrategiesService,
      AgentStrategySerializer,
      'AgentStrategy',
      ['organization', 'brand', 'user'],
    );
  }

  public buildFindAllQuery(user: User, query: AgentStrategiesQueryDto) {
    const match: Record<string, unknown> = {
      isDeleted: query.isDeleted ?? false,
    };

    const organizationId = user.organizationId?.toString();
    if (!organizationId) {
      throw new UnauthorizedException('Organization not found');
    }
    match.organizationId = organizationId;

    if (query.platform) {
      match.platforms = query.platform;
    }

    if (query.isActive !== undefined) {
      match.isActive = query.isActive;
    }

    if (query.isEnabled !== undefined) {
      match.isEnabled = query.isEnabled;
    }

    if (query.agentType) {
      match.agentType = query.agentType;
    }

    if (query.brandId) {
      match.brandId = query.brandId;
    }

    return {
      orderBy: handleQuerySort(query.sort),
      where: match,
    };
  }

  public canUserModifyEntity(
    user: User,
    entity: AgentStrategyDocument,
  ): boolean {
    const entityOrganizationId = entity.organizationId;

    if (
      entityOrganizationId &&
      user.organizationId &&
      entityOrganizationId === user.organizationId
    ) {
      return true;
    }

    return Boolean(user?.isSuperAdmin);
  }

  /**
   * Update a strategy. Overrides the base handler so a change to `isActive`
   * runs through the service's scheduler resets (next-run queueing, failure
   * clearing) — rather than a plain field write. Any remaining fields fall
   * through to the default CRUD patch.
   */
  @Patch(':id')
  override async patch(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() updateDto: UpdateAgentStrategyDto,
  ): Promise<JsonApiSingleResponse> {
    if (typeof updateDto.isActive !== 'boolean') {
      return super.patch(request, user, id, updateDto);
    }

    const { isActive, ...rest } = updateDto;
    const strategy = await this.agentStrategiesService.setActive(
      id,
      user.organizationId,
      isActive,
    );

    if (!strategy) {
      throw new NotFoundException('Strategy');
    }

    // Apply any remaining fields via the default patch path.
    if (Object.keys(rest).length > 0) {
      return super.patch(request, user, id, rest as UpdateAgentStrategyDto);
    }

    return serializeSingle(request, AgentStrategySerializer, strategy);
  }

  @Post(':id/run-now')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Manually trigger a proactive run' })
  @ApiResponse({ description: 'Run triggered', status: 200 })
  async runNow(
    @Param('id') id: string,
    @CurrentUser() user: User,
  ): Promise<{ message: string }> {
    const strategy = await this.agentStrategiesService.findOneById(
      id,
      user.organizationId,
    );

    if (!strategy) {
      throw new NotFoundException('Strategy');
    }

    await this.agentStrategiesService.patch(id, {
      nextRunAt: new Date(),
    } as UpdateAgentStrategyDto);

    return {
      message:
        'Proactive run queued. It will execute on the next minute cycle.',
    };
  }

  @Get(':id/workflow-binding')
  @ApiOperation({
    summary:
      'Preview the deterministic workflow bound to this agent and filled input slots',
  })
  async workflowBinding(@Param('id') id: string, @CurrentUser() user: User) {
    return this.agentStrategyWorkflowRunService.preview(
      id,
      user.organizationId,
    );
  }

  @Post(':id/run-workflow')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Fill workflow inputs from the agent (topic/prompt/assets) and run the bound deterministic workflow',
  })
  @ApiResponse({ description: 'Workflow execution started', status: 200 })
  async runWorkflow(
    @Param('id') id: string,
    @CurrentUser() user: User,
    @Body() body: RunAgentStrategyWorkflowDto,
  ) {
    return this.agentStrategyWorkflowRunService.run(
      id,
      user.organizationId,
      user.id,
      body ?? {},
    );
  }

  @Post(':id/report-now')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Generate a strategy report immediately' })
  async reportNow(@Param('id') id: string, @CurrentUser() user: User) {
    return this.agentStrategyAutopilotService.generateStrategyReport(
      id,
      user.organizationId,
      'daily',
    );
  }

  @Get(':id/performance-snapshot')
  @ApiOperation({ summary: 'Fetch the latest autopilot performance snapshot' })
  async performanceSnapshot(
    @Param('id') id: string,
    @CurrentUser() user: User,
  ) {
    return this.agentStrategyAutopilotService.getPerformanceSnapshot(
      id,
      user.organizationId,
    );
  }

  @Get(':id/opportunities')
  @ApiOperation({ summary: 'Refresh and list strategy opportunities' })
  async listOpportunities(@Param('id') id: string, @CurrentUser() user: User) {
    return this.agentStrategyAutopilotService.listStrategyOpportunities(
      id,
      user.organizationId,
    );
  }

  @Get(':id/reports')
  @ApiOperation({ summary: 'List strategy report history' })
  async listReports(@Param('id') id: string, @CurrentUser() user: User) {
    return this.agentStrategyReportsService.listByStrategy(
      id,
      user.organizationId,
    );
  }
}
