'use client';

import { ButtonVariant } from '@genfeedai/enums';
import { Button } from '@ui/primitives/button';
import { Cpu, Plus } from 'lucide-react';
import Link from 'next/link';

type AgentStrategiesEmptyStateProps = {
  agentsHref: string;
};

export default function AgentStrategiesEmptyState({
  agentsHref,
}: AgentStrategiesEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-lg bg-secondary p-10 text-center shadow-border">
      <span className="flex size-14 items-center justify-center rounded-full bg-white/5 text-white/40">
        <Cpu className="size-7" />
      </span>
      <div className="space-y-1">
        <p className="text-lg font-medium">No agents available</p>
        <p className="text-sm text-foreground/50">
          Add an agent first, then configure its schedule and autonomy here.
        </p>
      </div>
      <Button asChild variant={ButtonVariant.DEFAULT} withWrapper={false}>
        <Link href={agentsHref}>
          <Plus /> Add agent
        </Link>
      </Button>
    </div>
  );
}
