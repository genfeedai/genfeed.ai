'use client';

import { useThemeLogo } from '@genfeedai/hooks/ui/use-theme-logo/use-theme-logo';
import type { TopbarLogoProps } from '@genfeedai/props/navigation/topbar.props';
import { EnvironmentService } from '@genfeedai/services/core/environment.service';
import Image from 'next/image';
import Link from 'next/link';

export default function TopbarLogo({ logoHref }: TopbarLogoProps) {
  const logoUrl = useThemeLogo();

  return (
    <div className="flex items-center gap-2">
      {/* useThemeLogo() returns '' until the client mounts, so the served HTML
          is an anchor with no text and no image. Label the link itself rather
          than relying on the logo alt, which is absent in that first render. */}
      <Link
        href={logoHref}
        className="py-2"
        aria-label={`${EnvironmentService.LOGO_ALT} home`}
      >
        {logoUrl && (
          <Image
            src={logoUrl}
            alt={EnvironmentService.LOGO_ALT}
            className="size-8 object-contain dark:invert"
            width={32}
            height={32}
            sizes="32px"
            priority
          />
        )}
      </Link>
    </div>
  );
}
