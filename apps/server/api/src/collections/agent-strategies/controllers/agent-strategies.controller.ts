import { AgentStrategiesQueryDto } from '@api/collections/agent-strategies/dto/agent-strategies-query.dto';
import { CreateAgentStrategyDto } from '@api/collections/agent-strategies/dto/create-agent-strategy.dto';
import { UpdateAgentStrategyDto } from '@api/collections/agent-strategies/dto/update-agent-strategy.dto';
import {
  AgentStrategy,
  type AgentStrategyDocument,
} from '@api/collections/agent-strategies/schemas/agent-strategy.schema';
import { AgentStrategiesService } from '@api/collections/agent-strategies/services/agent-strategies.service';
import { AgentStrategyAutopilotService } from '@api/collections/agent-strategies/services/agent-strategy-autopilot.service';
import { AgentStrategyReportsService } from '@api/collections/agent-strategies/services/agent-strategy-reports.service';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { getPublicMetadata } from '@api/helpers/utils/clerk/clerk.util';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { handleQuerySort } from '@api/helpers/utils/sort/sort.util';
import { BaseCRUDController } from '@api/shared/controllers/base-crud/base-crud.controller';
import type { User } from '@clerk/backend';
import { AgentStrategySerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Req,
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
    public readonly loggerService: LoggerService,
  ) {
    super(
      loggerService,
      agentStrategiesService,
      AgentStrategySerializer,
      AgentStrategy.name,
      ['organization', 'brand', 'user'],
    );
  }

  public buildFindAllPipeline(
    user: User,
    query: AgentStrategiesQueryDto,
  ): Record<string, unknown>[] {
    const publicMetadata = getPublicMetadata(user);
    const match: Record<string, unknown> = {
      isDeleted: query.isDeleted ?? false,
    };

    const organizationId = publicMetadata.organization?.toString();
    if (organizationId) {
      match.organization = organizationId;
    }

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

    const pipeline: Record<string, unknown>[] = [
      { $match: match },
      { $sort: handleQuerySort(query.sort) },
    ];

    return pipeline;
  }

  public canUserModifyEntity(
    user: User,
    entity: AgentStrategyDocument,
  ): boolean {
    const publicMetadata = getPublicMetadata(user);

    const entityOrganizationId =
      (entity.organization as unknown as { _id: string })?._id?.toString() ||
      entity.organization?.toString();

    if (
      entityOrganizationId &&
      publicMetadata.organization &&
      entityOrganizationId === publicMetadata.organization
    ) {
      return true;
    }

    return Boolean(publicMetadata?.isSuperAdmin);
  }

  @Post(':id/toggle')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Toggle strategy active state' })
  @ApiResponse({ description: 'Strategy toggled', status: 200 })
  async toggleActive(
    @Req() request: Request,
    @Param('id') id: string,
    @CurrentUser() user: User,
  ) {
    const publicMetadata = getPublicMetadata(user);
    const strategy = await this.agentStrategiesService.toggleActive(
      id,
      publicMetadata.organization,
    );

    if (!strategy) {
      throw new NotFoundException('Strategy not found');
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
    const publicMetadata = getPublicMetadata(user);
    const strategy = await this.agentStrategiesService.findOneById(
      id,
      publicMetadata.organization,
    );

    if (!strategy) {
      throw new NotFoundException('Strategy not found');
    }

    await this.agentStrategiesService.patch(id, {
      nextRunAt: new Date(),
    } as UpdateAgentStrategyDto);

    return {
      message:
        'Proactive run queued. It will execute on the next minute cycle.',
    };
  }

  @Post(':id/plan-now')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Force a planning cycle for this strategy' })
  async planNow(
    @Param('id') id: string,
    @CurrentUser() user: User,
  ): Promise<{ message: string }> {
    return this.runNow(id, user);
  }

  @Post(':id/report-now')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Generate a strategy report immediately' })
  async reportNow(@Param('id') id: string, @CurrentUser() user: User) {
    const publicMetadata = getPublicMetadata(user);
    return this.agentStrategyAutopilotService.generateStrategyReport(
      id,
      publicMetadata.organization,
      'daily',
    );
  }

  @Get(':id/performance-snapshot')
  @ApiOperation({ summary: 'Fetch the latest autopilot performance snapshot' })
  async performanceSnapshot(
    @Param('id') id: string,
    @CurrentUser() user: User,
  ) {
    const publicMetadata = getPublicMetadata(user);
    return this.agentStrategyAutopilotService.getPerformanceSnapshot(
      id,
      publicMetadata.organization,
    );
  }

  @Get(':id/opportunities')
  @ApiOperation({ summary: 'Refresh and list strategy opportunities' })
  async listOpportunities(@Param('id') id: string, @CurrentUser() user: User) {
    const publicMetadata = getPublicMetadata(user);
    return this.agentStrategyAutopilotService.listStrategyOpportunities(
      id,
      publicMetadata.organization,
    );
  }

  @Get(':id/reports')
  @ApiOperation({ summary: 'List strategy report history' })
  async listReports(@Param('id') id: string, @CurrentUser() user: User) {
    const publicMetadata = getPublicMetadata(user);
    return this.agentStrategyReportsService.listByStrategy(
      id,
      publicMetadata.organization,
    );
  }
}
