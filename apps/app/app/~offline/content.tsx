'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import { useThemeLogo } from '@hooks/ui/use-theme-logo/use-theme-logo';
import { EnvironmentService } from '@services/core/environment.service';
import { Button } from '@ui/primitives/button';
import Image from 'next/image';

/**
 * Offline shell served by the service worker when a document request fails.
 *
 * Precached at build time, so it must not depend on anything the network would
 * have to provide — no session, no org/brand scope, no API data.
 */
export default function OfflineContent() {
  const logoUrl = useThemeLogo();

  return (
    <div className="flex min-h-dvh w-full items-center justify-center bg-background text-foreground text-center">
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

        <h1 className="text-2xl md:text-4xl font-bold uppercase mb-2">
          You&apos;re offline
        </h1>
        <p className="text-foreground/70 mb-6">
          Genfeed needs a connection to load this page. Your work is saved.
        </p>

        <div className="grid grid-cols-1 gap-4 justify-center items-center mt-4">
          <Button
            variant={ButtonVariant.DEFAULT}
            onClick={() => window.location.reload()}
          >
            Try again
          </Button>
        </div>
      </div>
    </div>
  );
}
