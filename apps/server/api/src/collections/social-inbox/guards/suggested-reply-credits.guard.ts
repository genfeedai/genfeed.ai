import type { CreditsGuardRequest } from '@api/helpers/guards/credits/credits.guard';
import { ReplyGenerationService } from '@api/services/reply-bot/reply-generation.service';
import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

@Injectable()
export class SuggestedReplyCreditsGuard implements CanActivate {
  constructor(
    private readonly replyGenerationService: ReplyGenerationService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const user = context.switchToHttp().getRequest<CreditsGuardRequest>().user;
    if (!user?.organizationId)
      throw new UnauthorizedException('Organization context is required');
    // ReplyGenerationService owns settlement. The generic CreditsGuard would
    // reserve a second charge that this service does not settle.
    await this.replyGenerationService.assertCreditsAvailable(
      user.organizationId,
    );
    return true;
  }
}
