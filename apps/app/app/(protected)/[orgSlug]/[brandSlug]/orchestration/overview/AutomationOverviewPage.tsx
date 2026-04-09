'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import type { OverviewCard } from '@genfeedai/interfaces/ui/overview-card.interface';
import { cn } from '@helpers/formatting/cn/cn.util';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import Card from '@ui/card/Card';
import CardIcon from '@ui/card/icon/CardIcon';
import OverviewLayout from '@ui/overview/OverviewLayout';
import { Button } from '@ui/primitives/button';
import Link from 'next/link';
import type { ComponentType } from 'react';
import {
  HiBolt,
  HiChatBubbleLeftRight,
  HiClipboardDocumentList,
  HiMegaphone,
  HiOutlineCog6Tooth,
  HiOutlineCpuChip,
  HiOutlineHome,
  HiOutlineQueueList,
  HiPresentationChartLine,
  HiSparkles,
} from 'react-icons/hi2';

export default function AutomationOverviewPage() {
  const { href } = useOrgUrl();

  const cards: OverviewCard[] = [
    {
      color: 'bg-cyan-500/12 text-cyan-300',
      cta: 'Inspect Workspace',
      description: 'Start from the unified agents workspace overview',
      href: '/orchestration/library',
      icon: HiOutlineCog6Tooth,
      id: 'library',
      label: 'Library',
    },
    {
      color: 'bg-amber-500/12 text-amber-300',
      cta: 'Open Runs',
      description: 'Track active, failed, and completed agent runs',
      href: '/orchestration/runs',
      icon: HiOutlineCpuChip,
      id: 'runs',
      label: 'Runs',
    },
    {
      color: 'bg-indigo-500/12 text-indigo-300',
      cta: 'Open Workflows',
      description:
        'Run fixed automation graphs for repeatable content pipelines',
      href: href('/workflows'),
      icon: HiMegaphone,
      id: 'workflows',
      label: 'Workflows',
    },
    {
      color: 'bg-blue-500/12 text-blue-300',
      cta: 'Open Autopilot',
      description:
        'Manage agent policies that schedule adaptive autonomous runs',
      href: '/orchestration/autopilot',
      icon: HiChatBubbleLeftRight,
      id: 'strategies',
      label: 'Autopilot',
    },
    {
      color: 'bg-orange-500/12 text-orange-300',
      cta: 'Open Configuration',
      description: 'Tune workspace-wide configuration and operating defaults',
      href: '/orchestration/configuration',
      icon: HiClipboardDocumentList,
      id: 'configuration',
      label: 'Configuration',
    },
    {
      color: 'bg-pink-500/12 text-pink-300',
      cta: 'View Analytics',
      description: 'Performance metrics and insights',
      href: '/orchestration/analytics',
      icon: HiPresentationChartLine,
      id: 'analytics',
      label: 'Analytics',
    },
  ];

  const activitySignals: ActivitySignalProps[] = [
    {
      color: 'bg-cyan-500/12 text-cyan-300',
      cta: 'Open Library',
      description:
        'Enable or inspect agent roles for content, engagement, and support.',
      href: '/orchestration/library',
      icon: HiOutlineCog6Tooth,
      kicker: 'Workspace',
      label: 'Agent Library',
    },
    {
      color: 'bg-amber-500/12 text-amber-300',
      cta: 'Open Runs',
      description: 'Review live work, failures, and completed outputs.',
      href: '/orchestration/runs',
      icon: HiOutlineQueueList,
      kicker: 'Operations',
      label: 'Run Console',
    },
    {
      color: 'bg-indigo-500/12 text-indigo-300',
      cta: 'Open Workflows',
      description:
        'Use workflows for fixed, reusable automation graphs and scheduled pipelines.',
      href: href('/workflows'),
      icon: HiMegaphone,
      kicker: 'Automation',
      label: 'Workflow Engine',
    },
    {
      color: 'bg-blue-500/12 text-blue-300',
      cta: 'Open Autopilot',
      description:
        'Use autopilot policies when the agent should decide what to do each run.',
      href: '/orchestration/autopilot',
      icon: HiChatBubbleLeftRight,
      kicker: 'Guidance',
      label: 'Autopilot Policies',
    },
    {
      color: 'bg-pink-500/12 text-pink-300',
      cta: 'Open Analytics',
      description: 'Review automation performance and outcome analytics.',
      href: '/orchestration/analytics',
      icon: HiSparkles,
      kicker: 'Insight',
      label: 'Automation Metrics',
    },
    {
      color: 'bg-orange-500/12 text-orange-300',
      cta: 'Open Configuration',
      description: 'Tune workspace defaults, policies, and operator settings.',
      href: '/orchestration/configuration',
      icon: HiBolt,
      kicker: 'Controls',
      label: 'Configuration Center',
    },
  ];

  return (
    <OverviewLayout
      label="Agents Overview"
      description="Operate brand agents, inspect runs, use Workflows for fixed automations, and use Autopilot for adaptive agent policies"
      icon={HiOutlineHome}
      cards={cards}
    >
      <h2 className="mb-4 text-xl font-semibold tracking-[-0.02em] text-foreground">
        Activity Snapshot
      </h2>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {activitySignals.map((signal) => (
          <ActivitySignal key={signal.label} {...signal} />
        ))}
      </div>
    </OverviewLayout>
  );
}

interface ActivitySignalProps {
  color: string;
  cta: string;
  description: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
  kicker: string;
  label: string;
}

function ActivitySignal({
  color,
  cta,
  description,
  href,
  icon,
  kicker,
  label,
}: ActivitySignalProps) {
  return (
    <Card
      className="h-full shadow-none"
      bodyClassName="flex h-full flex-col justify-between gap-5 p-4"
    >
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <CardIcon
            icon={icon}
            className={cn(
              'flex h-10 w-10 items-center justify-center border border-white/[0.12]',
              color,
            )}
            iconClassName="h-5 w-5"
          />
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-foreground/40">
              {kicker}
            </p>
            <h3 className="mt-1 text-base font-semibold tracking-[-0.02em] text-foreground">
              {label}
            </h3>
          </div>
        </div>

        <p className="text-sm leading-6 text-foreground/60">{description}</p>
      </div>

      <div className="border-t border-white/[0.06] pt-4">
        <Button
          asChild
          variant={ButtonVariant.SECONDARY}
          size={ButtonSize.SM}
          className="text-xs tracking-[0.12em]"
        >
          <Link href={href}>{cta}</Link>
        </Button>
      </div>
    </Card>
  );
}
