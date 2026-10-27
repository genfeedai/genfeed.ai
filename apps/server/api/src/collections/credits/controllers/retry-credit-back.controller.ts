import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { PreviewRetryCreditBackDto } from '@api/collections/credits/dto/preview-retry-credit-back.dto';
import { RetryCreditBackService } from '@api/collections/credits/services/retry-credit-back.service';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { extractRequestContext } from '@api/helpers/utils/auth/auth.util';
import { RateLimit } from '@api/shared/decorators/rate-limit/rate-limit.decorator';
import { RETRY_CREDIT_BACK_RATE } from '@genfeedai/contracts/constants';
import type { IRetryCreditBackPreview } from '@genfeedai/contracts/interfaces/billing';
import { Body, Controller, Post } from '@nestjs/common';

@AutoSwagger()
@Controller('credits/retry-credit-back')
export class RetryCreditBackController {
  constructor(private readonly retryCreditBack: RetryCreditBackService) {}

  /**
   * What regenerating this brief now would earn back, for the Studio quote.
   * Reads only the caller's own attempts and writes nothing.
   */
  @Post('preview')
  @RateLimit({ limit: 60, scope: 'user', windowMs: 60_000 })
  async preview(
    @Body() body: PreviewRetryCreditBackDto,
    @CurrentUser() user: User,
  ): Promise<IRetryCreditBackPreview> {
    const { brandId, organizationId, userId } = extractRequestContext(user);
    const credits =
      organizationId && userId
        ? await this.retryCreditBack.previewForBrief({
            brandId: brandId || null,
            chargedCredits: body.credits,
            modelKey: body.modelKey,
            organizationId,
            prompt: body.prompt,
            userId,
          })
        : 0;
    return { credits, rate: RETRY_CREDIT_BACK_RATE };
  }
}
