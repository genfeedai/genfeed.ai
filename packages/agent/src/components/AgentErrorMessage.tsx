'use client';

import { ButtonVariant } from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { Button } from '@ui/primitives/button';
import { Check, CircleAlert, Clipboard } from 'lucide-react';
import { type ReactElement, useCallback, useState } from 'react';

interface AgentErrorMessageProps {
  className?: string;
  message: string;
}

export function AgentErrorMessage({
  className,
  message,
}: AgentErrorMessageProps): ReactElement {
  const [isCopied, setIsCopied] = useState(false);

  const copyError = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(message);
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
        'flex items-start gap-2 border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300',
        className,
      )}
    >
      <CircleAlert className="mt-0.5 size-4 shrink-0" />
      <span className="min-w-0 flex-1 whitespace-pre-wrap break-words">
        {message}
      </span>
      <Button
        ariaLabel={isCopied ? 'Error copied' : 'Copy error'}
        title={isCopied ? 'Copied' : 'Copy error'}
        variant={ButtonVariant.UNSTYLED}
        withWrapper={false}
        onClick={copyError}
        className="shrink-0 rounded p-1 text-current hover:bg-red-200/50 dark:hover:bg-red-900/50"
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
