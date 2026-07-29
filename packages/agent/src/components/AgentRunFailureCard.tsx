'use client';

import { formatAgentError } from '@genfeedai/agent/utils/format-agent-error.util';
import { ButtonVariant } from '@genfeedai/enums';
import { cn } from '@helpers/formatting/cn/cn.util';
import { Button } from '@ui/primitives/button';
import type { ReactElement } from 'react';
import {
  HiOutlineArrowPath,
  HiOutlineExclamationTriangle,
} from 'react-icons/hi2';

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
        'mb-3 w-full rounded-lg border border-destructive/35 bg-background-secondary/90 px-4 py-3 shadow-[0_1px_0_rgba(0,0,0,0.18)]',
        className,
      )}
      role="alert"
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md border border-destructive/30 bg-destructive/10 text-destructive">
          <HiOutlineExclamationTriangle className="size-3.5" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">
            {formatted.title}
          </p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {formatted.summary}
          </p>
          {formatted.detail ? (
            <p className="mt-1.5 line-clamp-2 font-mono text-[11px] leading-4 text-muted-foreground/80">
              {formatted.detail}
            </p>
          ) : null}
          {formatted.recovery ? (
            <p className="mt-2 text-[11px] leading-4 text-foreground/55">
              {formatted.recovery}
            </p>
          ) : null}
          {onRetry ? (
            <div className="mt-3">
              <Button
                variant={ButtonVariant.SECONDARY}
                withWrapper={false}
                isLoading={isRetrying}
                isDisabled={isRetrying}
                onClick={() => {
                  void onRetry();
                }}
                className="h-8 gap-1.5 px-3 text-xs font-medium"
                icon={<HiOutlineArrowPath className="size-3.5" />}
              >
                Retry
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
