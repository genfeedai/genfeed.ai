import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { PromptBarToolbarProps } from '@genfeedai/props/prompt-bars/prompt-bar-toolbar.props';
import type { ReactElement } from 'react';

/**
 * The one prompt-bar toolbar row shared by Agent and Studio: tools on the
 * left, setup and submission on the right. Surfaces only fill the slots.
 */
export default function PromptBarToolbar({
  className,
  density = 'default',
  leading,
  leadingLabel,
  trailing,
  trailingLabel,
}: PromptBarToolbarProps): ReactElement {
  return (
    <div
      className={cn(
        'mt-2 flex min-w-0 flex-wrap items-center justify-between gap-2',
        density === 'compact' ? 'min-h-8' : 'min-h-9',
        className,
      )}
      data-testid="prompt-bar-toolbar"
    >
      <div
        aria-label={leadingLabel}
        className="flex min-w-0 flex-1 flex-wrap items-center gap-1"
        role="group"
      >
        {leading}
      </div>
      <div
        aria-label={trailingLabel}
        className="ml-auto flex min-w-0 max-w-full flex-wrap items-center justify-end gap-1"
        role="group"
      >
        {trailing}
      </div>
    </div>
  );
}
