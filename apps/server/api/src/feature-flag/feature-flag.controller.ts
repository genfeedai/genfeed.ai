import type { RequestWithContext } from '@api/common/middleware/request-context.middleware';
import { FeatureFlagService } from '@api/feature-flag/feature-flag.service';
import type { ConversationShellEvaluation } from '@genfeedai/config';
import { Controller, Get, Query, Req } from '@nestjs/common';

@Controller('feature-flags')
export class FeatureFlagController {
  constructor(private readonly featureFlagService: FeatureFlagService) {}

  @Get('conversation-shell')
  evaluateConversationShell(
    @Req() request: RequestWithContext,
    @Query('client') client: string | undefined,
  ): ConversationShellEvaluation {
    return this.featureFlagService.evaluateConversationShell({
      client,
      organizationId: request.context?.organizationId,
    });
  }
}
