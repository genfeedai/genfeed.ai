import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { KickoffOnboardingDto } from '@api/collections/agent-threads/dto/kickoff-onboarding.dto';
import { AgentOnboardingKickoffService } from '@api/collections/agent-threads/services/agent-onboarding-kickoff.service';
import { FeatureFlag } from '@api/feature-flag/feature-flag.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { RateLimit } from '@api/shared/decorators/rate-limit/rate-limit.decorator';
import { AgentThreadSerializer } from '@genfeedai/serializers';
import {
  Body,
  Controller,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

@ApiTags('Agent Threads')
@FeatureFlag('agent')
@Controller('agent/threads/onboarding')
export class AgentOnboardingKickoffController {
  constructor(
    private readonly onboardingKickoffService: AgentOnboardingKickoffService,
  ) {}

  @Post('kickoff')
  @RateLimit({ limit: 30, scope: 'user', windowMs: 60_000 })
  @ApiOperation({
    summary: 'Start or resume the agent-first onboarding conversation',
  })
  async kickoffOnboarding(
    @Req() req: Request,
    @Body() body: KickoffOnboardingDto,
    @CurrentUser() user: User,
  ) {
    // The authenticated identity already carries the canonical user id.
    const userId = user.userId ?? user.id;
    if (!userId || !user.organizationId) {
      throw new UnauthorizedException(
        'Invalid organization context. Please sign in again.',
      );
    }
    const thread = await this.onboardingKickoffService.kickoff(
      userId,
      user.organizationId,
      body.brandId,
    );
    return serializeSingle(req, AgentThreadSerializer, thread);
  }
}
