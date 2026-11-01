import { CardPadding, CardVariant } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import Card from '@ui/card/Card';
import Image from 'next/image';
import { type ReactElement, useState } from 'react';
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
  const [failedAvatarUrl, setFailedAvatarUrl] = useState<string | null>(null);
  const hasAvatar =
    Boolean(post.avatarUrl) && failedAvatarUrl !== post.avatarUrl;
  return (
    <Card
      as="article"
      variant={CardVariant.BORDERED}
      padding={CardPadding.SM}
      className={className}
      bodyClassName="flex-row"
    >
      {post.avatarUrl && hasAvatar ? (
        <Image
          src={post.avatarUrl}
          onError={() => setFailedAvatarUrl(post.avatarUrl ?? null)}
          width={40}
          height={40}
          alt=""
          className="size-10 shrink-0 rounded-full"
        />
      ) : (
        <div
          aria-hidden="true"
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold text-muted-foreground"
        >
          {name.replace(/^@/, '').charAt(0).toUpperCase()}
        </div>
      )}
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
    </Card>
  );
}
