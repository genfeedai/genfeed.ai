'use client';

import { formatAgentError } from '@genfeedai/agent/utils/format-agent-error.util';
import { CopyButton } from '@ui/buttons/CopyButton';
import { Alert, AlertActions, AlertDescription } from '@ui/primitives/alert';
import { useTranslations } from 'next-intl';
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
  const translate = useTranslations('agent.errorMessage');
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
          copiedLabel={translate('errorCopied')}
          label={translate('copyError')}
          value={() => buildAgentRunFailureCopyText(message)}
        />
      </AlertActions>
    </Alert>
  );
}
