import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { PromptBarToolbarProps } from '@genfeedai/props/prompt-bars/prompt-bar-toolbar.props';
import type { ReactElement } from 'react';

/**
 * The one prompt-bar toolbar row shared by Agent, Studio and every other
 * composer: tools on the left, submission on the right. Surfaces only fill the
 * slots. The left group reads mode, then setup chips; Enhance and the
 * reference `+` form one cluster pushed to the group's right edge.
 *
 * Nothing in the row scrolls. Submission keeps its size on the right and the
 * tools wrap onto further lines when they run out of room. The tools group is
 * the `prompt-bar` container, so a surface can step its controls down by the
 * space they actually have (labels, then an overflow menu) with container
 * queries instead of measuring.
 */
export default function PromptBarToolbar({
  className,
  enhance,
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
        'mt-2 flex min-h-8 min-w-0 flex-wrap items-center justify-between gap-1',
        className,
      )}
      data-prompt-bar-toolbar=""
      data-testid="prompt-bar-toolbar"
    >
      <div
        aria-label={leadingLabel}
        className="@container/prompt-bar flex min-w-0 flex-1 flex-wrap items-center gap-1"
        data-prompt-bar-leading=""
        role="group"
      >
        {mode}
        {leading}
        {enhance || reference ? (
          // Enhance and Reference sit at the right edge of the tools group,
          // next to submission, and wrap there when the row runs out of room.
          <div className="ml-auto flex shrink-0 items-center gap-1">
            {enhance}
            {reference}
          </div>
        ) : null}
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
