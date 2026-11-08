import { CardVariant } from '@genfeedai/contracts';
import { creatorPostPath } from '@genfeedai/contracts/constants';
import type { CreatorPostCardProps } from '@props/content/creator.props';
import Card from '@ui/card/Card';
import Link from 'next/link';
import { postPlatformLabel, postTitle, toPlainPostText } from './post-text';

const postDateFormatter = new Intl.DateTimeFormat('en-US', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
  year: 'numeric',
});

/** A text post: its copy, where it went out, and when. */
export default function CreatorPostCard({
  handle,
  post,
}: CreatorPostCardProps): React.ReactElement {
  const text = toPlainPostText(post.description);
  const title = postTitle(post.label, text);
  const platform = postPlatformLabel(post.platform);
  const publishedAt = post.publishedAt ?? post.createdAt;

  return (
    <Link
      className="group block h-full"
      href={creatorPostPath(handle, post.id)}
    >
      <Card isInteractive variant={CardVariant.BORDERED} className="h-full">
        <h3 className="mb-2 line-clamp-2 text-base font-semibold text-foreground transition-colors group-hover:text-primary">
          {title}
        </h3>
        {text && text !== title ? (
          <p className="mb-3 line-clamp-4 text-sm text-foreground/70">{text}</p>
        ) : null}
        <p className="text-xs text-foreground/50">
          {platform ? <span>{platform} · </span> : null}
          {publishedAt ? (
            <time dateTime={publishedAt}>
              {postDateFormatter.format(new Date(publishedAt))}
            </time>
          ) : null}
        </p>
      </Card>
    </Link>
  );
}
