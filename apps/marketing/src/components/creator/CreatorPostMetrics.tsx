import { formatCompactNumberIntl } from '@genfeedai/helpers/formatting/format/format.helper';
import type {
  CreatorPostMetricProps,
  CreatorPostMetricsProps,
} from '@props/content/creator.props';
import { Heart, MessageCircle, Repeat2 } from 'lucide-react';

function CreatorPostMetric({
  icon,
  singular,
  value,
}: CreatorPostMetricProps): React.ReactElement {
  return (
    <span className="inline-flex items-center gap-1 tabular-nums">
      {icon}
      <span aria-hidden="true">{formatCompactNumberIntl(value)}</span>
      <span className="sr-only">
        {value} {value === 1 ? singular : `${singular}s`}
      </span>
    </span>
  );
}

/**
 * How a post performed: likes, comments and reposts. A post nobody has
 * reacted to yet shows nothing rather than a row of zeros. Views are never
 * shown on the public site.
 */
export default function CreatorPostMetrics({
  post,
}: CreatorPostMetricsProps): React.ReactElement | null {
  const likes = post.totalLikes ?? 0;
  const comments = post.totalComments ?? 0;
  const reposts = post.totalShares ?? 0;

  if (likes + comments + reposts === 0) {
    return null;
  }

  return (
    <span className="inline-flex items-center gap-3">
      <CreatorPostMetric
        icon={<Heart aria-hidden="true" className="size-3.5" />}
        singular="like"
        value={likes}
      />
      <CreatorPostMetric
        icon={<MessageCircle aria-hidden="true" className="size-3.5" />}
        singular="comment"
        value={comments}
      />
      <CreatorPostMetric
        icon={<Repeat2 aria-hidden="true" className="size-3.5" />}
        singular="repost"
        value={reposts}
      />
    </span>
  );
}
