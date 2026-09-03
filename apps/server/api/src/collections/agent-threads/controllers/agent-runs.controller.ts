import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { AgentThreadsService } from '@api/collections/agent-threads/services/agent-threads.service';
import { UsersService } from '@api/collections/users/services/users.service';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { ErrorResponse } from '@api/helpers/utils/error-response/error-response.util';
import { serializeCollection } from '@api/helpers/utils/response/response.util';
import { AgentRunSerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import {
  Controller,
  Get,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

@ApiTags('Agent Runs')
@Controller('agent/runs')
export class AgentRunsController {
  constructor(
    private readonly agentThreadsService: AgentThreadsService,
    private readonly usersService: UsersService,
    private readonly loggerService: LoggerService,
  ) {}

  @Get()
  @ApiOperation({
    summary:
      'List latest agent runs across threads in the current organization/brand',
  })
  async listRuns(
    @Req() req: Request,
    @CurrentUser() user: User,
    @Query('brand') brand?: string,
  ) {
    try {
      const organizationId = this.resolveOrganizationId(user);
      const dbUserId = await this.resolveDatabaseUserId(user);
      const brandId = brand?.trim() ? brand.trim() : undefined;
      const docs = await this.agentThreadsService.listAgentRuns(
        dbUserId,
        organizationId,
        brandId,
      );
      return serializeCollection(req, AgentRunSerializer, { docs });
    } catch (error: unknown) {
      return ErrorResponse.handle(error, this.loggerService, 'listAgentRuns');
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
    const fallbackUserId = dbUser?.id;
    if (!fallbackUserId) {
      throw new UnauthorizedException('User account not found');
    }

    return String(fallbackUserId);
  }
}
