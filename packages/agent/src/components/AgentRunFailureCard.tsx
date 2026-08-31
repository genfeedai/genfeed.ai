'use client';

import { formatAgentError } from '@genfeedai/agent/utils/format-agent-error.util';
import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { ClipboardService } from '@genfeedai/services/core/clipboard.service';
import { cn } from '@helpers/formatting/cn/cn.util';
import { Button } from '@ui/primitives/button';
import { Check, Copy, RefreshCw, TriangleAlert } from 'lucide-react';
import { type ReactElement, useCallback, useState } from 'react';

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
  const formatted = formatAgentError(error);
  const [isCopied, setIsCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await ClipboardService.getInstance().copyToClipboard(
        buildAgentRunFailureCopyText(error),
      );
      setIsCopied(true);
      window.setTimeout(() => setIsCopied(false), 1500);
    } catch {
      setIsCopied(false);
    }
  }, [error]);

  return (
    <div
      className={cn(
        'mx-auto mb-4 w-full max-w-2xl rounded-lg bg-background-secondary px-4 py-3 text-foreground shadow-border',
        className,
      )}
      role="alert"
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-destructive/12 text-destructive shadow-border">
          <TriangleAlert className="size-3.5" aria-hidden />
        </div>
        <div className="flex min-w-0 flex-1 items-start justify-between gap-3">
          <div className="min-w-0 space-y-0.5">
            <p className="text-sm font-medium text-destructive">
              {formatted.title}
            </p>
            <p className="text-xs leading-snug text-foreground/80">
              {formatted.summary}
            </p>
            {formatted.detail ? (
              <p className="line-clamp-3 max-h-24 overflow-y-auto whitespace-pre-wrap break-words font-mono text-2xs leading-snug text-foreground/65">
                {formatted.detail}
              </p>
            ) : null}
            {formatted.recovery ? (
              <p className="text-2xs leading-snug text-muted-foreground">
                {formatted.recovery}
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 items-start gap-1.5">
            <Button
              variant={ButtonVariant.GHOST}
              size={ButtonSize.ICON}
              withWrapper={false}
              ariaLabel={isCopied ? 'Error copied' : 'Copy error'}
              tooltip={isCopied ? 'Copied' : 'Copy error for agent'}
              onClick={() => {
                void handleCopy();
              }}
              className="size-8 border border-destructive/30 text-destructive hover:bg-destructive/20 hover:text-destructive"
              icon={
                isCopied ? (
                  <Check className="size-3.5" />
                ) : (
                  <Copy className="size-3.5" />
                )
              }
            />
            {onRetry ? (
              <Button
                variant={ButtonVariant.SECONDARY}
                withWrapper={false}
                isLoading={isRetrying}
                isDisabled={isRetrying}
                onClick={() => {
                  void onRetry();
                }}
                className="h-8 shrink-0 gap-1.5 self-start border-destructive/40 bg-destructive/20 px-3 text-xs font-medium text-destructive hover:bg-destructive/30"
                icon={<RefreshCw className="size-3.5" />}
              >
                Retry
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
