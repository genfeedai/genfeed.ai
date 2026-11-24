import { formatCompactNumberIntl } from '@genfeedai/helpers/formatting/format/format.helper';
import type { CreatorReachProps } from '@props/content/creator.props';

/**
 * What the creator's posts have reached across every connected platform:
 * views, impressions and engagements, one line in the header. A metric with no
 * data is left out, and a creator with none shows nothing at all, never a row
 * of zeros.
 *
 * It matches the look of `MetricSummary` but renders on the server: that
 * component is a client component, and importing it added 35 kB of first-load
 * JavaScript to every profile route.
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
    <p
      className="text-sm tabular-nums text-foreground/60"
      data-testid="creator-reach"
    >
      {items.map((item, index) => (
        <span key={item.label}>
          {index > 0 ? (
            <span aria-hidden="true" className="mx-1.5 text-foreground/40">
              ·
            </span>
          ) : null}
          <span className="font-medium text-foreground">{item.value}</span>{' '}
          {item.label}
        </span>
      ))}
    </p>
  );
}
