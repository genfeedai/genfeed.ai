'use client';

import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { useThemeLogo } from '@genfeedai/hooks/ui/use-theme-logo/use-theme-logo';
import { EnvironmentService } from '@genfeedai/services/core/environment.service';
import Image from 'next/image';
import { useState } from 'react';

const BUNDLED_GENFEED_LOGO_URL = '/logo.svg';

/** The Genfeed mark with the bundled fallback; no hover or click behavior. */
export default function SidebarLogoMark({ className }: { className?: string }) {
  const logoUrl = useThemeLogo();
  const [failedLogoUrl, setFailedLogoUrl] = useState<string | null>(null);
  const visibleLogoUrl =
    !logoUrl || failedLogoUrl === logoUrl ? BUNDLED_GENFEED_LOGO_URL : logoUrl;

  return (
    <Image
      src={visibleLogoUrl}
      alt={EnvironmentService.LOGO_ALT}
      className={cn('size-4 object-contain dark:invert', className)}
      width={16}
      height={16}
      sizes="16px"
      onError={() => {
        if (visibleLogoUrl !== BUNDLED_GENFEED_LOGO_URL) {
          setFailedLogoUrl(visibleLogoUrl);
        }
      }}
    />
  );
}
