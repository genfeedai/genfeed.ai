'use client';

import Link from 'next/link';

type AgentStrategiesInfoBannerProps = {
  workflowsHref: string;
};

export default function AgentStrategiesInfoBanner({
  workflowsHref,
}: AgentStrategiesInfoBannerProps) {
  return (
    <div className="mb-4 rounded-lg border border-white/10 bg-white/[0.03] p-4 text-sm text-foreground/70">
      <span className="font-medium text-foreground">Autopilot policies</span>{' '}
      are agent policies: they decide when an agent runs, its budget, and its
      direction. Use autopilot when the agent should adapt each run. For fixed
      step-by-step automation graphs, use
      <Link href={workflowsHref} className="ml-1 underline underline-offset-2">
        Workflows
      </Link>
      .
    </div>
  );
}
