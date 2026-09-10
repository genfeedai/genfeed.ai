'use client';

import { cn } from '@genfeedai/helpers';
import { formatNumberWithCommas } from '@genfeedai/helpers/formatting/format/format.helper';
import type { PostCharacterUsageProps } from '@genfeedai/props/posts/post-character-usage.props';

/**
 * Per-channel caption usage for everything the composer is about to publish.
 *
 * Every connected account counts against its own channel ceiling, so one
 * caption can be comfortably short on Facebook and over the limit on X. The
 * limits come from the capability catalog, the same source the publish path
 * validates against, so this list never promises a caption the provider will
 * reject.
 */
export default function PostCharacterUsage({
  items,
  className,
  title,
}: PostCharacterUsageProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <div className={cn('space-y-2', className)}>
      {title ? (
        <p className="text-xs font-medium text-foreground/60">{title}</p>
      ) : null}
      <ul className="space-y-1">
        {items.map((item) => {
          const isOverLimit = item.used > item.limit;

          return (
            <li
              key={item.id}
              className="flex items-baseline justify-between gap-4 text-xs"
            >
              <span className="min-w-0 truncate text-foreground/70">
                {item.accountLabel} ({item.platformLabel})
              </span>
              <span
                className={cn(
                  'shrink-0 tabular-nums',
                  isOverLimit ? 'text-error' : 'text-foreground/60',
                )}
              >
                {formatNumberWithCommas(item.used)}/
                {formatNumberWithCommas(item.limit)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
