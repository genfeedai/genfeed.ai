'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import { CardEmptyContent } from '@ui/card/empty/CardEmpty';
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
    <CardEmptyContent
      icon={Cpu}
      label={translate('emptyTitle')}
      description={translate('emptyDescription')}
      actions={
        <Button asChild variant={ButtonVariant.DEFAULT} withWrapper={false}>
          <Link href={agentsHref}>
            <Plus /> {translate('emptyAction')}
          </Link>
        </Button>
      }
    />
  );
}
