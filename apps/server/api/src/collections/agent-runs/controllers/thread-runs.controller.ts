import type { AuthenticatedUser as User } from '@server/auth/interfaces/authenticated-user.interface';
import { AgentRunsService } from '@server/collections/agent-runs/services/agent-runs.service';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { serializeCollection } from '@api/helpers/utils/response/response.util';
import {
  AgentRunSerializer,
  sanitizeAgentRunCollectionForSerialization,
} from '@genfeedai/serializers';
import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Query,
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

@ApiTags('Agent Threads')
@Controller('threads/:threadId/runs')
export class ThreadRunsController {
  constructor(private readonly agentRunsService: AgentRunsService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List runs for a thread' })
  @ApiResponse({ description: 'Thread runs returned', status: 200 })
  async getThreadRuns(
    @Req() request: Request,
    @Param('threadId') threadId: string,
    @CurrentUser() user: User,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    const runs = await this.agentRunsService.getByThread(
      threadId,
      user.organizationId,
      {
        brandId: user.brandId,
        cursor,
        limit: limit ? Number.parseInt(limit, 10) : undefined,
      },
    );

    return serializeCollection(
      request,
      AgentRunSerializer,
      sanitizeAgentRunCollectionForSerialization({ docs: runs }),
    );
  }
}
