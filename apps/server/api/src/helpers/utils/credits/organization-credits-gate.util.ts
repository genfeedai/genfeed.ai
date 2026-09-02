import type { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import type { ModelsService } from '@api/collections/models/services/models.service';
import { baseModelKey } from '@api/collections/models/utils/model-key.util';
import { DEFAULT_TEXT_MODEL } from '@api/constants/default-text-model.constant';
import { createInsufficientCreditsException } from '@api/helpers/utils/credits/insufficient-credits.util';
import { getMinimumTextCredits } from '@api/helpers/utils/text-pricing/text-pricing.util';
import { BadRequestException } from '@nestjs/common';

export async function assertOrganizationCreditsAvailable(
  creditsUtilsService: Pick<
    CreditsUtilsService,
    'checkOrganizationCreditsAvailable' | 'getOrganizationCreditsBalance'
  >,
  organizationId: string,
  requiredCredits: number,
): Promise<void> {
  if (!organizationId) {
    throw new BadRequestException('Organization is required');
  }

  if (requiredCredits <= 0) {
    return;
  }

  const hasCredits =
    await creditsUtilsService.checkOrganizationCreditsAvailable(
      organizationId,
      requiredCredits,
    );

  if (hasCredits) {
    return;
  }

  const balance =
    await creditsUtilsService.getOrganizationCreditsBalance(organizationId);

  throw createInsufficientCreditsException(requiredCredits, balance);
}

export async function resolveTextModelMinimumCredits(
  modelsService: Pick<ModelsService, 'findOne'>,
  modelKey?: string,
): Promise<number> {
  if (!modelKey) {
    return 0;
  }

  const model = await modelsService.findOne({
    key: baseModelKey(modelKey),
  });

  if (!model) {
    return 0;
  }

  if (model.pricingType === 'per-token') {
    return getMinimumTextCredits(model);
  }

  return model.cost || 0;
}

export async function getDefaultTextMinimumCredits(
  modelsService: Pick<ModelsService, 'findOne'>,
): Promise<number> {
  return resolveTextModelMinimumCredits(modelsService, DEFAULT_TEXT_MODEL);
}
