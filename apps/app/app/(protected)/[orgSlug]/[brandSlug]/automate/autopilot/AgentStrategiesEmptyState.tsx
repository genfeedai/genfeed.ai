'use client';

import { ButtonVariant } from '@genfeedai/enums';
import { Button } from '@ui/primitives/button';
import { Cpu, Plus } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

type AgentStrategiesEmptyStateProps = {
  agentsHref: string;
};

export default function AgentStrategiesEmptyState({
  agentsHref,
}: AgentStrategiesEmptyStateProps) {
  const translate = useTranslations('common.automation.autopilot');

  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-lg bg-secondary p-10 text-center shadow-border">
      <span className="flex size-14 items-center justify-center rounded-full bg-white/5 text-white/40">
        <Cpu className="size-7" />
      </span>
      <div className="space-y-1">
        <p className="text-lg font-medium">{translate('emptyTitle')}</p>
        <p className="text-sm text-foreground/50">
          {translate('emptyDescription')}
        </p>
      </div>
      <Button asChild variant={ButtonVariant.DEFAULT} withWrapper={false}>
        <Link href={agentsHref}>
          <Plus /> {translate('emptyAction')}
        </Link>
      </Button>
    </div>
  );
}
