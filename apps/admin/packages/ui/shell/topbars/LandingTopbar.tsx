'use client';

import { ButtonSize } from '@genfeedai/enums';
import { Button } from '@ui/primitives/button';
import TopbarLogo from '@ui/topbars/logo/TopbarLogo';
import Link from 'next/link';

export interface LandingTopbarProps {
  ctaHref: string;
  ctaLabel: string;
  logoHref?: string;
}

export default function LandingTopbar({
  ctaHref,
  ctaLabel,
  logoHref = '/',
}: LandingTopbarProps): React.ReactElement {
  return (
    <header
      className="fixed inset-x-0 top-0 z-50 w-full border-b border-white/10"
      style={{
        backdropFilter: 'blur(24px)',
        backgroundColor: 'rgba(9, 9, 11, 0.72)',
        WebkitBackdropFilter: 'blur(24px)',
      }}
    >
      <div className="container mx-auto flex h-20 items-center justify-between px-6">
        <TopbarLogo logoHref={logoHref} />

        <Button size={ButtonSize.PUBLIC} asChild className="h-10 px-5 text-sm">
          <Link href={ctaHref} target="_blank" rel="noopener noreferrer">
            {ctaLabel}
          </Link>
        </Button>
      </div>
    </header>
  );
}
