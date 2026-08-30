'use client';

import { createBrandAppRoute } from '@genfeedai/constants';
import { useBrand } from '@genfeedai/contexts/user/brand-context/brand-context';
import { getBrandEntityId } from '@genfeedai/contexts/user/brand-context/brand-context.helpers';
import { ButtonSize, ButtonVariant, CardVariant } from '@genfeedai/enums';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import Card from '@ui/card/Card';
import PageLoadingState from '@ui/loading/page/PageLoadingState';
import { Button } from '@ui/primitives/button';
import { TrendingUp } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { type ReactNode, useEffect, useMemo } from 'react';

function getDiscoverScopedPath(pathname: string, orgSlug: string): string {
  const marker = `/${orgSlug}/~/discover`;
  const index = pathname.indexOf(marker);

  if (index === -1) {
    return '/discover/overview';
  }

  const rest = pathname.slice(index + marker.length);
  // Collapse legacy /discovery and retired /socials to canonical /overview.
  if (rest === '/discovery' || rest.startsWith('/discovery/')) {
    return `/discover/overview${rest.slice('/discovery'.length)}`;
  }
  if (rest === '/socials' || rest.startsWith('/socials/')) {
    return `/discover/overview${rest.slice('/socials'.length)}`;
  }
  return rest ? `/discover${rest}` : '/discover/overview';
}

/**
 * Discover data is brand-scoped. On org `~/discover/*` routes the brand
 * context intentionally clears brandId, so this gate either routes into a
 * brand-scoped discover URL or asks the user to pick a brand.
 */
export function DiscoverOrgBrandGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { replace } = useRouter();
  const { brands, isReady } = useBrand();
  const { orgSlug } = useOrgUrl();

  const isOrgDiscoverRoute = Boolean(
    orgSlug && pathname.includes(`/${orgSlug}/~/discover`),
  );
  const discoverPath = useMemo(
    () => getDiscoverScopedPath(pathname, orgSlug),
    [orgSlug, pathname],
  );
  const brandChoices = useMemo(
    () =>
      brands
        .map((brand) => ({
          href: createBrandAppRoute(orgSlug, brand.slug, discoverPath),
          id: getBrandEntityId(brand),
          label: brand.label || brand.slug || getBrandEntityId(brand),
          slug: brand.slug,
        }))
        .filter((brand) => Boolean(brand.id && brand.slug)),
    [brands, orgSlug, discoverPath],
  );

  useEffect(() => {
    if (!isOrgDiscoverRoute || !isReady || brandChoices.length !== 1) {
      return;
    }

    const onlyBrand = brandChoices[0];
    if (!onlyBrand) {
      return;
    }

    replace(onlyBrand.href);
  }, [brandChoices, isOrgDiscoverRoute, isReady, replace]);

  if (!isOrgDiscoverRoute) {
    return children;
  }

  if (!isReady) {
    return <PageLoadingState />;
  }

  if (brandChoices.length === 1) {
    return <PageLoadingState />;
  }

  if (brandChoices.length === 0) {
    return (
      <div className="flex min-h-[24rem] flex-col items-center justify-center gap-3 px-6 text-center">
        <TrendingUp className="size-10 text-foreground/20" />
        <h1 className="text-lg font-semibold text-foreground">
          Discover needs a brand
        </h1>
        <p className="max-w-md text-sm text-foreground/55">
          Create or connect a brand first, then open Discover to explore trends
          and ads for that brand.
        </p>
        <Button asChild size={ButtonSize.SM} variant={ButtonVariant.SECONDARY}>
          <Link href={`/${orgSlug}/~/settings/brands`}>Go to brands</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-10">
      <div className="space-y-2 text-center sm:text-left">
        <h1 className="text-xl font-semibold text-foreground">
          Choose a brand for Discover
        </h1>
        <p className="text-sm text-foreground/55">
          Discover is brand-scoped. Pick which brand&apos;s trends and ads to
          open.
        </p>
      </div>
      <ul className="grid gap-2 sm:grid-cols-2">
        {brandChoices.map((brand) => (
          <li key={brand.id}>
            <Link href={brand.href} className="block">
              <Card
                variant={CardVariant.DEFAULT}
                label={brand.label}
                bodyClassName="min-h-14 justify-center py-3 text-sm font-semibold"
                className="transition-colors hover:bg-foreground/[0.06]"
              />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
