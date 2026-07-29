'use client';

import { createBrandAppRoute } from '@genfeedai/constants';
import { useBrand } from '@genfeedai/contexts/user/brand-context/brand-context';
import { getBrandEntityId } from '@genfeedai/contexts/user/brand-context/brand-context.helpers';
import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { Button } from '@ui/primitives/button';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { type ReactNode, useEffect, useMemo } from 'react';
import { HiOutlineArrowTrendingUp } from 'react-icons/hi2';

function getResearchScopedPath(pathname: string, orgSlug: string): string {
  const marker = `/${orgSlug}/~/research`;
  const index = pathname.indexOf(marker);

  if (index === -1) {
    return '/research/discovery';
  }

  const rest = pathname.slice(index + marker.length);
  return rest ? `/research${rest}` : '/research/discovery';
}

/**
 * Research data is brand-scoped. On org `~/research/*` routes the brand
 * context intentionally clears brandId, so this gate either routes into a
 * brand-scoped research URL or asks the user to pick a brand.
 */
export function ResearchOrgBrandGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { replace } = useRouter();
  const { brands, isReady } = useBrand();
  const { orgSlug } = useOrgUrl();

  const isOrgResearchRoute = Boolean(
    orgSlug && pathname.includes(`/${orgSlug}/~/research`),
  );
  const researchPath = useMemo(
    () => getResearchScopedPath(pathname, orgSlug),
    [orgSlug, pathname],
  );
  const brandChoices = useMemo(
    () =>
      brands
        .map((brand) => ({
          href: createBrandAppRoute(orgSlug, brand.slug, researchPath),
          id: getBrandEntityId(brand),
          label: brand.label || brand.slug || getBrandEntityId(brand),
          slug: brand.slug,
        }))
        .filter((brand) => Boolean(brand.id && brand.slug)),
    [brands, orgSlug, researchPath],
  );

  useEffect(() => {
    if (!isOrgResearchRoute || !isReady || brandChoices.length !== 1) {
      return;
    }

    const onlyBrand = brandChoices[0];
    if (!onlyBrand) {
      return;
    }

    replace(onlyBrand.href);
  }, [brandChoices, isOrgResearchRoute, isReady, replace]);

  if (!isOrgResearchRoute) {
    return children;
  }

  if (!isReady) {
    return <LazyLoadingFallback variant="grid" />;
  }

  if (brandChoices.length === 1) {
    return <LazyLoadingFallback variant="grid" />;
  }

  if (brandChoices.length === 0) {
    return (
      <div className="flex min-h-[24rem] flex-col items-center justify-center gap-3 px-6 text-center">
        <HiOutlineArrowTrendingUp className="size-10 text-foreground/20" />
        <h1 className="text-lg font-semibold text-foreground">
          Research needs a brand
        </h1>
        <p className="max-w-md text-sm text-foreground/55">
          Create or connect a brand first, then open Research to explore trends
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
          Choose a brand for Research
        </h1>
        <p className="text-sm text-foreground/55">
          Research is brand-scoped. Pick which brand&apos;s trends and ads to
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
