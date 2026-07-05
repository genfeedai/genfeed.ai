'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { formatCompactNumber } from '@helpers/formatting/format/format.helper';
import type { AgentStrategy } from '@services/automation/agent-strategies.service';
import Card from '@ui/card/Card';
import { Button, Button as PrimitiveButton } from '@ui/primitives/button';
import { formatDistanceToNow } from 'date-fns';
import Link from 'next/link';
import { HiOutlinePlayCircle } from 'react-icons/hi2';

type Props = {
  onRunNow: (strategyId: string) => Promise<void>;
  onToggle: (strategyId: string, isActive: boolean) => Promise<void>;
  strategy: AgentStrategy;
};

export default function ContentTeamMemberCard({
  onRunNow,
  onToggle,
  strategy,
}: Props) {
  const lastRunLabel = strategy.lastRunAt
    ? formatDistanceToNow(new Date(strategy.lastRunAt), { addSuffix: true })
    : 'Never';

  return (
    <Card
      className="h-full"
      bodyClassName="flex h-full flex-col justify-between gap-5 p-4"
      label={strategy.label}
      description={strategy.displayRole ?? strategy.agentType}
      headerAction={
        <span
          className={
            strategy.isActive
              ? 'inline-flex rounded-full bg-emerald-500/12 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-300'
              : 'inline-flex rounded-full bg-white/[0.06] px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground/50'
          }
        >
          {strategy.isActive ? 'Active' : 'Paused'}
        </span>
      }
    >
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-foreground/45">Budget</p>
          <p className="mt-1 font-medium text-foreground">
            {formatCompactNumber(strategy.creditsUsedToday)} /{' '}
            {formatCompactNumber(strategy.dailyCreditBudget)}
          </p>
        </div>
        <div>
          <p className="text-foreground/45">Reports To</p>
          <p className="mt-1 font-medium text-foreground">
            {strategy.reportsToLabel || 'Main Orchestrator'}
          </p>
        </div>
        <div>
          <p className="text-foreground/45">Platforms</p>
          <p className="mt-1 font-medium text-foreground">
            {strategy.platforms.length > 0
              ? strategy.platforms.join(', ')
              : 'Not set'}
          </p>
        </div>
        <div>
          <p className="text-foreground/45">Last Run</p>
          <p className="mt-1 font-medium text-foreground">{lastRunLabel}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-white/[0.08] pt-4">
        <Button
          icon={<HiOutlinePlayCircle />}
          label="Run Now"
          onClick={() => onRunNow(strategy.id)}
          size={ButtonSize.SM}
          variant={ButtonVariant.SECONDARY}
        />
        <Button
          label={strategy.isActive ? 'Pause' : 'Activate'}
          onClick={() => onToggle(strategy.id, !strategy.isActive)}
          size={ButtonSize.SM}
          variant={ButtonVariant.SECONDARY}
        />
        <PrimitiveButton
          asChild
          variant={ButtonVariant.SECONDARY}
          size={ButtonSize.SM}
          className="ml-auto text-xs tracking-[0.12em]"
        >
          <Link href={`/orchestration/${strategy.id}`}>Open Detail</Link>
        </PrimitiveButton>
      </div>
    </Card>
  );
}
