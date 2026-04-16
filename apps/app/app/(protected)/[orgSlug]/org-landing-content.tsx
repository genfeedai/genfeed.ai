'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import type { Brand } from '@models/organization/brand.model';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import {
  HiOutlineBuildingOffice2,
  HiOutlineGlobeAlt,
  HiPlus,
} from 'react-icons/hi2';

function BrandCard({ brand, orgSlug }: { brand: Brand; orgSlug: string }) {
  const cardHref = `/${orgSlug}/${brand.slug}/workspace/overview`;

  return (
    <Link
      href={cardHref}
      className="group flex flex-col gap-4 rounded-lg border border-white/[0.08] bg-white/[0.02] p-5 transition hover:border-white/15 hover:bg-white/[0.04]"
    >
      <div className="flex items-center gap-3">
        {brand.logoUrl ? (
          <Image
            alt={brand.label}
            className="h-10 w-10 rounded-lg object-cover"
            height={40}
            src={brand.logoUrl}
            unoptimized
            width={40}
          />
        ) : (
          <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.04]">
            <HiOutlineBuildingOffice2 className="h-5 w-5 text-white/40" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-medium text-white">
            {brand.label}
          </h3>
          {brand.slug ? (
            <p className="truncate text-xs text-white/40">@{brand.slug}</p>
          ) : null}
        </div>
      </div>

      <div className="flex items-center gap-4 text-xs text-white/30">
        {brand.totalCredentials > 0 ? (
          <span className="flex items-center gap-1">
            <HiOutlineGlobeAlt className="h-3.5 w-3.5" />
            {brand.totalCredentials} platform
            {brand.totalCredentials === 1 ? '' : 's'}
          </span>
        ) : null}
        {brand.createdAt ? (
          <span>{new Date(brand.createdAt).toLocaleDateString()}</span>
        ) : null}
      </div>
    </Link>
  );
}

export default function OrgLandingContent() {
  const { brands, isReady } = useBrand();
  const { orgSlug, orgHref } = useOrgUrl();
  const router = useRouter();
  const primaryBrandSlug = brands[0]?.slug ?? '';

  useEffect(() => {
    if (!isReady) {
      return;
    }

    if (brands.length <= 1 && primaryBrandSlug) {
      router.replace(`/${orgSlug}/${primaryBrandSlug}/workspace/overview`);
    }
  }, [brands.length, isReady, orgSlug, primaryBrandSlug, router]);

  if (!isReady || brands.length <= 1) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div
          aria-hidden="true"
          className="h-6 w-6 animate-spin rounded-full border-2 border-white/20 border-t-white"
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Projects</h1>
          <p className="mt-1 text-sm text-white/40">
            {brands.length} brand{brands.length === 1 ? '' : 's'} in this
            workspace
          </p>
        </div>
        <Link
          href={orgHref('/settings/brands')}
          className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3.5 py-2 text-sm font-medium text-white/70 transition hover:border-white/15 hover:bg-white/[0.06] hover:text-white"
        >
          <HiPlus className="h-4 w-4" />
          New Brand
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {brands.map((brand) => (
          <BrandCard key={brand.id} brand={brand} orgSlug={orgSlug} />
        ))}
      </div>
    </div>
  );
}
