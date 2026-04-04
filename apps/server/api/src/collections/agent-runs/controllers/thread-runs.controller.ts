import { AgentRunsService } from '@api/collections/agent-runs/services/agent-runs.service';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { getPublicMetadata } from '@api/helpers/utils/clerk/clerk.util';
import { serializeCollection } from '@api/helpers/utils/response/response.util';
import type { User } from '@clerk/backend';
import { AgentRunSerializer } from '@genfeedai/serializers';
import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
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
  ) {
    const publicMetadata = getPublicMetadata(user);
    const runs = await this.agentRunsService.getByThread(
      threadId,
      publicMetadata.organization,
    );

    return serializeCollection(request, AgentRunSerializer, { docs: runs });
  }
}
