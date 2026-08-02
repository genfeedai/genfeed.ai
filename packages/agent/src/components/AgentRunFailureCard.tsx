'use client';

import { formatAgentError } from '@genfeedai/agent/utils/format-agent-error.util';
import { ButtonVariant } from '@genfeedai/enums';
import { cn } from '@helpers/formatting/cn/cn.util';
import { Button } from '@ui/primitives/button';
import { RefreshCw, TriangleAlert } from 'lucide-react';
import type { ReactElement } from 'react';

interface AgentRunFailureCardProps {
  error: string | null | undefined;
  className?: string;
  onRetry?: () => void | Promise<void>;
  isRetrying?: boolean;
}

export function AgentRunFailureCard({
  error,
  className,
  onRetry,
  isRetrying = false,
}: AgentRunFailureCardProps): ReactElement {
  const formatted = formatAgentError(error);

  return (
    <div
      className={cn(
        'mb-3 w-full rounded-lg border border-destructive/50 bg-destructive/15 px-4 py-3 text-destructive shadow-[0_1px_0_rgba(0,0,0,0.18)]',
        className,
      )}
      role="alert"
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md border border-destructive/40 bg-destructive/20 text-destructive">
          <TriangleAlert className="size-3.5" aria-hidden />
        </div>
        <div className="flex min-w-0 flex-1 items-start justify-between gap-3">
          <div className="min-w-0 space-y-0.5">
            <p className="text-sm font-medium text-destructive">
              {formatted.title}
            </p>
            <p className="text-xs leading-snug text-destructive/85">
              {formatted.summary}
            </p>
            {formatted.detail ? (
              <p className="line-clamp-2 font-mono text-[11px] leading-snug text-destructive/70">
                {formatted.detail}
              </p>
            ) : null}
            {formatted.recovery ? (
              <p className="text-[11px] leading-snug text-destructive/75">
                {formatted.recovery}
              </p>
            ) : null}
          </div>
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
  );
}
