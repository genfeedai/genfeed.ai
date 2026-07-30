'use client';

import { APP_ROUTES } from '@genfeedai/constants';
import { ButtonVariant } from '@genfeedai/enums';
import { Button } from '@ui/primitives/button';
import { Cpu, Plus } from 'lucide-react';
import Link from 'next/link';

type AgentStrategiesEmptyStateProps = {
  onAddClick: () => void;
};

export default function AgentStrategiesEmptyState({
  onAddClick,
}: AgentStrategiesEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-lg bg-secondary p-10 text-center shadow-border">
      <span className="flex size-14 items-center justify-center rounded-full bg-white/5 text-white/40">
        <Cpu className="size-7" />
      </span>
      <div className="space-y-1">
        <p className="text-lg font-medium">No autopilot policies yet</p>
        <p className="text-sm text-foreground/50">
          Create your first autopilot policy to start scheduling agent runs.
        </p>
      </div>
      <div className="flex items-center gap-3">
        <Button
          label="Add Autopilot"
          icon={<Plus />}
          variant={ButtonVariant.DEFAULT}
          onClick={onAddClick}
        />
        <Link href={APP_ROUTES.ORCHESTRATION.NEW}>
          <Button label="Open Full Wizard" variant={ButtonVariant.SECONDARY} />
        </Link>
      </div>
    </div>
  );
}
