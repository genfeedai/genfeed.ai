import type {
  CampaignComparisonMetric,
  ICampaignComparison,
  ICampaignComparisonEntry,
} from '@genfeedai/contracts/interfaces';

export function compareCampaignEntries(
  entries: ICampaignComparisonEntry[],
  metric: CampaignComparisonMetric = 'views',
): Pick<
  ICampaignComparison,
  'isDescriptive' | 'metric' | 'reason' | 'winnerCampaignId'
> {
  if (entries.length < 2) {
    return {
      isDescriptive: true,
      metric,
      reason: 'Comparison needs at least two Campaigns',
      winnerCampaignId: null,
    };
  }

  const windows = new Set(
    entries.map((entry) => `${entry.windowStart}:${entry.windowEnd}`),
  );
  if (windows.size > 1) {
    return {
      isDescriptive: true,
      metric,
      reason: 'Reporting windows do not align',
      winnerCampaignId: null,
    };
  }

  const values = entries.map((entry) => entry.organic[metric].value);
  if (values.some((value) => value === null)) {
    return {
      isDescriptive: true,
      metric,
      reason: 'A selected Campaign is missing compatible organic data',
      winnerCampaignId: null,
    };
  }

  const objectives = new Set(
    entries.map((entry) => entry.campaign.objective || ''),
  );
  const ranked = [...entries].sort(
    (left, right) =>
      (right.organic[metric].value ?? 0) - (left.organic[metric].value ?? 0),
  );
  const leader = ranked[0];
  const runnerUp = ranked[1];
  if (
    !leader ||
    !runnerUp ||
    leader.organic[metric].value === runnerUp.organic[metric].value
  ) {
    return {
      isDescriptive: true,
      metric,
      reason: 'Organic totals are tied for the selected metric',
      winnerCampaignId: null,
    };
  }

  return {
    isDescriptive: true,
    metric,
    reason:
      objectives.size > 1
        ? 'Objectives differ. Ranking is descriptive organic comparison, not causal lift.'
        : 'Ranking is descriptive organic comparison, not causal lift.',
    winnerCampaignId: leader.campaign.id,
  };
}
