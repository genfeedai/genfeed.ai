import { DEFAULT_MINI_TEXT_MODEL } from '@api/constants/default-mini-text-model.constant';
import {
  CreditsGuard,
  type CreditsGuardRequest,
} from '@api/helpers/guards/credits/credits.guard';
import { ActivitySource } from '@genfeedai/contracts';
import {
  BadRequestException,
  type CanActivate,
  type ExecutionContext,
  Injectable,
} from '@nestjs/common';

/**
 * Prices a batch rewrite at one text-model call per distinct item and checks
 * the balance covers all of them. The background job reserves and settles each
 * item itself, so admission places no request-level hold.
 */
@Injectable()
export class BatchRewriteCreditsGuard implements CanActivate {
  constructor(private readonly creditsGuard: CreditsGuard) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<CreditsGuardRequest>();
    const body = request.body?.data?.attributes ?? request.body;
    if (
      !Array.isArray(body?.itemIds) ||
      body.itemIds.length === 0 ||
      body.itemIds.length > 100 ||
      body.itemIds.some((id: unknown) => typeof id !== 'string')
    ) {
      throw new BadRequestException('Select between 1 and 100 batch items');
    }
    const admission = {
      ...request,
      body: {},
      creditsOutputCount: new Set(body.itemIds).size,
    };
    const result = await this.creditsGuard.admit(admission, {
      description: 'Batch rewrite (text model)',
      isBodyModelIgnored: true,
      isReservationDeferred: true,
      modelKey: DEFAULT_MINI_TEXT_MODEL,
      source: ActivitySource.POST_ENHANCEMENT,
    });
    request.creditsConfig = admission.creditsConfig;
    return result;
  }
}
