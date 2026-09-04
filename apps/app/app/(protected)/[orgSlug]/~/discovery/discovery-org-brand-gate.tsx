'use client';

import { useBrand } from '@genfeedai/contexts/user/brand-context/brand-context';
import { getBrandEntityId } from '@genfeedai/contexts/user/brand-context/brand-context.helpers';
import { ButtonSize, ButtonVariant, CardVariant } from '@genfeedai/contracts';
import { createBrandAppRoute } from '@genfeedai/contracts/constants';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import Card from '@ui/card/Card';
import { Button } from '@ui/primitives/button';
import { TrendingUp } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { type ReactNode, useEffect, useMemo } from 'react';

function getDiscoveryScopedPath(pathname: string, orgSlug: string): string {
  const marker = `/${orgSlug}/~/discovery`;
  const index = pathname.indexOf(marker);

  if (index === -1) {
    return '/discovery/overview';
  }

  const rest = pathname.slice(index + marker.length);
  // Collapse legacy /discovery and retired /socials to canonical /overview.
  if (rest === '/discovery' || rest.startsWith('/discovery/')) {
    return `/discovery/overview${rest.slice('/discovery'.length)}`;
  }
  if (rest === '/socials' || rest.startsWith('/socials/')) {
    return `/discovery/overview${rest.slice('/socials'.length)}`;
  }
  return rest ? `/discovery${rest}` : '/discovery/overview';
}

/**
 * Discovery data is brand-scoped. On org `~/discovery/*` routes the brand
 * context intentionally clears brandId, so this gate either routes into a
 * brand-scoped discover URL or asks the user to pick a brand.
 */
export function DiscoveryOrgBrandGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { replace } = useRouter();
  const { brands, isReady } = useBrand();
  const { orgSlug } = useOrgUrl();

  const isOrgDiscoveryRoute = Boolean(
    orgSlug && pathname.includes(`/${orgSlug}/~/discovery`),
  );
  const discoveryPath = useMemo(
    () => getDiscoveryScopedPath(pathname, orgSlug),
    [orgSlug, pathname],
  );
  const brandChoices = useMemo(
    () =>
      brands
        .map((brand) => ({
          href: createBrandAppRoute(orgSlug, brand.slug, discoveryPath),
          id: getBrandEntityId(brand),
          label: brand.label || brand.slug || getBrandEntityId(brand),
          slug: brand.slug,
        }))
        .filter((brand) => Boolean(brand.id && brand.slug)),
    [brands, orgSlug, discoveryPath],
  );

  useEffect(() => {
    if (!isOrgDiscoveryRoute || !isReady || brandChoices.length !== 1) {
      return;
    }

    const onlyBrand = brandChoices[0];
    if (!onlyBrand) {
      return;
    }

    replace(onlyBrand.href);
  }, [brandChoices, isOrgDiscoveryRoute, isReady, replace]);

  if (!isOrgDiscoveryRoute) {
    return children;
  }

  if (!isReady) {
    return null;
  }

  if (brandChoices.length === 1) {
    return null;
  }

  if (brandChoices.length === 0) {
    return (
      <div className="flex min-h-[24rem] flex-col items-center justify-center gap-3 px-6 text-center">
        <TrendingUp className="size-10 text-foreground/20" />
        <h1 className="text-lg font-semibold text-foreground text-balance">
          Discovery needs a brand
        </h1>
        <p className="max-w-md text-sm text-foreground/55 text-pretty">
          Create or connect a brand first, then open Discovery to explore trends
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
        <h1 className="text-xl font-semibold text-foreground text-balance">
          Choose a brand for Discovery
        </h1>
        <p className="text-sm text-foreground/55">
          Discovery is brand-scoped. Pick which brand&apos;s trends and ads to
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
