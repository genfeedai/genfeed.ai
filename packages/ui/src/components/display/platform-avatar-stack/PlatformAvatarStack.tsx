'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import { getPlatformDisplayName } from '@genfeedai/contracts/constants';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { getPlatformIcon } from '@genfeedai/helpers/ui/platform-icon/platform-icon.helper';
import type { PlatformAvatarStackProps } from '@genfeedai/props/ui/display/platform-avatar-stack.props';
import { Button } from '@ui/primitives/button';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@ui/primitives/hover-card';

const DEFAULT_MAX = 3;

const AVATAR_CLASS =
  'flex size-6 shrink-0 items-center justify-center rounded-full bg-background-tertiary ring-2 ring-background';

/**
 * Connected platforms as overlapping avatars: the first `max` icons, then a
 * "+N" chip. Hover or keyboard focus lists every account with its handle.
 * The trigger is a button so a surrounding clickable row ignores the click.
 */
export default function PlatformAvatarStack({
  className,
  emptyLabel = '-',
  items,
  max = DEFAULT_MAX,
}: PlatformAvatarStackProps) {
  if (items.length === 0) {
    return (
      <span className={cn('text-sm text-foreground/50', className)}>
        {emptyLabel}
      </span>
    );
  }

  const visible = items.slice(0, max);
  const overflow = items.length - visible.length;
  const summary = items
    .map((item) => getPlatformDisplayName(item.platform))
    .join(', ');

  return (
    <HoverCard openDelay={150} closeDelay={50}>
      <HoverCardTrigger asChild>
        <Button
          ariaLabel={`${items.length} connected: ${summary}`}
          className={cn(
            'flex w-fit items-center -space-x-1.5 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            className,
          )}
          data-testid="platform-avatar-stack"
          variant={ButtonVariant.UNSTYLED}
          withWrapper={false}
        >
          {visible.map((item) => (
            <span className={AVATAR_CLASS} key={item.id}>
              {getPlatformIcon(item.platform, 'size-3.5')}
            </span>
          ))}
          {overflow > 0 ? (
            <span
              className={cn(
                AVATAR_CLASS,
                'text-2xs font-medium tabular-nums text-foreground/80',
              )}
            >
              +{overflow}
            </span>
          ) : null}
        </Button>
      </HoverCardTrigger>
      <HoverCardContent align="start" className="w-64 p-1.5">
        <ul className="flex flex-col">
          {items.map((item) => (
            <li
              className="flex min-w-0 items-center gap-2 rounded px-2 py-1.5 text-sm"
              key={item.id}
            >
              <span className="flex size-4 shrink-0 items-center justify-center">
                {getPlatformIcon(item.platform, 'size-4')}
              </span>
              <span className="shrink-0 text-foreground">
                {getPlatformDisplayName(item.platform)}
              </span>
              {item.username || item.label ? (
                <span className="min-w-0 truncate text-foreground/50">
                  {item.username ? `@${item.username}` : item.label}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      </HoverCardContent>
    </HoverCard>
  );
}
