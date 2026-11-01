'use client';

import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { useOrgUrl } from '@genfeedai/hooks/navigation/use-org-url';
import { Alert, AlertDescription, AlertTitle } from '@ui/primitives/alert';
import { Lock } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { AgentModelLockNoticeProps } from '@/props/settings/model-routing.props';

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
    <Alert
      className={className}
      data-testid="agent-model-lock-notice"
      icon={<Lock className="size-4" />}
      size="sm"
      variant="note"
    >
      <AlertTitle>{lockedModelLabel}</AlertTitle>
      <AlertDescription>
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
      </AlertDescription>
    </Alert>
  );
}
