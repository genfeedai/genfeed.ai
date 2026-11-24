'use client';

import { formatAgentError } from '@genfeedai/agent/utils/format-agent-error.util';
import {
  AgentFailureReason,
  ButtonVariant,
  CardPadding,
  ModalEnum,
} from '@genfeedai/contracts';
import { openModal } from '@genfeedai/helpers/ui/modal/modal.helper';
import { cn } from '@helpers/formatting/cn/cn.util';
import { CopyButton } from '@ui/buttons/CopyButton';
import Card from '@ui/card/Card';
import { Button } from '@ui/primitives/button';
import { Coins, RefreshCw, TriangleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactElement } from 'react';

interface AgentRunFailureCardProps {
  error: string | null | undefined;
  className?: string;
  onRetry?: () => void | Promise<void>;
  isRetrying?: boolean;
}

/** Full diagnostic blob for dropping into an agent/dev chat. */
export function buildAgentRunFailureCopyText(
  rawError: string | null | undefined,
): string {
  const formatted = formatAgentError(rawError);
  const lines = [
    `## Agent run failure`,
    ``,
    `**Title:** ${formatted.title}`,
    `**Summary:** ${formatted.summary}`,
  ];
  if (formatted.detail) {
    lines.push(`**Detail:** ${formatted.detail}`);
  }
  if (formatted.recovery) {
    lines.push(`**Recovery:** ${formatted.recovery}`);
  }
  if (rawError?.trim()) {
    lines.push(``, `### Raw error`, ``, '```', rawError.trim(), '```');
  }
  lines.push(
    ``,
    `**URL:** ${typeof window !== 'undefined' ? window.location.href : ''}`,
  );
  lines.push(`**Time:** ${new Date().toISOString()}`);
  return lines.join('\n');
}

export function AgentRunFailureCard({
  error,
  className,
  onRetry,
  isRetrying = false,
}: AgentRunFailureCardProps): ReactElement {
  const translate = useTranslations('agent.runFailureCard');
  const formatted = formatAgentError(error);

  return (
    <Card
      padding={CardPadding.SM}
      className={cn('mx-auto mb-4 w-full max-w-2xl', className)}
      role="alert"
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-destructive/10 text-destructive shadow-border">
          <TriangleAlert className="size-3.5" aria-hidden />
        </div>
        <div className="flex min-w-0 flex-1 items-start justify-between gap-3">
          <div className="min-w-0 space-y-0.5">
            <p className="text-sm font-medium text-destructive">
              {formatted.title}
            </p>
            <p className="text-xs leading-snug text-destructive/90">
              {formatted.summary}
            </p>
            {formatted.detail ? (
              <p className="line-clamp-3 max-h-24 overflow-y-auto whitespace-pre-wrap break-words font-mono text-2xs leading-snug text-destructive/70">
                {formatted.detail}
              </p>
            ) : null}
            {formatted.recovery ? (
              <p className="text-2xs leading-snug text-destructive/70">
                {formatted.recovery}
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 items-start gap-1.5">
            <CopyButton
              copiedLabel={translate('errorCopied')}
              label={translate('copyError')}
              value={() => buildAgentRunFailureCopyText(error)}
              variant={ButtonVariant.DESTRUCTIVE}
            />
            {formatted.reason === AgentFailureReason.INSUFFICIENT_CREDITS ? (
              <Button
                variant={ButtonVariant.DESTRUCTIVE}
                withWrapper={false}
                onClick={() => openModal(ModalEnum.CREDITS_REQUIRED)}
                className="shrink-0 self-start"
                icon={<Coins className="size-3.5" />}
              >
                {translate('getCredits')}
              </Button>
            ) : null}
            {onRetry && formatted.isRetryable ? (
              <Button
                variant={ButtonVariant.DESTRUCTIVE}
                withWrapper={false}
                isLoading={isRetrying}
                isDisabled={isRetrying}
                onClick={() => {
                  void onRetry();
                }}
                className="shrink-0 self-start"
                icon={<RefreshCw className="size-3.5" />}
              >
                {translate('retry')}
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </Card>
  );
}
