import { DEFAULT_MINI_TEXT_MODEL } from '@api/constants/default-mini-text-model.constant';
import {
  CreditsGuard,
  type CreditsGuardRequest,
} from '@api/helpers/guards/credits/credits.guard';
import { BatchAction } from '@api/services/batch-generation/dto/batch-action.dto';
import { ActivitySource } from '@genfeedai/contracts';
import {
  BadRequestException,
  type CanActivate,
  type ExecutionContext,
  Injectable,
} from '@nestjs/common';

@Injectable()
export class BatchRewriteCreditsGuard implements CanActivate {
  constructor(private readonly creditsGuard: CreditsGuard) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<CreditsGuardRequest>();
    const body = request.body?.data?.attributes ?? request.body;
    if (body?.action !== BatchAction.REWRITE) return true;
    if (
      !Array.isArray(body.itemIds) ||
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
      modelKey: DEFAULT_MINI_TEXT_MODEL,
      source: ActivitySource.POST_ENHANCEMENT,
    });
    request.creditsConfig = admission.creditsConfig;
    return result;
  }
}
