import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { Avatar } from '@ui/primitives/avatar';
import type { ReactElement } from 'react';
import type { PagePost } from '~types/extension';

interface PostCardProps {
  className?: string;
  /** Lines of post text shown before it is cut off. */
  isCompact?: boolean;
  post: PagePost;
}

/** The post being replied to, laid out the way the site shows a post. */
export default function PostCard({
  className,
  isCompact = false,
  post,
}: PostCardProps): ReactElement {
  const name = post.authorName || post.authorHandle || 'Post';
  return (
    <article
      className={cn(
        'flex gap-3 rounded-xl border border-border bg-card p-3',
        className,
      )}
    >
      <Avatar aria-hidden="true" name={name} size="lg" src={post.avatarUrl} />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-baseline gap-1 text-sm">
          <span className="truncate font-semibold text-foreground">{name}</span>
          {post.authorHandle && post.authorName ? (
            <span className="truncate text-muted-foreground">
              {post.authorHandle}
            </span>
          ) : null}
        </div>
        <p
          className={cn(
            'mt-0.5 whitespace-pre-wrap break-words text-sm text-foreground',
            isCompact ? 'line-clamp-3' : 'line-clamp-[10]',
          )}
        >
          {post.text}
        </p>
      </div>
    </article>
  );
}
