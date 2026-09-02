'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { getBrandEntityId } from '@contexts/user/brand-context/brand-context.helpers';
import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import {
  APP_DISPLAY_LABELS,
  APP_ROUTES,
  createBrandAppRoute,
} from '@genfeedai/contracts/constants';
import { cn } from '@helpers/formatting/cn/cn.util';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import Card from '@ui/card/Card';
import CardIcon from '@ui/card/icon/CardIcon';
import OverviewLayout from '@ui/overview/OverviewLayout';
import { Button } from '@ui/primitives/button';
import { ChartLine, Cpu, MessageSquare, Workflow } from 'lucide-react';
import Link from 'next/link';
import { useMemo } from 'react';

/**
 * Deep links offered per brand. Automation data itself is brand-scoped, so the
 * org surface is a read across brands rather than an aggregate of its own.
 */
const AUTOMATION_SURFACES = [
  {
    icon: Workflow,
    label: 'Workflows',
    path: APP_ROUTES.AUTOMATION.WORKFLOWS,
  },
  { icon: Cpu, label: 'Runs', path: APP_ROUTES.AUTOMATION.RUNS },
  {
    icon: MessageSquare,
    label: 'Autopilot',
    path: APP_ROUTES.AUTOMATION.AUTOPILOT,
  },
  {
    icon: ChartLine,
    label: 'Analytics',
    path: APP_ROUTES.ANALYTICS.OVERVIEW,
  },
] as const;

interface OrganizationAutomationBrand {
  href: string;
  id: string;
  label: string;
  surfaces: {
    href: string;
    label: string;
    icon: (typeof AUTOMATION_SURFACES)[number]['icon'];
  }[];
}

interface OrganizationAutomationBrandCardProps {
  brand: OrganizationAutomationBrand;
}

/**
 * Org-level Automation home at `/:orgSlug/~/automation`.
 *
 * The app switcher routes here whenever no brand is selected, so this is the
 * global view: every brand's automation entry points in one place.
 */
export default function OrganizationAutomationOverviewPage() {
  const { brands, isReady } = useBrand();
  const { orgSlug } = useOrgUrl();

  const brandCards: OrganizationAutomationBrand[] = useMemo(
    () =>
      brands.flatMap((brand) => {
        const id = getBrandEntityId(brand);
        const slug = brand.slug?.trim();

        if (!id || !slug) {
          return [];
        }

        return [
          {
            href: createBrandAppRoute(
              orgSlug,
              slug,
              APP_ROUTES.AUTOMATION.ROOT,
            ),
            id,
            label: brand.label || slug,
            surfaces: AUTOMATION_SURFACES.map((surface) => ({
              href: createBrandAppRoute(orgSlug, slug, surface.path),
              icon: surface.icon,
              label: surface.label,
            })),
          },
        ];
      }),
    [brands, orgSlug],
  );

  return (
    <OverviewLayout
      label={APP_DISPLAY_LABELS.automation}
      description="Workflows, autopilot, and run history across every brand in this organization"
      icon={Workflow}
    >
      {isReady && brandCards.length === 0 ? (
        <div className="flex min-h-[24rem] flex-col items-center justify-center gap-3 px-6 text-center">
          <Workflow className="size-10 text-foreground/20" />
          <h2 className="text-lg font-semibold text-foreground">
            Automation needs a brand
          </h2>
          <p className="max-w-md text-sm text-foreground/55">
            Automation runs against a brand. Create your first brand, then open
            Automation to build workflows and autopilot policies for it.
          </p>
          <Button
            asChild
            size={ButtonSize.SM}
            variant={ButtonVariant.SECONDARY}
          >
            <Link href={`/${orgSlug}/~/settings/brands`}>Go to brands</Link>
          </Button>
        </div>
      ) : null}

      {isReady && brandCards.length > 0 ? (
        <section>
          <h2 className="mb-4 text-xl font-semibold tracking-[-0.02em] text-foreground">
            Brands
          </h2>
          <div
            data-testid="organization-automation-brands"
            className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3"
          >
            {brandCards.map((brand) => (
              <OrganizationAutomationBrandCard key={brand.id} brand={brand} />
            ))}
          </div>
        </section>
      ) : null}
    </OverviewLayout>
  );
}

function OrganizationAutomationBrandCard({
  brand,
}: OrganizationAutomationBrandCardProps) {
  return (
    <Card
      className="h-full shadow-none"
      bodyClassName="flex h-full flex-col justify-between gap-5 p-4"
    >
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <CardIcon
            icon={Workflow}
            className={cn(
              'flex h-10 w-10 items-center justify-center border border-border',
              'bg-indigo-500/12 text-indigo-300',
            )}
            iconClassName="h-5 w-5"
          />
          <div className="min-w-0">
            <p className="text-2xs font-semibold uppercase tracking-[0.18em] text-foreground/40">
              Brand
            </p>
            <h3 className="mt-1 truncate text-base font-semibold tracking-[-0.02em] text-foreground">
              {brand.label}
            </h3>
          </div>
        </div>

        <ul className="grid grid-cols-2 gap-2">
          {brand.surfaces.map((surface) => (
            <li key={surface.label}>
              <Link
                href={surface.href}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground/60 transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
              >
                <surface.icon className="size-4" />
                {surface.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>

      <div className="border-t border-border pt-4">
        <Button
          asChild
          variant={ButtonVariant.SECONDARY}
          size={ButtonSize.SM}
          className="text-xs tracking-[0.12em]"
        >
          <Link href={brand.href}>Open Automation</Link>
        </Button>
      </div>
    </Card>
  );
}
