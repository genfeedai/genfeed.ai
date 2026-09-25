'use client';

import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { useOrgUrl } from '@genfeedai/hooks/navigation/use-org-url';
import type { AgentModelLockNoticeProps } from '@genfeedai/props/settings/model-routing.props';
import { Lock } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

/**
 * Shown in place of an agent model picker while the free-tier lock pins every
 * agent turn to one model. The upgrade link is the only way to unlock choice.
 */
export default function AgentModelLockNotice({
  className,
  lockedModelLabel,
}: AgentModelLockNoticeProps) {
  const translate = useTranslations('ui.agentModelLockNotice');
  const { orgHref } = useOrgUrl();

  return (
    <div
      className={cn(
        'flex flex-col gap-1 rounded border border-border bg-muted/40 px-3 py-2',
        className,
      )}
      data-testid="agent-model-lock-notice"
    >
      <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
        <Lock aria-hidden="true" className="size-3.5 text-muted-foreground" />
        {lockedModelLabel}
      </p>
      <p className="text-xs text-muted-foreground">
        {translate.rich('freePlan', {
          model: lockedModelLabel,
          upgrade: (chunks) => (
            <Link
              className="font-medium text-foreground underline underline-offset-2"
              href={orgHref(APP_ROUTES.SETTINGS.SUBSCRIPTION)}
            >
              {chunks}
            </Link>
          ),
        })}
      </p>
    </div>
  );
}
