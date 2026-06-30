'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { buttonVariants } from '@ui/primitives/button.variants';
import Link from 'next/link';
import {
  HiMiniArrowTrendingUp,
  HiOutlineCheckCircle,
  HiOutlineInformationCircle,
  HiOutlineSquares2X2,
} from 'react-icons/hi2';

type DashboardState = 'empty' | 'warming_up' | 'active';

interface HeroAction {
  href: string;
  label: string;
  variant: ButtonVariant;
}

interface ProgressMetric {
  label: string;
  value: string;
}

interface DashboardHeroContent {
  badge: string;
  description: string;
  primaryAction: HeroAction;
  progressItems: ProgressMetric[];
  title: string;
}

type AnalyticsOverviewHeroProps = {
  dashboardState: DashboardState;
  heroContent: DashboardHeroContent;
  orgHref: (path: string) => string;
};

export default function AnalyticsOverviewHero({
  dashboardState,
  heroContent,
  orgHref,
}: AnalyticsOverviewHeroProps) {
  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1.7fr)_minmax(280px,0.9fr)]">
      <div className="space-y-5">
        <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-foreground/60">
          {dashboardState === 'active' ? (
            <HiOutlineCheckCircle className="size-4 text-emerald-400" />
          ) : dashboardState === 'warming_up' ? (
            <HiMiniArrowTrendingUp className="size-4 text-amber-300" />
          ) : (
            <HiOutlineInformationCircle className="size-4 text-sky-300" />
          )}
          {heroContent.badge}
        </div>

        <div className="space-y-3">
          <h1 className="text-3xl font-serif leading-tight text-foreground lg:text-4xl">
            {heroContent.title}
          </h1>
          <p className="max-w-3xl text-sm leading-7 text-foreground/72 lg:text-base">
            {heroContent.description}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
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

      <aside className="border-t border-white/[0.08] pt-5 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-foreground">
              Setup progress
            </div>
            <div className="text-xs text-foreground/55">
              What this date range can currently support
            </div>
          </div>
          <HiOutlineSquares2X2 className="size-5 text-foreground/45" />
        </div>

        <div className="mt-4 divide-y divide-white/[0.08]">
          {heroContent.progressItems.map((item) => (
            <div
              key={item.label}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-4 py-4 first:pt-0 last:pb-0 lg:block"
            >
              <div className="text-xs uppercase tracking-[0.22em] text-foreground/40 lg:mb-2">
                {item.label}
              </div>
              <div className="text-3xl font-serif text-foreground">
                {item.value}
              </div>
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}
