import type { AccountHealthSummary } from '@genfeedai/interfaces';
import type { PublishingOverviewHealthRow } from '@props/publisher/publishing-overview.props';

const RISK_RANK: Record<PublishingOverviewHealthRow['riskLevel'], number> = {
  high: 0,
  medium: 1,
  low: 2,
  unknown: 3,
};

function accountLabel(summary: AccountHealthSummary): string {
  return summary.handle || summary.label;
}

/**
 * Overview health rows are the account-health summaries already fetched for
 * cadence, ordered so reconnect and high-risk accounts surface first.
 */
export function buildAccountHealthRows(
  accountHealth: AccountHealthSummary[],
): PublishingOverviewHealthRow[] {
  return [...accountHealth]
    .map(
      (summary): PublishingOverviewHealthRow => ({
        accountLabel: accountLabel(summary),
        connectedDays: summary.signals.connectedDays,
        credentialId: summary.credentialId,
        holdPublishing: summary.holdPublishing,
        holdReason: summary.holdReason,
        needsReconnect: Boolean(summary.reconnect?.isAvailable),
        platform: summary.platform,
        publishedPosts: summary.signals.publishedPosts,
        recentFailures: summary.signals.recentFailures,
        riskLevel: summary.riskLevel,
        score: summary.score,
        state: summary.state,
      }),
    )
    .sort((left, right) => {
      if (left.needsReconnect !== right.needsReconnect) {
        return left.needsReconnect ? -1 : 1;
      }
      if (left.holdPublishing !== right.holdPublishing) {
        return left.holdPublishing ? -1 : 1;
      }
      const riskDelta = RISK_RANK[left.riskLevel] - RISK_RANK[right.riskLevel];
      if (riskDelta !== 0) {
        return riskDelta;
      }
      if (left.score !== right.score) {
        return left.score - right.score;
      }
      return left.accountLabel.localeCompare(right.accountLabel);
    });
}
