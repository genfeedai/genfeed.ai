'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import {
  Alert,
  AlertActions,
  AlertDescription,
  AlertTitle,
} from '@ui/primitives/alert';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
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
 * Warming-up status banner. First-run is a page-level card EmptyState.
 * Page identity lives in the shell breadcrumb — no in-page H1.
 * Metrics live in KPISection MetricCards.
 *
 * Built from the shared Alert: the state is the shared Badge in the title
 * slot, the copy is the description, and the next actions sit in AlertActions
 * so they stay beside the text and wrap under it on a narrow screen.
 */
export default function AnalyticsOverviewHero({
  dashboardState,
  heroContent,
  connectAccountsHref,
}: AnalyticsOverviewHeroProps) {
  return (
    <Alert icon={false}>
      <AlertTitle>
        <Badge
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
      </AlertTitle>
      <AlertDescription>{heroContent.description}</AlertDescription>
      <AlertActions>
        <Button
          asChild
          size={ButtonSize.SM}
          variant={heroContent.primaryAction.variant}
          withWrapper={false}
        >
          <Link href={heroContent.primaryAction.href}>
            {heroContent.primaryAction.label}
          </Link>
        </Button>
        <Button
          asChild
          size={ButtonSize.SM}
          variant={ButtonVariant.SECONDARY}
          withWrapper={false}
        >
          <Link href={connectAccountsHref}>Manage connections</Link>
        </Button>
      </AlertActions>
    </Alert>
  );
}
