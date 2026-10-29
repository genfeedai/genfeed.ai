import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { AgentMasterThreadService } from '@api/collections/agent-threads/services/agent-master-thread.service';
import { withAgentThreadExternalRuntime } from '@api/collections/agent-threads/utils/agent-thread-external-runtime.util';
import {
  resolveAgentThreadDatabaseUserId,
  resolveAgentThreadOrganizationId,
} from '@api/collections/agent-threads/utils/agent-thread-identity.util';
import { UsersService } from '@api/collections/users/services/users.service';
import { FeatureFlag } from '@api/feature-flag/feature-flag.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { TenantReadPolicy } from '@api/helpers/interceptors/tenant-context/tenant-read-policy.decorator';
import { ErrorResponse } from '@api/helpers/utils/error-response/error-response.util';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { RateLimit } from '@api/shared/decorators/rate-limit/rate-limit.decorator';
import { AgentThreadSerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import { Controller, Get, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

/**
 * Declared before `AgentThreadsController` in the module so `master` is never
 * read as a `:threadId`.
 */
@ApiTags('Agent Threads')
@FeatureFlag('agent')
@Controller('agent/threads/master')
export class AgentMasterThreadController {
  constructor(
    private readonly agentMasterThreadService: AgentMasterThreadService,
    private readonly usersService: UsersService,
    private readonly loggerService: LoggerService,
  ) {}

  @TenantReadPolicy('owner')
  @Get()
  @RateLimit({ limit: 30, scope: 'user', windowMs: 60_000 })
  @ApiOperation({
    summary:
      "Get the user's master thread for this organization, creating it on first open",
  })
  async getMasterThread(@Req() req: Request, @CurrentUser() user: User) {
    try {
      const thread = await this.agentMasterThreadService.getOrCreate(
        await resolveAgentThreadDatabaseUserId(user, this.usersService),
        resolveAgentThreadOrganizationId(user),
      );
      return serializeSingle(
        req,
        AgentThreadSerializer,
        withAgentThreadExternalRuntime(thread),
      );
    } catch (error: unknown) {
      return ErrorResponse.handle(error, this.loggerService, 'getMasterThread');
    }
  }
}
