'use client';

import { ButtonSize } from '@genfeedai/contracts';
import {
  Alert,
  AlertActions,
  AlertDescription,
  AlertTitle,
} from '@ui/primitives/alert';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import { Info, TrendingUp } from 'lucide-react';
import Link from 'next/link';
import type { AnalyticsOverviewHeroProps } from '@/features/analytics/props/analytics-overview-hero.props';

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
  heroContent,
}: AnalyticsOverviewHeroProps) {
  const { primaryAction, secondaryAction } = heroContent;

  return (
    <Alert icon={false}>
      <AlertTitle>
        <Badge
          icon={heroContent.hasConnectedAccounts ? <TrendingUp /> : <Info />}
          shape="pill"
          variant={heroContent.hasConnectedAccounts ? 'warning' : 'info'}
        >
          {heroContent.badge}
        </Badge>
      </AlertTitle>
      <AlertDescription>{heroContent.description}</AlertDescription>
      <AlertActions>
        <Button
          asChild
          size={ButtonSize.SM}
          variant={primaryAction.variant}
          withWrapper={false}
        >
          <Link href={primaryAction.href}>{primaryAction.label}</Link>
        </Button>
        <Button
          asChild
          size={ButtonSize.SM}
          variant={secondaryAction.variant}
          withWrapper={false}
        >
          <Link href={secondaryAction.href}>{secondaryAction.label}</Link>
        </Button>
      </AlertActions>
    </Alert>
  );
}
