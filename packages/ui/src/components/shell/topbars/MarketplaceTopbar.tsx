'use client';

import { UserButton, useAuth } from '@clerk/nextjs';
import { ButtonSize } from '@genfeedai/enums';
import { EnvironmentService } from '@genfeedai/services/core/environment.service';
import { Button } from '@ui/primitives/button';
import TopbarPublic from '@ui/topbars/public/TopbarPublic';
import Link from 'next/link';

const NAV_LINKS = [
  { href: '/free', label: 'Free' },
  { href: '/workflows', label: 'Workflows' },
  { href: '/prompts', label: 'Prompts' },
  { href: '/images', label: 'Images' },
  { href: '/videos', label: 'Videos' },
  { href: '/library', label: 'My Library' },
];

export default function MarketplaceTopbar() {
  const { isSignedIn } = useAuth();

  return (
    <TopbarPublic
      navLinks={NAV_LINKS}
      rightContent={
        <div className="flex items-center gap-8">
          {!isSignedIn ? (
            <>
              <Link
                href={`${EnvironmentService.apps.app}/login`}
                className="hidden text-xs font-bold uppercase tracking-[0.1em] text-white/60 transition-colors hover:text-white sm:block"
              >
                Log in
              </Link>

              <Button asChild size={ButtonSize.PUBLIC} className="px-8 py-3">
                <a
                  href={`${EnvironmentService.apps.app}/request-access`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Get Started
                </a>
              </Button>
            </>
          ) : (
            <>
              <a
                href={EnvironmentService.apps.app}
                className="hidden text-xs font-bold uppercase tracking-[0.1em] text-white/60 transition-colors hover:text-white sm:block"
              >
                App
              </a>
              <UserButton />
            </>
          )}
        </div>
      }
    />
  );
}
