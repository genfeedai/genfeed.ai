import { getActionOriginContext } from '@api/action-origin/action-origin.context';
import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { UsersService } from '@api/collections/users/services/users.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { FeatureFlag } from '@api/feature-flag/feature-flag.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { assertApiKeyAgentPublishingScope } from '@api/helpers/utils/auth/api-key-publishing-scope.util';
import { getIsSuperAdmin } from '@api/helpers/utils/auth/auth.util';
import { assertMcpAccessModeAllowsTool } from '@api/helpers/utils/auth/mcp-access-mode.util';
import { ErrorResponse } from '@api/helpers/utils/error-response/error-response.util';
import { AgentScopeContextService } from '@api/index';
import {
  AgentUntrustedContentGateService,
  UNTRUSTED_CONTENT_WITHHELD_NOTICE,
} from '@api/services/agent-orchestrator/agent-untrusted-content-gate.service';
import { EvaluateMcpToolResultDto } from '@api/services/agent-orchestrator/dto/evaluate-mcp-tool-result.dto';
import { ExecuteAgentToolDto } from '@api/services/agent-orchestrator/dto/execute-agent-tool.dto';
import {
  AgentToolExecutorService,
  type ToolExecutionContext,
} from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { buildAgentInitiatingPrincipal } from '@api/services/agent-orchestrator/utils/agent-initiating-principal.util';
import type { CuratedActionName } from '@genfeedai/actions';
import {
  describeMissingMcpBrand,
  getToolByName,
  getToolsForSurface,
  isMcpBrandRequiredTool,
  type McpBrandOption,
  readMcpBrandId,
} from '@genfeedai/actions';
import { ActionOrigin } from '@genfeedai/contracts';
import {
  type AgentToolResult,
  isAgentUntrustedContentSource,
  readAgentUntrustedContentSource,
} from '@genfeedai/contracts/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Param,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

@ApiTags('Agent Tools')
@FeatureFlag('agent')
@Controller('agent-tools')
export class AgentToolsController {
  constructor(
    private readonly executor: AgentToolExecutorService,
    private readonly usersService: UsersService,
    private readonly loggerService: LoggerService,
    private readonly untrustedContentGate: AgentUntrustedContentGateService,
    private readonly agentScopeContextService: AgentScopeContextService,
  ) {}

  @Post(':name/execute')
  @ApiOperation({
    summary: 'Execute a canonical agent tool by name',
  })
  async execute(
    @Param('name') name: string,
    @Body() body: ExecuteAgentToolDto,
    @CurrentUser() user: User,
    @Req() request: Request,
  ) {
    assertMcpAccessModeAllowsTool(user, name, 'agent');
    assertApiKeyAgentPublishingScope(user, name, body.parameters ?? {});

    try {
      const tool = getToolByName(name);
      if (!tool) {
        throw new NotFoundException({ message: `Unknown tool: ${name}` });
      }

      if (!tool.surfaces.agent && !tool.surfaces.mcp) {
        throw new ForbiddenException(`Tool ${name} is not callable`);
      }

      if (tool.requiredRole !== 'user') {
        const isSuperAdmin = getIsSuperAdmin(user, request);
        if (tool.requiredRole === 'superadmin' && !isSuperAdmin) {
          throw new ForbiddenException(`Tool ${name} requires superadmin`);
        }
        // The removed role metadata had no writers, and the current registry
        // exposes no organization-admin tools. Keep the prior deny-by-default
        // behavior without introducing a new membership authorization path.
        if (tool.requiredRole === 'admin' && !isSuperAdmin) {
          throw new ForbiddenException(`Tool ${name} requires admin`);
        }
      }

      const organizationId = this.resolveOrganizationId(user);
      const userId = await this.resolveDatabaseUserId(user);
      // Never spread client input into the context: the executor trusts fields
      // such as validatedScope, creditGovernance and isWorkflowScoped. The DTO
      // whitelists the one client-settable field; all else is server-derived.
      const approvedApprovalId = body.context?.approvedApprovalId;
      // The caller's brand is a requested value, never the authority: prove it
      // belongs to the authenticated organization before it reaches a tool.
      const brandId = body.context?.brandId;
      if (brandId) {
        await this.agentScopeContextService.assertBrandAuthorized(brandId, {
          userId,
          organizationId,
          isApiKey: user.isApiKey,
          apiKeyId: user.apiKeyId,
          scopes: user.scopes,
        });
      }

      const context: ToolExecutionContext = {
        generationEntry: getActionOriginContext().generationEntry,
        ...(brandId ? { brandId } : {}),
        apiKeyContext: user,
        initiatingPrincipal: buildAgentInitiatingPrincipal({
          auth: user,
          organizationId,
          userId,
        }),
        approvedApprovalId,
        approvalReviewerAuthorized:
          Boolean(approvedApprovalId) && getIsSuperAdmin(user, request),
        hostSupportsApproval: Boolean(approvedApprovalId),
        organizationId,
        userId,
      };

      if (!isAgentToolName(name)) {
        throw new BadRequestException(
          `Tool ${name} has no agent executor wired up`,
        );
      }

      // MCP callers always name the brand (#5786); the MCP server enforces the
      // same rule first, this keeps direct MCP-origin API calls from guessing one.
      if (
        getActionOriginContext().origin === ActionOrigin.MCP &&
        isMcpBrandRequiredTool(name) &&
        !readMcpBrandId(body.parameters)
      ) {
        return await this.brandRequiredResult(name, context);
      }

      const result = await this.executor.executeTool(
        name,
        body.parameters ?? {},
        context,
      );
      const gated = await this.evaluateMcpResult(
        name,
        JSON.stringify(result),
        organizationId,
        userId,
      );
      if (gated.outcome === 'withheld') {
        const withheld: AgentToolResult = {
          success: false,
          error: UNTRUSTED_CONTENT_WITHHELD_NOTICE,
          creditsUsed: result.creditsUsed,
        };
        return withheld;
      }
      return result;
    } catch (error: unknown) {
      return ErrorResponse.handle(
        error,
        this.loggerService,
        'agentToolExecute',
      );
    }
  }

  private async brandRequiredResult(
    name: string,
    context: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const listing = await this.executor.executeTool('get_brands', {}, context);
    const entries =
      listing.success &&
      listing.data !== null &&
      typeof listing.data === 'object' &&
      Array.isArray((listing.data as { brands?: unknown }).brands)
        ? ((listing.data as { brands: unknown[] }).brands as unknown[])
        : [];
    const brands = entries.flatMap((entry): McpBrandOption[] => {
      if (entry === null || typeof entry !== 'object') return [];
      const brand = entry as Record<string, unknown>;
      if (typeof brand.id !== 'string') return [];
      const label = [brand.label, brand.name].find(
        (value): value is string =>
          typeof value === 'string' && value.trim().length > 0,
      );
      return [{ id: brand.id, label: label ?? brand.id }];
    });
    return {
      creditsUsed: 0,
      data: { brands, recoveryAction: 'select_brand' },
      error: describeMissingMcpBrand(name, brands),
      success: false,
    };
  }

  @Post(':name/result-gate')
  @ApiOperation({
    summary: 'Classify an authenticated MCP tool result observation',
  })
  async resultGate(
    @Param('name') name: string,
    @Body() body: EvaluateMcpToolResultDto,
    @CurrentUser() user: User,
    @Req() request: Request,
  ) {
    const organizationId = this.resolveOrganizationId(user);
    const userId = await this.resolveDatabaseUserId(user);
    const tool = getToolByName(name);
    if (!tool)
      throw new NotFoundException({ message: `Unknown tool: ${name}` });
    if (
      !tool.surfaces.mcp ||
      !isAgentUntrustedContentSource(readAgentUntrustedContentSource(name))
    ) {
      throw new ForbiddenException(
        `Tool ${name} has no external MCP result surface`,
      );
    }
    if (tool.requiredRole !== 'user' && !getIsSuperAdmin(user, request)) {
      throw new ForbiddenException(
        `Tool ${name} requires ${tool.requiredRole}`,
      );
    }
    return this.evaluateMcpResult(
      name,
      body.content,
      organizationId,
      userId,
      body.isPartial === true,
    );
  }

  private evaluateMcpResult(
    name: string,
    content: string,
    organizationId: string,
    userId: string,
    isContentPartial = false,
  ) {
    return this.untrustedContentGate.evaluateToolResult({
      brandId: null,
      content,
      context: { organizationId, userId },
      isContentPartial,
      origin: 'mcp',
      threadId: null,
      toolCallId: name,
      toolName: name,
    });
  }

  private resolveOrganizationId(user: User): string {
    const organization = user?.organizationId;
    if (!organization) {
      throw new UnauthorizedException(
        'Invalid organization context. Please sign in again.',
      );
    }
    return organization;
  }

  private async resolveDatabaseUserId(user: User): Promise<string> {
    const metadataUserId = user.userId ?? user.id;
    if (metadataUserId) {
      return metadataUserId;
    }

    const userId = user.id;
    if (!userId) {
      throw new UnauthorizedException(
        'Missing user identity. Please sign in again.',
      );
    }

    const dbUser = await this.usersService.findOne({ id: userId }, []);
    if (!dbUser?.id) {
      throw new UnauthorizedException('User account not found');
    }

    return String(dbUser.id);
  }
}

function isAgentToolName(name: string): name is CuratedActionName {
  return (
    getToolsForSurface('agent').map((tool) => tool.name) as string[]
  ).includes(name);
}
