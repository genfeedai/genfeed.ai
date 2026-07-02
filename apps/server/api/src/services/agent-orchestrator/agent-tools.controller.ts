import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { UsersService } from '@api/collections/users/services/users.service';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import {
  getIsSuperAdmin,
  getPublicMetadata,
} from '@api/helpers/utils/auth/auth.util';
import { ErrorResponse } from '@api/helpers/utils/error-response/error-response.util';
import {
  AgentToolExecutorService,
  type ToolExecutionContext,
} from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { MemberRole } from '@genfeedai/enums';
import { AgentToolName } from '@genfeedai/interfaces';
import { getToolByName } from '@genfeedai/tools';
import { LoggerService } from '@libs/logger/logger.service';
import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Headers,
  NotFoundException,
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
    Omit<ToolExecutionContext, 'userId' | 'organizationId' | 'authToken'>
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
    @Headers('authorization') authorization?: string,
  ) {
    try {
      const tool = getToolByName(name);
      if (!tool) {
        throw new NotFoundException(`Unknown tool: ${name}`);
      }

      if (!tool.surfaces.agent && !tool.surfaces.mcp) {
        throw new ForbiddenException(`Tool ${name} is not callable`);
      }

      if (tool.requiredRole !== 'user') {
        const isSuperAdmin = getIsSuperAdmin(user, request);
        if (tool.requiredRole === 'superadmin' && !isSuperAdmin) {
          throw new ForbiddenException(`Tool ${name} requires superadmin`);
        }
        if (tool.requiredRole === 'admin' && !isSuperAdmin) {
          const memberRole = getPublicMetadata(user).role;
          if (
            memberRole !== MemberRole.OWNER &&
            memberRole !== MemberRole.ADMIN
          ) {
            throw new ForbiddenException(`Tool ${name} requires admin`);
          }
        }
      }

      const organizationId = this.resolveOrganizationId(user);
      const userId = await this.resolveMongoUserId(user);
      const authToken = authorization?.replace('Bearer ', '');

      const context: ToolExecutionContext = {
        ...(body.context ?? {}),
        authToken,
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

    return String(dbUser.id);
  }
}

function isAgentToolName(name: string): name is AgentToolName {
  return (Object.values(AgentToolName) as string[]).includes(name);
}
