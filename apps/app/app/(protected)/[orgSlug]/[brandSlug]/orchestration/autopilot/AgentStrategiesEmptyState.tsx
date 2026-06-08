'use client';

import { ButtonVariant } from '@genfeedai/enums';
import { Button } from '@ui/primitives/button';
import Link from 'next/link';
import { HiOutlineCpuChip, HiPlus } from 'react-icons/hi2';

type AgentStrategiesEmptyStateProps = {
  onAddClick: () => void;
};

export default function AgentStrategiesEmptyState({
  onAddClick,
}: AgentStrategiesEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-white/10 p-10 text-center">
      <span className="flex size-14 items-center justify-center rounded-full bg-white/5 text-white/40">
        <HiOutlineCpuChip className="size-7" />
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
          icon={<HiPlus />}
          variant={ButtonVariant.DEFAULT}
          onClick={onAddClick}
        />
        <Link href="/orchestration/new">
          <Button label="Open Full Wizard" variant={ButtonVariant.SECONDARY} />
        </Link>
      </div>
    </div>
  );
}
