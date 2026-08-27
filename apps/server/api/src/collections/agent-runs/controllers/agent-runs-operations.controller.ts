import type { AuthenticatedUser as User } from '@server/auth/interfaces/authenticated-user.interface';
import {
  type AgentRunOperationScope,
  AgentRunsOperationsService,
} from '@api/collections/agent-runs/services/agent-runs-operations.service';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import {
  AgentRunSerializer,
  sanitizeAgentRunForSerialization,
} from '@genfeedai/serializers';
import {
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

@ApiTags('Agent Runs')
@AutoSwagger()
@Controller('runs')
export class AgentRunsOperationsController {
  constructor(private readonly operationsService: AgentRunsOperationsService) {}

  @Post(':id/retries')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'AgentRunsController.retryRun',
    summary: 'Retry a failed or cancelled agent run',
  })
  @ApiResponse({ description: 'Run requeued', status: 200 })
  async retryRun(
    @Req() request: Request,
    @Param('id') id: string,
    @CurrentUser() user: User,
    @Query('brand') requestedBrandId?: string,
  ) {
    const run = await this.operationsService.retryRun(
      id,
      this.buildScope(user, requestedBrandId),
    );

    return serializeSingle(
      request,
      AgentRunSerializer,
      sanitizeAgentRunForSerialization(run),
    );
  }

  private buildScope(
    user: User,
    requestedBrandId?: string,
  ): AgentRunOperationScope {
    return {
      brandId: user.brandId ?? requestedBrandId,
      organizationId: user.organizationId,
      userId: user.userId ?? user.id,
    };
  }
}
