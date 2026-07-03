import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { CreateAgentGoalDto } from '@api/collections/agent-goals/dto/create-agent-goal.dto';
import { UpdateAgentGoalDto } from '@api/collections/agent-goals/dto/update-agent-goal.dto';
import { AgentGoalsService } from '@api/collections/agent-goals/services/agent-goals.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { UsersService } from '@api/collections/users/services/users.service';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { getPublicMetadata } from '@api/helpers/utils/auth/auth.util';
import { ErrorResponse } from '@api/helpers/utils/error-response/error-response.util';
import {
  AgentOrchestratorService,
  type AgentPageContext,
} from '@api/services/agent-orchestrator/agent-orchestrator.service';
import { AGENT_MODEL_TURN_COSTS } from '@api/services/agent-orchestrator/constants/agent-credit-costs.constant';
import { LoggerService } from '@libs/logger/logger.service';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

interface AgentChatAttachment {
  ingredientId: string;
  url: string;
  kind?: string;
  name?: string;
}

interface AgentChatBody {
  content: string;
  pageContext?: AgentPageContext;
  planModeEnabled?: boolean;
  threadId?: string;
  model?: string;
  source?: 'agent' | 'proactive' | 'onboarding';
  attachments?: AgentChatAttachment[];
}

@ApiTags('Agent')
@Controller('agent')
export class AgentOrchestratorController {
  constructor(
    private readonly orchestratorService: AgentOrchestratorService,
    private readonly creditsUtilsService: CreditsUtilsService,
    private readonly agentGoalsService: AgentGoalsService,
    private readonly usersService: UsersService,
    private readonly loggerService: LoggerService,
  ) {}

  @Post('threads/turns')
  @ApiOperation({ summary: 'Start an agent turn in a new or provided thread' })
  async createTurn(
    @Body() body: AgentChatBody,
    @CurrentUser() user: User,
    @Headers('authorization') authorization?: string,
  ) {
    return this.runAgentTurn(body, user, authorization);
  }

  @Post('threads/:threadId/turns')
  @ApiOperation({ summary: 'Start an agent turn in a thread' })
  async createThreadTurn(
    @Param('threadId') threadId: string,
    @Body() body: AgentChatBody,
    @CurrentUser() user: User,
    @Headers('authorization') authorization?: string,
  ) {
    return this.runAgentTurn(body, user, authorization, threadId);
  }

  @Post('threads/turns/stream')
  @ApiOperation({
    summary: 'Start a streaming agent turn in a new or provided thread',
  })
  async createTurnStream(
    @Body() body: AgentChatBody,
    @CurrentUser() user: User,
    @Headers('authorization') authorization?: string,
  ) {
    return this.runAgentTurnStream(body, user, authorization);
  }

  @Post('threads/:threadId/turns/stream')
  @ApiOperation({ summary: 'Start a streaming agent turn in a thread' })
  async createThreadTurnStream(
    @Param('threadId') threadId: string,
    @Body() body: AgentChatBody,
    @CurrentUser() user: User,
    @Headers('authorization') authorization?: string,
  ) {
    return this.runAgentTurnStream(body, user, authorization, threadId);
  }

  private async runAgentTurn(
    body: AgentChatBody,
    user: User,
    authorization?: string,
    routeThreadId?: string,
  ) {
    try {
      const request = this.resolveAgentChatBody(body, routeThreadId);
      const organization = this.resolveOrganizationId(user);
      const dbUserId = await this.resolveMongoUserId(user);
      const authToken = authorization?.replace('Bearer ', '');

      const result = await this.orchestratorService.chat(request, {
        authToken,
        organizationId: organization,
        userId: dbUserId,
      });

      return result;
    } catch (error: unknown) {
      return ErrorResponse.handle(error, this.loggerService, 'agentChat');
    }
  }

  private async runAgentTurnStream(
    body: AgentChatBody,
    user: User,
    authorization?: string,
    routeThreadId?: string,
  ) {
    try {
      const request = this.resolveAgentChatBody(body, routeThreadId);
      const organization = this.resolveOrganizationId(user);
      const dbUserId = await this.resolveMongoUserId(user);
      const authToken = authorization?.replace('Bearer ', '');

      const result = await this.orchestratorService.chatStream(request, {
        authToken,
        organizationId: organization,
        userId: dbUserId,
      });

      return result;
    } catch (error: unknown) {
      return ErrorResponse.handle(error, this.loggerService, 'agentChatStream');
    }
  }

  private resolveAgentChatBody(
    body: AgentChatBody,
    routeThreadId?: string,
  ): AgentChatBody {
    if (routeThreadId && body.threadId && body.threadId !== routeThreadId) {
      throw new BadRequestException(
        'Request body threadId must match route threadId.',
      );
    }

    return {
      attachments: body.attachments,
      content: body.content,
      model: body.model,
      pageContext: body.pageContext,
      planModeEnabled: body.planModeEnabled,
      source: body.source,
      threadId: routeThreadId ?? body.threadId,
    };
  }

  @Get('credits')
  @ApiOperation({ summary: 'Get credits balance and model costs' })
  async getCredits(@CurrentUser() user: User) {
    try {
      const organization = this.resolveOrganizationId(user);
      const balance =
        await this.creditsUtilsService.getOrganizationCreditsBalance(
          organization,
        );

      return {
        balance,
        modelCosts: AGENT_MODEL_TURN_COSTS,
      };
    } catch (error: unknown) {
      return ErrorResponse.handle(error, this.loggerService, 'agentGetCredits');
    }
  }

  @Get('goals')
  @ApiOperation({ summary: 'List agent goals for the current organization' })
  async listGoals(
    @CurrentUser() user: User,
    @Query('brandId') brandId?: string,
  ) {
    try {
      const organization = this.resolveOrganizationId(user);
      return await this.agentGoalsService.list(organization, brandId);
    } catch (error: unknown) {
      return ErrorResponse.handle(error, this.loggerService, 'agentListGoals');
    }
  }

  @Post('goals')
  @ApiOperation({
    summary: 'Create an agent goal for the current organization',
  })
  async createGoal(
    @Body() body: CreateAgentGoalDto,
    @CurrentUser() user: User,
  ) {
    try {
      const organization = this.resolveOrganizationId(user);
      const dbUserId = await this.resolveMongoUserId(user);
      return await this.agentGoalsService.create(body, organization, dbUserId);
    } catch (error: unknown) {
      return ErrorResponse.handle(error, this.loggerService, 'agentCreateGoal');
    }
  }

  @Get('goals/:goalId')
  @ApiOperation({ summary: 'Get current agent goal progress' })
  async getGoal(@Param('goalId') goalId: string, @CurrentUser() user: User) {
    try {
      const organization = this.resolveOrganizationId(user);
      return await this.agentGoalsService.refreshProgress(goalId, organization);
    } catch (error: unknown) {
      return ErrorResponse.handle(error, this.loggerService, 'agentGetGoal');
    }
  }

  @Patch('goals/:goalId')
  @ApiOperation({ summary: 'Update an agent goal' })
  async updateGoal(
    @Param('goalId') goalId: string,
    @Body() body: UpdateAgentGoalDto,
    @CurrentUser() user: User,
  ) {
    try {
      const organization = this.resolveOrganizationId(user);
      return await this.agentGoalsService.update(goalId, body, organization);
    } catch (error: unknown) {
      return ErrorResponse.handle(error, this.loggerService, 'agentUpdateGoal');
    }
  }

  private resolveOrganizationId(user: User): string {
    const { organization } = getPublicMetadata(user);
    if (!organization) {
      throw new UnauthorizedException(
        'Invalid organization context. Please sign in again.',
      );
    }
    return organization;
  }

  private async resolveMongoUserId(user: User): Promise<string> {
    const authProviderId = user.id;
    if (!authProviderId) {
      throw new UnauthorizedException(
        'Missing user identity. Please sign in again.',
      );
    }

    const { user: metadataUserId } = getPublicMetadata(user);
    if (metadataUserId) {
      const metadataUserDoc = await this.usersService.findOne(
        { _id: metadataUserId, authProviderId },
        [],
      );
      if (metadataUserDoc?.id) {
        return String(metadataUserDoc.id);
      }
    }

    const dbUser = await this.usersService.findOne({ authProviderId }, []);
    if (!dbUser?.id) {
      throw new UnauthorizedException('User account not found');
    }

    const mongoUserId = String(dbUser.id);
    if (!mongoUserId) {
      throw new UnauthorizedException('Invalid user account reference');
    }

    return mongoUserId;
  }
}
