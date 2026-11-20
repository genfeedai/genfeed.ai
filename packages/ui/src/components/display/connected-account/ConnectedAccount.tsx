'use client';

import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { ConnectedAccountProps } from '@genfeedai/props/ui/display/connected-account.props';
import { SimpleTooltip } from '@ui/primitives/tooltip';
import ConnectedAccountAvatar from './ConnectedAccountAvatar';
import { getConnectedAccountText } from './connected-account.util';

/**
 * The one way Genfeed shows a connected social account: its real avatar with
 * the platform logo on the corner, then its `@handle`. Filters, pickers,
 * channel chips, inbox rows, the calendar, settings and analytics all render
 * this, so an account never looks different from one surface to the next.
 */
export default function ConnectedAccount({
  account,
  className,
  layout = 'inline',
  meta,
  size = 'md',
}: ConnectedAccountProps) {
  const { handle, name, platformLabel, primary } =
    getConnectedAccountText(account);

  if (layout === 'inline') {
    return (
      <span
        className={cn('inline-flex min-w-0 items-center gap-2', className)}
        title={primary}
      >
        <ConnectedAccountAvatar account={account} isDecorative size={size} />
        <span className="truncate">{primary}</span>
      </span>
    );
  }

  const title = name ?? primary;
  const subtitle = name ? (handle ?? platformLabel) : platformLabel;

  return (
    <span className={cn('flex min-w-0 items-center gap-3', className)}>
      <ConnectedAccountAvatar account={account} isDecorative size={size} />
      <span className="min-w-0 text-left leading-tight">
        <SimpleTooltip label={title}>
          <span className="block truncate text-sm font-medium">{title}</span>
        </SimpleTooltip>
        <SimpleTooltip label={subtitle}>
          <span className="block truncate text-xs text-muted-foreground">
            {subtitle}
            {meta ? <> · {meta}</> : null}
          </span>
        </SimpleTooltip>
      </span>
    </span>
  );
}
