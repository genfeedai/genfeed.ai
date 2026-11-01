'use client';

import { formatAgentError } from '@genfeedai/agent/utils/format-agent-error.util';
import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { ClipboardService } from '@genfeedai/services/core/clipboard.service';
import { Alert, AlertActions, AlertDescription } from '@ui/primitives/alert';
import { Button } from '@ui/primitives/button';
import { Check, Clipboard } from 'lucide-react';
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
    <Alert className={className} size="sm" variant="destructive">
      <AlertDescription className="whitespace-pre-wrap break-words">
        {displayMessage}
      </AlertDescription>
      <AlertActions>
        <Button
          ariaLabel={isCopied ? 'Error copied' : 'Copy error'}
          icon={
            isCopied ? (
              <Check className="size-4" />
            ) : (
              <Clipboard className="size-4" />
            )
          }
          onClick={copyError}
          size={ButtonSize.ICON}
          title={isCopied ? 'Copied' : 'Copy error'}
          variant={ButtonVariant.GHOST}
          withWrapper={false}
        />
      </AlertActions>
    </Alert>
  );
}
