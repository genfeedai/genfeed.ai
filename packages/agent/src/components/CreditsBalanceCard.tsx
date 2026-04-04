'use client';

import type { AgentUiAction } from '@cloud/agent/models/agent-chat.model';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import type { ReactElement } from 'react';
import { HiCurrencyDollar } from 'react-icons/hi2';

interface CreditsBalanceCardProps {
  action: AgentUiAction;
}

export function CreditsBalanceCard({
  action,
}: CreditsBalanceCardProps): ReactElement {
  const { orgHref } = useOrgUrl();
  const balance = action.balance ?? 0;
  const usagePercent = action.usagePercent ?? 0;
  const usageLabel = action.usageLabel ?? `${usagePercent}% used`;

  const barColor =
    usagePercent >= 90
      ? 'bg-red-500'
      : usagePercent >= 70
        ? 'bg-amber-500'
        : 'bg-green-500';

  return (
    <div className="my-2 rounded-lg border border-border bg-background p-4">
      <div className="mb-3 flex items-center gap-2">
        <HiCurrencyDollar className="h-5 w-5 text-amber-500" />
        <h3 className="text-sm font-semibold">
          {action.title || 'Credits Balance'}
        </h3>
      </div>

      {action.description && (
        <p className="mb-3 text-xs text-muted-foreground">
          {action.description}
        </p>
      )}

      {/* Balance number */}
      <div className="mb-3 text-center">
        <span className="text-3xl font-bold text-foreground">
          {balance.toLocaleString()}
        </span>
        <p className="mt-0.5 text-xs text-muted-foreground">
          credits remaining
        </p>
      </div>

      {/* Usage bar */}
      <div className="mb-3">
        <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
          <span>{usageLabel}</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div
            className={`h-full rounded-full ${barColor} transition-all duration-300`}
            style={{ width: `${Math.min(usagePercent, 100)}%` }}
          />
        </div>
      </div>

      {/* Buy Credits CTA */}
      {action.ctas && action.ctas.length > 0 ? (
        <div className="flex gap-2">
          {action.ctas.map((cta) => (
            <a
              key={cta.label}
              href={cta.href}
              className="flex flex-1 items-center justify-center gap-1.5 rounded bg-primary px-3 py-2 text-xs font-black text-primary-foreground transition-colors hover:bg-primary/90"
            >
              {cta.label}
            </a>
          ))}
        </div>
      ) : (
        <a
          href={orgHref('/settings/organization/billing')}
          className="flex w-full items-center justify-center gap-1.5 rounded bg-primary px-4 py-2 text-sm font-black text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <HiCurrencyDollar className="h-4 w-4" />
          Buy Credits
        </a>
      )}
    </div>
  );
}
