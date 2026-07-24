import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { CreateAgentGoalDto } from '@api/collections/agent-goals/dto/create-agent-goal.dto';
import { UpdateAgentGoalDto } from '@api/collections/agent-goals/dto/update-agent-goal.dto';
import { AgentGoalsService } from '@api/collections/agent-goals/services/agent-goals.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { SocialInboxService } from '@api/collections/social-inbox/services/social-inbox.service';
import { UsersService } from '@api/collections/users/services/users.service';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { getPublicMetadata } from '@api/helpers/utils/auth/auth.util';
import { ErrorResponse } from '@api/helpers/utils/error-response/error-response.util';
import { AgentOrchestratorService } from '@api/services/agent-orchestrator/agent-orchestrator.service';
import { AGENT_MODEL_TURN_COSTS } from '@api/services/agent-orchestrator/constants/agent-credit-costs.constant';
import { AgentChatBodyDto } from '@api/services/agent-orchestrator/dto/agent-chat-body.dto';
import type { AgentPageContext } from '@api/services/agent-orchestrator/interfaces/agent-chat.interface';
import {
  authorizeResearchFindingReferences,
  isAuthorizedAnalyticsQueryReference,
} from '@api/services/agent-orchestrator/utils/agent-page-context-authorization.util';
import { LoggerService } from '@libs/logger/logger.service';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Optional,
  Param,
  Patch,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('Agent')
@Controller('agent')
export class AgentOrchestratorController {
  constructor(
    private readonly orchestratorService: AgentOrchestratorService,
    private readonly creditsUtilsService: CreditsUtilsService,
    private readonly agentGoalsService: AgentGoalsService,
    private readonly usersService: UsersService,
    private readonly loggerService: LoggerService,
    @Optional()
    private readonly socialInboxService?: SocialInboxService,
  ) {}

  @Post('threads/turns')
  @ApiOperation({ summary: 'Start an agent turn in a new or provided thread' })
  async createTurn(
    @Body() body: AgentChatBodyDto,
    @CurrentUser() user: User,
    @Headers('authorization') authorization?: string,
  ) {
    return this.runAgentTurn(body, user, authorization);
  }

  @Post('threads/:threadId/turns')
  @ApiOperation({ summary: 'Start an agent turn in a thread' })
  async createThreadTurn(
    @Param('threadId') threadId: string,
    @Body() body: AgentChatBodyDto,
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
    @Body() body: AgentChatBodyDto,
    @CurrentUser() user: User,
    @Headers('authorization') authorization?: string,
  ) {
    return this.runAgentTurnStream(body, user, authorization);
  }

  @Post('threads/:threadId/turns/stream')
  @ApiOperation({ summary: 'Start a streaming agent turn in a thread' })
  async createThreadTurnStream(
    @Param('threadId') threadId: string,
    @Body() body: AgentChatBodyDto,
    @CurrentUser() user: User,
    @Headers('authorization') authorization?: string,
  ) {
    return this.runAgentTurnStream(body, user, authorization, threadId);
  }

  private async runAgentTurn(
    body: AgentChatBodyDto,
    user: User,
    authorization?: string,
    routeThreadId?: string,
  ) {
    try {
      const request = this.resolveAgentChatBody(body, routeThreadId);
      const organization = this.resolveOrganizationId(user);
      const dbUserId = await this.resolveMongoUserId(user);
      const authorizedRequest = await this.resolveAuthorizedAgentChatBody(
        request,
        user,
        organization,
        dbUserId,
      );
      const authToken = authorization?.replace('Bearer ', '');

      const result = await this.orchestratorService.chat(authorizedRequest, {
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
    body: AgentChatBodyDto,
    user: User,
    authorization?: string,
    routeThreadId?: string,
  ) {
    try {
      const request = this.resolveAgentChatBody(body, routeThreadId);
      const organization = this.resolveOrganizationId(user);
      const dbUserId = await this.resolveMongoUserId(user);
      const authorizedRequest = await this.resolveAuthorizedAgentChatBody(
        request,
        user,
        organization,
        dbUserId,
      );
      const authToken = authorization?.replace('Bearer ', '');

      const result = await this.orchestratorService.chatStream(
        authorizedRequest,
        {
          authToken,
          organizationId: organization,
          userId: dbUserId,
        },
      );

      return result;
    } catch (error: unknown) {
      return ErrorResponse.handle(error, this.loggerService, 'agentChatStream');
    }
  }

  private resolveAgentChatBody(
    body: AgentChatBodyDto,
    routeThreadId?: string,
  ): AgentChatBodyDto {
    if (routeThreadId && body.threadId && body.threadId !== routeThreadId) {
      throw new BadRequestException(
        'Request body threadId must match route threadId.',
      );
    }

    const pageContext = body.pageContext ? { ...body.pageContext } : undefined;
    if (pageContext) {
      delete pageContext.authorizedSocialContext;
    }

    return {
      artifactReferences: body.artifactReferences,
      attachments: body.attachments,
      brandId: body.brandId,
      content: body.content,
      expectedContextVersion: body.expectedContextVersion,
      model: body.model,
      pageContext,
      planModeEnabled: body.planModeEnabled,
      source: body.source,
      threadId: routeThreadId ?? body.threadId,
    };
  }

  private async resolveAuthorizedAgentChatBody(
    body: AgentChatBodyDto,
    user: User,
    organizationId: string,
    userId: string,
  ): Promise<AgentChatBodyDto> {
    const pageContext = body.pageContext;
    if (!pageContext) {
      return body;
    }

    const brandId = getPublicMetadata(user).brand;
    const authorizationScope = {
      ...(brandId ? { brandId } : {}),
      organizationId,
    };
    if (
      pageContext.analyticsQuery &&
      (body.brandId !== brandId ||
        !isAuthorizedAnalyticsQueryReference(
          pageContext.analyticsQuery,
          authorizationScope,
        ))
    ) {
      throw new BadRequestException(
        'Analytics query references require the current authorized scope.',
      );
    }

    let authorizedPageContext: AgentPageContext = { ...pageContext };
    if (pageContext.researchReferences !== undefined) {
      const researchReferences = authorizeResearchFindingReferences(
        pageContext.researchReferences,
        authorizationScope,
      );
      if (!researchReferences || body.brandId !== brandId) {
        throw new BadRequestException(
          'Research references require the current authorized brand context.',
        );
      }
      authorizedPageContext = {
        ...authorizedPageContext,
        researchReferences: [...researchReferences],
      };
    }

    const references = pageContext.socialReferences;
    if (!references?.length) {
      return { ...body, pageContext: authorizedPageContext };
    }
    if (!brandId || body.brandId !== brandId || !this.socialInboxService) {
      throw new BadRequestException(
        'Social inbox references require the current authorized brand context.',
      );
    }
    const { context: authorizedSocialContext, references: socialReferences } =
      await this.socialInboxService.resolveAgentContextReferences(
        { brandId, organizationId, userId },
        references,
      );

    return {
      ...body,
      pageContext: {
        ...authorizedPageContext,
        authorizedSocialContext,
        socialReferences,
      },
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
    const { user: metadataUserId } = getPublicMetadata(user);
    if (metadataUserId) {
      return metadataUserId;
    }

    const authProviderId = user.id;
    if (!authProviderId) {
      throw new UnauthorizedException(
        'Missing user identity. Please sign in again.',
      );
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
