import { useContextCoverage } from '@genfeedai/agent/components/useContextCoverage';
import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import {
  ButtonSize,
  ButtonVariant,
  formatPlatformLabel,
} from '@genfeedai/contracts';
import {
  APP_ROUTES,
  createPlatformHomeRoute,
} from '@genfeedai/contracts/constants';
import type {
  ContextCoverageFamily,
  ContextCoverageRecovery,
  ContextCoverageState,
} from '@genfeedai/contracts/interfaces';
import { cn } from '@helpers/formatting/cn/cn.util';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import { Skeleton } from '@ui/primitives/skeleton';
import { useTranslations } from 'next-intl';
import type { ReactElement } from 'react';

interface AgentContextCoveragePanelProps {
  apiService: Pick<AgentApiService, 'getContextCoverage'>;
  brandId?: string;
  className?: string;
  isActive?: boolean;
}

type BadgeVariant = 'destructive' | 'secondary' | 'success' | 'warning';

const STATE_BADGE_VARIANT: Record<ContextCoverageState, BadgeVariant> = {
  available: 'success',
  disconnected: 'destructive',
  empty: 'secondary',
  failed: 'destructive',
  partial: 'warning',
  stale: 'warning',
};

function formatSuccessTime(value: string): string {
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function AgentContextCoveragePanel({
  apiService,
  brandId,
  className,
  isActive = true,
}: AgentContextCoveragePanelProps): ReactElement {
  const translate = useTranslations('agent.contextCoverage');
  const { href } = useOrgUrl();
  const { coverage, reload, status } = useContextCoverage({
    apiService,
    brandId,
    isActive,
  });

  const familyName = (family: ContextCoverageFamily): string =>
    family.family === 'knowledge' && family.purpose
      ? translate(`purpose.${family.purpose}`)
      : translate('socialConnections');

  const recoveryLink = (
    recovery: ContextCoverageRecovery,
  ): { href: string; label: string } | null => {
    if (recovery.kind === 'open_knowledge' && recovery.sourceId) {
      return {
        href: `${href(APP_ROUTES.SETTINGS.KNOWLEDGE)}?sourceId=${encodeURIComponent(recovery.sourceId)}`,
        label: translate('openSource', { title: recovery.label }),
      };
    }
    if (recovery.kind === 'reconnect' && recovery.platform) {
      return {
        href: href(createPlatformHomeRoute(recovery.platform)),
        label: translate('reconnect', {
          platform: formatPlatformLabel(recovery.platform) ?? recovery.platform,
        }),
      };
    }
    return null;
  };

  return (
    <section
      aria-label={translate('title')}
      className={cn('flex flex-col gap-3 p-4', className)}
      data-testid="agent-context-coverage"
    >
      <header className="space-y-1">
        <h3 className="text-sm font-medium text-foreground">
          {translate('title')}
        </h3>
        <p className="text-xs text-muted-foreground">
          {translate('description')}
        </p>
      </header>

      {status === 'loading' || status === 'idle' ? (
        <div className="flex flex-col gap-2" data-testid="coverage-loading">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : null}

      {status === 'error' ? (
        <div className="flex flex-col items-start gap-2" role="alert">
          <p className="text-xs text-muted-foreground">{translate('error')}</p>
          <Button
            onClick={reload}
            size={ButtonSize.SM}
            variant={ButtonVariant.SECONDARY}
          >
            {translate('retry')}
          </Button>
        </div>
      ) : null}

      {status === 'ready' && coverage ? (
        <>
          <p
            className="text-xs text-muted-foreground"
            data-testid="coverage-summary"
          >
            {coverage.isIncomplete
              ? translate('incomplete')
              : translate('complete')}
          </p>
          <ul className="flex flex-col gap-2">
            {coverage.families.map((family) => (
              <li
                className="flex flex-col gap-1.5 rounded-md border border-border p-3"
                data-testid={`coverage-family-${family.family}${family.purpose ? `-${family.purpose}` : ''}`}
                key={`${family.family}:${family.purpose ?? ''}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm text-foreground">
                    {familyName(family)}
                  </span>
                  <Badge variant={STATE_BADGE_VARIANT[family.state]}>
                    {translate(`state.${family.state}`)}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {family.lastSuccessAt
                    ? translate('lastSuccess', {
                        date: formatSuccessTime(family.lastSuccessAt),
                      })
                    : translate('lastSuccessUnavailable')}
                </p>
                {family.recoveries.length > 0 ? (
                  <ul className="flex flex-col gap-1">
                    {family.recoveries.map((recovery) => {
                      const link = recoveryLink(recovery);
                      return link ? (
                        <li
                          key={`${recovery.kind}:${recovery.sourceId ?? recovery.platform}`}
                        >
                          <a
                            className="text-xs font-medium text-foreground underline underline-offset-2"
                            href={link.href}
                            rel="noopener noreferrer"
                            target="_blank"
                          >
                            {link.label}
                          </a>
                        </li>
                      ) : null;
                    })}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}
