'use client';

import { APP_DISPLAY_LABELS, APP_ROUTES } from '@genfeedai/constants';
import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import type { OverviewCard } from '@genfeedai/interfaces/ui/overview-card.interface';
import { cn } from '@helpers/formatting/cn/cn.util';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import Card from '@ui/card/Card';
import CardIcon from '@ui/card/icon/CardIcon';
import OverviewLayout from '@ui/overview/OverviewLayout';
import { Button } from '@ui/primitives/button';
import {
  ChartLine,
  CirclePlay,
  Cpu,
  House as Home,
  LayoutDashboard,
  List,
  MessageSquare,
  Settings,
  Sparkles,
  Workflow,
} from 'lucide-react';
import Link from 'next/link';
import type { ComponentType } from 'react';

export default function AutomationOverviewPage() {
  const { href } = useOrgUrl();

  const cards: OverviewCard[] = [
    {
      color: 'bg-cyan-500/12 text-cyan-300',
      cta: 'Inspect Workspace',
      description: 'Start from the unified agents workspace overview',
      href: href(APP_ROUTES.AUTOMATE.AGENTS),
      icon: Settings,
      id: 'library',
      label: 'Team',
    },
    {
      color: 'bg-amber-500/12 text-amber-300',
      cta: 'Open Runs',
      description: 'Track active, failed, and completed agent runs',
      href: href(APP_ROUTES.AUTOMATE.RUNS),
      icon: Cpu,
      id: 'runs',
      label: 'Runs',
    },
    {
      color: 'bg-emerald-500/12 text-emerald-300',
      cta: 'Open Content Runs',
      description:
        'Follow briefs from Discover through remix, publish, and analytics',
      href: href(APP_ROUTES.AUTOMATE.CONTENT_RUNS),
      icon: CirclePlay,
      id: 'content-runs',
      label: 'Content Runs',
    },
    {
      color: 'bg-indigo-500/12 text-indigo-300',
      cta: 'Open Workflows',
      description:
        'Run fixed automation graphs for repeatable content pipelines',
      href: href(APP_ROUTES.AUTOMATE.WORKFLOWS),
      icon: Workflow,
      id: 'workflows',
      label: 'Workflows',
    },
    {
      color: 'bg-violet-500/12 text-violet-300',
      cta: 'Open Programs',
      description:
        'Coordinate multi-agent content production with budgets and quotas',
      href: href(APP_ROUTES.AUTOMATE.CAMPAIGNS),
      icon: LayoutDashboard,
      id: 'programs',
      label: 'Programs',
    },
    {
      color: 'bg-blue-500/12 text-blue-300',
      cta: 'Open Autopilot',
      description:
        'Manage agent policies that schedule adaptive autonomous runs',
      href: href(APP_ROUTES.AUTOMATE.AUTOPILOT),
      icon: MessageSquare,
      id: 'strategies',
      label: 'Autopilot',
    },
    {
      color: 'bg-pink-500/12 text-pink-300',
      cta: 'View Analytics',
      description: 'Performance metrics and insights (Analytics app)',
      href: href(APP_ROUTES.ANALYTICS.OVERVIEW),
      icon: ChartLine,
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
      href: href(APP_ROUTES.AUTOMATE.AGENTS),
      icon: Settings,
      kicker: 'Workspace',
      label: 'Team',
    },
    {
      color: 'bg-amber-500/12 text-amber-300',
      cta: 'Open Runs',
      description: 'Review live work, failures, and completed outputs.',
      href: href(APP_ROUTES.AUTOMATE.RUNS),
      icon: List,
      kicker: 'Operations',
      label: 'Run Console',
    },
    {
      color: 'bg-indigo-500/12 text-indigo-300',
      cta: 'Open Workflows',
      description:
        'Use workflows for fixed, reusable automation graphs and scheduled pipelines.',
      href: href(APP_ROUTES.AUTOMATE.WORKFLOWS),
      icon: Workflow,
      kicker: 'Automation',
      label: 'Workflow Engine',
    },
    {
      color: 'bg-blue-500/12 text-blue-300',
      cta: 'Open Autopilot',
      description:
        'Use autopilot policies when the agent should decide what to do each run.',
      href: href(APP_ROUTES.AUTOMATE.AUTOPILOT),
      icon: MessageSquare,
      kicker: 'Guidance',
      label: 'Autopilot Policies',
    },
    {
      color: 'bg-pink-500/12 text-pink-300',
      cta: 'Open Analytics',
      description: 'Review performance and outcomes in the Analytics app.',
      href: href(APP_ROUTES.ANALYTICS.OVERVIEW),
      icon: Sparkles,
      kicker: 'Insight',
      label: 'Performance',
    },
  ];

  return (
    <OverviewLayout
      label={APP_DISPLAY_LABELS.automate}
      description="Operate brand agents, inspect runs, use Workflows for fixed automations, and use Autopilot for adaptive agent policies"
      icon={Home}
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
              'flex h-10 w-10 items-center justify-center border border-border',
              color,
            )}
            iconClassName="h-5 w-5"
          />
          <div className="min-w-0">
            <p className="text-2xs font-semibold uppercase tracking-[0.18em] text-foreground/40">
              {kicker}
            </p>
            <h3 className="mt-1 text-base font-semibold tracking-[-0.02em] text-foreground">
              {label}
            </h3>
          </div>
        </div>

        <p className="text-sm leading-6 text-foreground/60">{description}</p>
      </div>

      <div className="border-t border-border pt-4">
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
