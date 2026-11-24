'use client';

import { formatAgentError } from '@genfeedai/agent/utils/format-agent-error.util';
import { CopyButton } from '@ui/buttons/CopyButton';
import { Alert, AlertActions, AlertDescription } from '@ui/primitives/alert';
import { type ReactElement, useMemo } from 'react';
import { buildAgentRunFailureCopyText } from './AgentRunFailureCard';

interface AgentErrorMessageProps {
  className?: string;
  message: string;
}

export function AgentErrorMessage({
  className,
  message,
}: AgentErrorMessageProps): ReactElement {
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

  return (
    <Alert className={className} size="sm" variant="destructive">
      <AlertDescription className="whitespace-pre-wrap break-words">
        {displayMessage}
      </AlertDescription>
      <AlertActions>
        <CopyButton
          copiedLabel="Error copied"
          label="Copy error"
          value={() => buildAgentRunFailureCopyText(message)}
        />
      </AlertActions>
    </Alert>
  );
}
