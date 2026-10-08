import type { CreateCampaignParams } from '@api/services/integrations/meta-ads/interfaces/meta-ads.interface';
import { META_CAMPAIGN_OBJECTIVES } from '@genfeedai/integrations';
import { BadRequestException } from '@nestjs/common';

export function buildMetaCampaign(
  params: CreateCampaignParams,
): Record<string, unknown> {
  if (
    !META_CAMPAIGN_OBJECTIVES.some(
      (objective) => objective === params.objective,
    )
  ) {
    throw new BadRequestException(
      `Meta campaign creation requires a current objective: ${META_CAMPAIGN_OBJECTIVES.join(', ')}.`,
    );
  }

  const data: Record<string, unknown> = {
    name: params.name,
    objective: params.objective,
    special_ad_categories: JSON.stringify(params.specialAdCategories || []),
    status: params.status || 'PAUSED',
  };

  if (params.dailyBudget === undefined && params.lifetimeBudget === undefined) {
    data.is_adset_budget_sharing_enabled = false;
  }

  if (params.dailyBudget !== undefined) {
    data.daily_budget = Math.round(params.dailyBudget * 100);
  }
  if (params.lifetimeBudget !== undefined) {
    data.lifetime_budget = Math.round(params.lifetimeBudget * 100);
  }

  return data;
}
