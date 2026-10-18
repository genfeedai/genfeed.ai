import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { PromptBarToolbarProps } from '@genfeedai/props/prompt-bars/prompt-bar-toolbar.props';
import type { ReactElement } from 'react';

/**
 * The one prompt-bar toolbar row shared by Agent and Studio: tools on the
 * left, setup and submission on the right. Surfaces only fill the slots.
 * The row never wraps: submission keeps its size and the tools scroll
 * sideways when they run out of room. The scroller keeps 6px of vertical
 * padding (cancelled by the negative margin) so the 44px touch targets that
 * 32px icon buttons extend with `::after` are not clipped by its overflow.
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
        'mt-2 flex min-w-0 flex-nowrap items-center justify-between gap-2',
        density === 'compact' ? 'min-h-8' : 'min-h-9',
        className,
      )}
      data-prompt-bar-toolbar=""
      data-testid="prompt-bar-toolbar"
    >
      <div
        aria-label={leadingLabel}
        className="-my-1.5 flex min-w-0 flex-1 flex-nowrap items-center gap-1 overflow-x-auto py-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        data-prompt-bar-leading=""
        role="group"
      >
        {leading}
      </div>
      <div
        aria-label={trailingLabel}
        className="ml-auto flex shrink-0 flex-nowrap items-center justify-end gap-1"
        role="group"
      >
        {trailing}
      </div>
    </div>
  );
}
