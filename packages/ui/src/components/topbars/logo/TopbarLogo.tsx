'use client';

import { useThemeLogo } from '@hooks/ui/use-theme-logo/use-theme-logo';
import type { TopbarLogoProps } from '@props/navigation/topbar.props';
import { EnvironmentService } from '@services/core/environment.service';
import Image from 'next/image';
import Link from 'next/link';

export default function TopbarLogo({ logoHref }: TopbarLogoProps) {
  const logoUrl = useThemeLogo();

  return (
    <div className="flex items-center gap-2">
      <Link href={logoHref} className="py-2">
        {logoUrl && (
          <Image
            src={logoUrl}
            alt={EnvironmentService.LOGO_ALT}
            className="h-8 w-8 object-contain dark:invert"
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
