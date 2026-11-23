'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { ConnectedAccountStackProps } from '@genfeedai/props/ui/display/connected-account.props';
import { Button } from '@ui/primitives/button';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@ui/primitives/hover-card';
import ConnectedAccount from './ConnectedAccount';
import ConnectedAccountAvatar from './ConnectedAccountAvatar';
import { getConnectedAccountText } from './connected-account.util';

const DEFAULT_MAX = 3;

const OVERFLOW_CLASS =
  'flex size-8 shrink-0 items-center justify-center rounded-full bg-border text-2xs font-medium tabular-nums text-foreground/80 ring-2 ring-background';

/**
 * Connected accounts as overlapping avatars: the first `max` accounts with
 * their platform badge, then a "+N" chip. Hover or keyboard focus lists every
 * account with its handle. The trigger is a button so a surrounding clickable
 * row ignores the click.
 */
export default function ConnectedAccountStack({
  className,
  emptyLabel = '-',
  items,
  max = DEFAULT_MAX,
}: ConnectedAccountStackProps) {
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
    .map((item) => getConnectedAccountText(item).primary)
    .join(', ');

  return (
    <HoverCard openDelay={150} closeDelay={50}>
      <HoverCardTrigger asChild>
        <Button
          ariaLabel={`${items.length} connected: ${summary}`}
          className={cn(
            'flex w-fit items-center -space-x-2 rounded-full focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
            className,
          )}
          data-testid="connected-account-stack"
          variant={ButtonVariant.UNSTYLED}
          withWrapper={false}
        >
          {visible.map((item) => (
            <ConnectedAccountAvatar
              account={item}
              className="ring-2 ring-background"
              key={item.id}
              size="md"
            />
          ))}
          {overflow > 0 ? (
            <span className={OVERFLOW_CLASS}>+{overflow}</span>
          ) : null}
        </Button>
      </HoverCardTrigger>
      <HoverCardContent align="start" className="w-64 p-1.5">
        <ul className="flex flex-col">
          {items.map((item) => (
            <li className="min-w-0 rounded px-2 py-1.5 text-sm" key={item.id}>
              <ConnectedAccount account={item} size="xs" />
            </li>
          ))}
        </ul>
      </HoverCardContent>
    </HoverCard>
  );
}
