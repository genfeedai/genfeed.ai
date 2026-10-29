import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { PromptBarToolbarProps } from '@genfeedai/props/prompt-bars/prompt-bar-toolbar.props';
import type { ReactElement } from 'react';

/**
 * The one prompt-bar toolbar row shared by Agent, Studio and every other
 * composer: tools on the left, submission on the right. Surfaces only fill the
 * slots. The left group reads mode, then the surface's setup chips, then the
 * `+` that adds context, last. The right group holds only the submit slot.
 *
 * Nothing in the row scrolls. Submission keeps its size on the right and the
 * tools wrap onto further lines when they run out of room. The row is the
 * `prompt-bar` container, so every control in it (left or right) steps down
 * together by the space the row actually has (labels, then an overflow menu)
 * with container queries instead of measuring.
 */
export default function PromptBarToolbar({
  className,
  leading,
  leadingLabel,
  mode,
  reference,
  trailing,
  trailingLabel,
}: PromptBarToolbarProps): ReactElement {
  return (
    <div
      className={cn(
        '@container/prompt-bar mt-2 flex min-h-8 w-full min-w-0 flex-wrap items-center justify-between gap-1',
        className,
      )}
      data-prompt-bar-toolbar=""
      data-testid="prompt-bar-toolbar"
    >
      <div
        aria-label={leadingLabel}
        className="flex min-w-0 flex-1 flex-wrap items-center gap-1"
        data-prompt-bar-leading=""
        role="group"
      >
        {mode}
        {leading}
        {reference}
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
