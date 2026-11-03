import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { PromptBarNoticeProps } from '@genfeedai/props/prompt-bars/prompt-bar-notice.props';
import type { ReactElement } from 'react';

/**
 * A line of text inside a prompt bar's banner slot: an error or a status. The
 * one place the bar's notice padding and colours live, so every app's bar
 * reads the same when something goes wrong.
 */
export default function PromptBarNotice({
  children,
  tone = 'error',
}: PromptBarNoticeProps): ReactElement {
  return (
    <p
      className={cn(
        'p-3 text-sm',
        tone === 'error' ? 'text-destructive' : 'text-muted-foreground',
      )}
      role={tone === 'error' ? 'alert' : 'status'}
    >
      {children}
    </p>
  );
}
