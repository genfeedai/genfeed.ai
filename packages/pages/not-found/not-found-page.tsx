'use client';

import { useThemeLogo } from '@hooks/ui/use-theme-logo/use-theme-logo';
import type { NotFoundProps } from '@props/layout/not-found.props';
import { EnvironmentService } from '@services/core/environment.service';
import Image from 'next/image';
import Link from 'next/link';

export default function NotFoundPage({
  homeHref = '/',
  homeLabel = 'Go back home',
}: NotFoundProps) {
  const logoUrl = useThemeLogo();

  return (
    <div className="flex min-h-dvh w-full items-center justify-center bg-black text-center">
      <div className="grid grid-cols-1">
        {logoUrl && (
          <Image
            src={logoUrl}
            className="mx-auto mb-20 object-contain dark:invert"
            alt={EnvironmentService.LOGO_ALT}
            width={80}
            height={80}
            priority
          />
        )}

        <h1 className="text-6xl font-bold text-primary mb-4">404</h1>
        <h2 className="text-2xl md:text-4xl font-bold uppercase mb-2">
          Page not found
        </h2>
        <p className="text-foreground/70 mb-6">
          The page you&apos;re looking for doesn&apos;t exist.
        </p>

        <div className="mt-4 grid grid-cols-1 items-center justify-center gap-4">
          {/*
            Forced black shell — theme `primary` is often near-black in dark mode
            and makes the CTA disappear. Hard white chip for contrast.
          */}
          <Link
            href={homeHref}
            className="inline-flex h-9 items-center justify-center gap-2 whitespace-nowrap rounded-md bg-white px-4 py-2 text-sm font-medium text-black shadow transition-colors duration-200 hover:bg-white/90"
          >
            {homeLabel}
          </Link>
        </div>
      </div>
    </div>
  );
}
