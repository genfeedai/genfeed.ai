import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { extractRequestContext } from '@api/helpers/utils/auth/auth.util';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { AgentBrandContextSnapshotService } from '@api/services/agent-orchestrator/agent-brand-context-snapshot.service';
import type { JsonApiSingleResponse } from '@genfeedai/contracts/interfaces';
import { AgentBrandContextSerializer } from '@genfeedai/serializers';
import {
  Controller,
  ForbiddenException,
  Get,
  Param,
  Query,
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

/**
 * What the agent knows about a brand: the exact context a chat turn in this
 * brand is given, rendered read-only. The in-app agent and MCP reach the same
 * snapshot through the `get_brand_context` curated action.
 */
@AutoSwagger()
@ApiTags('agent-brand-context')
@Controller('brands/:brandId/agent-context')
export class AgentBrandContextController {
  constructor(
    private readonly snapshotService: AgentBrandContextSnapshotService,
  ) {}

  @Get()
  @ApiOperation({
    summary:
      'Snapshot of the brand context, memories, skills, model, and system prompt the agent uses',
  })
  @ApiQuery({
    description:
      'Optional preview message. Retrieval layers (knowledge, related posts, memories) rank against it.',
    name: 'query',
    required: false,
  })
  async getSnapshot(
    @Req() request: Request,
    @Param('brandId') brandId: string,
    @CurrentUser() user: User,
    @Query('query') query?: string,
  ): Promise<JsonApiSingleResponse> {
    const { organizationId, userId } = extractRequestContext(user);
    if (!organizationId || !userId) {
      throw new ForbiddenException(
        'An active organization membership is required to view agent context.',
      );
    }

    const snapshot = await this.snapshotService.buildSnapshot({
      brandId,
      organizationId,
      query: typeof query === 'string' ? query : undefined,
      userId,
    });

    return serializeSingle(request, AgentBrandContextSerializer, snapshot);
  }
}
