'use client';

import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { useThemeLogo } from '@genfeedai/hooks/ui/use-theme-logo/use-theme-logo';
import type { TopbarLogoProps } from '@genfeedai/props/navigation/topbar.props';
import { EnvironmentService } from '@genfeedai/services/core/environment.service';
import Image from 'next/image';
import Link from 'next/link';

export default function TopbarLogo({
  logoHref,
  size = 'default',
}: TopbarLogoProps) {
  const logoUrl = useThemeLogo();
  const isCompact = size === 'compact';

  return (
    <div className="flex items-center gap-2">
      {/* useThemeLogo() returns '' until the client mounts, so the served HTML
          is an anchor with no text and no image. Label the link itself rather
          than relying on the logo alt, which is absent in that first render. */}
      <Link
        href={logoHref}
        className={cn(
          isCompact
            ? 'flex size-8 flex-shrink-0 items-center justify-center rounded-md transition-colors hover:bg-foreground/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60'
            : 'py-2',
        )}
        aria-label={`${EnvironmentService.LOGO_ALT} home`}
      >
        {logoUrl && (
          <Image
            src={logoUrl}
            alt={EnvironmentService.LOGO_ALT}
            className={cn(
              'object-contain dark:invert',
              isCompact ? 'size-4' : 'size-8',
            )}
            width={isCompact ? 16 : 32}
            height={isCompact ? 16 : 32}
            sizes={isCompact ? '16px' : '32px'}
            priority
          />
        )}
      </Link>
    </div>
  );
}
