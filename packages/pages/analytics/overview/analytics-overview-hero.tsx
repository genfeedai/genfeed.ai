'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { buttonVariants } from '@ui/primitives/button.variants';
import { CircleCheck, Info, TrendingUp } from 'lucide-react';
import Link from 'next/link';

type DashboardState = 'empty' | 'warming_up' | 'active';

interface HeroAction {
  href: string;
  label: string;
  variant: ButtonVariant;
}

interface DashboardHeroContent {
  badge: string;
  description: string;
  primaryAction: HeroAction;
}

type AnalyticsOverviewHeroProps = {
  dashboardState: DashboardState;
  heroContent: DashboardHeroContent;
  orgHref: (path: string) => string;
};

/**
 * First-run / warming-up status strip only.
 * Page identity lives in the shell breadcrumb — no in-page H1.
 * Metrics live in KPISection MetricCards.
 */
export default function AnalyticsOverviewHero({
  dashboardState,
  heroContent,
  orgHref,
}: AnalyticsOverviewHeroProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        <div className="inline-flex w-fit shrink-0 items-center gap-2 rounded-full bg-secondary px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-foreground/60 shadow-border">
          {dashboardState === 'active' ? (
            <CircleCheck className="size-4 text-success" />
          ) : dashboardState === 'warming_up' ? (
            <TrendingUp className="size-4 text-warning" />
          ) : (
            <Info className="size-4 text-info" />
          )}
          {heroContent.badge}
        </div>
        <p className="min-w-0 text-sm leading-5 text-foreground/65">
          {heroContent.description}
        </p>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <Link
          href={heroContent.primaryAction.href}
          className={buttonVariants({
            size: ButtonSize.SM,
            variant: heroContent.primaryAction.variant,
          })}
        >
          {heroContent.primaryAction.label}
        </Link>
        <Link
          href={orgHref('/settings/api-keys')}
          className={buttonVariants({
            size: ButtonSize.SM,
            variant: ButtonVariant.SECONDARY,
          })}
        >
          Manage connections
        </Link>
      </div>
    </div>
  );
}
