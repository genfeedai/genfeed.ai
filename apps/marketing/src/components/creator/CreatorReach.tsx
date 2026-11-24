import { formatCompactNumberIntl } from '@genfeedai/helpers/formatting/format/format.helper';
import type { CreatorReachProps } from '@props/content/creator.props';
import { MetricSummary } from '@ui/cards/metric-card/MetricCard';

/**
 * What the creator's posts have reached across every connected platform:
 * views, impressions and engagements, one line in the header. A metric with no
 * data is left out, and a creator with none shows nothing at all, never a row
 * of zeros.
 */
export default function CreatorReach({
  reach,
}: CreatorReachProps): React.ReactElement | null {
  const items = [
    { label: 'views', value: reach?.views },
    { label: 'impressions', value: reach?.impressions },
    { label: 'engagements', value: reach?.engagements },
  ].flatMap(({ label, value }) =>
    value && value > 0
      ? [{ label, value: formatCompactNumberIntl(value) }]
      : [],
  );

  if (items.length === 0) {
    return <span />;
  }

  return (
    <MetricSummary
      className="text-sm"
      data-testid="creator-reach"
      items={items}
    />
  );
}
