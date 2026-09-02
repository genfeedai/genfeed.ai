'use client';

import { formatAgentError } from '@genfeedai/agent/utils/format-agent-error.util';
import { ButtonVariant } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { ClipboardService } from '@genfeedai/services/core/clipboard.service';
import { Button } from '@ui/primitives/button';
import { Check, CircleAlert, Clipboard } from 'lucide-react';
import { type ReactElement, useCallback, useMemo, useState } from 'react';
import { buildAgentRunFailureCopyText } from './AgentRunFailureCard';

interface AgentErrorMessageProps {
  className?: string;
  message: string;
}

export function AgentErrorMessage({
  className,
  message,
}: AgentErrorMessageProps): ReactElement {
  const [isCopied, setIsCopied] = useState(false);
  const formatted = useMemo(() => formatAgentError(message), [message]);
  const displayMessage = useMemo(() => {
    const parts = [formatted.title, formatted.summary];
    if (formatted.detail) {
      parts.push(formatted.detail);
    }
    if (formatted.recovery) {
      parts.push(formatted.recovery);
    }
    return parts.join(' ');
  }, [formatted]);

  const copyError = useCallback(async () => {
    try {
      await ClipboardService.getInstance().copyToClipboard(
        buildAgentRunFailureCopyText(message),
      );
      setIsCopied(true);
      window.setTimeout(() => setIsCopied(false), 1500);
    } catch {
      setIsCopied(false);
    }
  }, [message]);

  return (
    <div
      role="alert"
      className={cn(
        'flex items-start gap-2 border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive   ',
        className,
      )}
    >
      <CircleAlert className="mt-0.5 size-4 shrink-0" />
      <span className="min-w-0 flex-1 whitespace-pre-wrap break-words">
        {displayMessage}
      </span>
      <Button
        ariaLabel={isCopied ? 'Error copied' : 'Copy error'}
        title={isCopied ? 'Copied' : 'Copy error'}
        variant={ButtonVariant.UNSTYLED}
        withWrapper={false}
        onClick={copyError}
        className="shrink-0 rounded p-1 text-current hover:bg-red-200/50 "
      >
        {isCopied ? (
          <Check className="size-4" />
        ) : (
          <Clipboard className="size-4" />
        )}
      </Button>
    </div>
  );
}
