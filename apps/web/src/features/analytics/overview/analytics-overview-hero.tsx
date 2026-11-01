'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { Badge } from '@ui/primitives/badge';
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
  connectAccountsHref: string;
};

/**
 * Warming-up status strip only. First-run is a page-level EmptyStateCard.
 * Page identity lives in the shell breadcrumb — no in-page H1.
 * Metrics live in KPISection MetricCards.
 */
export default function AnalyticsOverviewHero({
  dashboardState,
  heroContent,
  connectAccountsHref,
}: AnalyticsOverviewHeroProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        <Badge
          className="w-fit shrink-0"
          icon={
            dashboardState === 'active' ? (
              <CircleCheck />
            ) : dashboardState === 'warming_up' ? (
              <TrendingUp />
            ) : (
              <Info />
            )
          }
          shape="pill"
          size="lg"
          variant={
            dashboardState === 'active'
              ? 'success'
              : dashboardState === 'warming_up'
                ? 'warning'
                : 'info'
          }
        >
          {heroContent.badge}
        </Badge>
        <p className="min-w-0 text-sm leading-5 text-foreground/70">
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
          href={connectAccountsHref}
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
