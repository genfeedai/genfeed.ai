import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { UsersService } from '@api/collections/users/services/users.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { assertApiKeyAgentPublishingScope } from '@api/helpers/utils/auth/api-key-publishing-scope.util';
import { getIsSuperAdmin } from '@api/helpers/utils/auth/auth.util';
import { ErrorResponse } from '@api/helpers/utils/error-response/error-response.util';
import {
  AgentToolExecutorService,
  type ToolExecutionContext,
} from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import type { CuratedActionName } from '@genfeedai/actions';
import { getToolByName, getToolsForSurface } from '@genfeedai/actions';

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

interface ExecuteToolBody {
  parameters?: Record<string, unknown>;
  context?: Partial<
    Omit<
      ToolExecutionContext,
      | 'confirmationOrigin'
      | 'hostSupportsApproval'
      | 'organizationId'
      | 'userId'
    >
  >;
}

@ApiTags('Agent Tools')
@Controller('agent-tools')
export class AgentToolsController {
  constructor(
    private readonly executor: AgentToolExecutorService,
    private readonly usersService: UsersService,
    private readonly loggerService: LoggerService,
  ) {}

  @Post(':name/execute')
  @ApiOperation({
    summary: 'Execute a canonical agent tool by name',
  })
  async execute(
    @Param('name') name: string,
    @Body() body: ExecuteToolBody,
    @CurrentUser() user: User,
    @Req() request: Request,
  ) {
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
      const clientContext = {
        ...(body.context ?? {}),
      } as Partial<ToolExecutionContext>;
      delete clientContext.confirmationOrigin;
      const approvedApprovalId = clientContext.approvedApprovalId;
      delete clientContext.hostSupportsApproval;
      delete clientContext.approvedApprovalId;

      const context: ToolExecutionContext = {
        ...clientContext,
        apiKeyContext: user,
        approvedApprovalId,
        hostSupportsApproval: Boolean(approvedApprovalId),
        organizationId,
        userId,
      };

      if (!isAgentToolName(name)) {
        throw new BadRequestException(
          `Tool ${name} has no agent executor wired up`,
        );
      }

      return await this.executor.executeTool(
        name,
        body.parameters ?? {},
        context,
      );
    } catch (error: unknown) {
      return ErrorResponse.handle(
        error,
        this.loggerService,
        'agentToolExecute',
      );
    }
  }

  private resolveOrganizationId(user: User): string {
    const organization = user.organizationId;
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
