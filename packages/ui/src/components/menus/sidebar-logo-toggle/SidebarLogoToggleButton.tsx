'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { useThemeLogo } from '@genfeedai/hooks/ui/use-theme-logo/use-theme-logo';
import { EnvironmentService } from '@genfeedai/services/core/environment.service';
import { Button } from '@ui/primitives/button';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import Image from 'next/image';
import { type CSSProperties, useState } from 'react';

const BUNDLED_GENFEED_LOGO_URL = '/logo.svg';

type SidebarLogoToggleButtonProps = {
  ariaLabel: string;
  className?: string;
  direction: 'collapse' | 'expand';
  onClick: () => void;
  style?: CSSProperties;
};

export default function SidebarLogoToggleButton({
  ariaLabel,
  className,
  direction,
  onClick,
  style,
}: SidebarLogoToggleButtonProps) {
  const logoUrl = useThemeLogo();
  const [failedLogoUrl, setFailedLogoUrl] = useState<string | null>(null);
  const visibleLogoUrl =
    !logoUrl || failedLogoUrl === logoUrl ? BUNDLED_GENFEED_LOGO_URL : logoUrl;
  const DirectionIcon =
    direction === 'collapse' ? PanelLeftClose : PanelLeftOpen;

  return (
    <Button
      type="button"
      variant={ButtonVariant.GHOST}
      size={ButtonSize.ICON}
      withWrapper={false}
      onClick={onClick}
      onMouseDown={(event) => event.preventDefault()}
      ariaLabel={ariaLabel}
      className={cn(
        'group relative flex size-8 flex-shrink-0 items-center justify-center rounded-md border-0 bg-transparent p-0 text-foreground/72 shadow-none transition-colors',
        'hover:bg-foreground/[0.06] hover:text-foreground',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
        className,
      )}
      data-sidebar-direction={direction}
      style={style}
      tooltip={ariaLabel}
    >
      <span className="absolute inset-0 flex items-center justify-center transition-opacity duration-150 group-hover:opacity-0 group-focus-visible:opacity-0">
        <Image
          src={visibleLogoUrl}
          alt={EnvironmentService.LOGO_ALT}
          className="size-4 object-contain dark:invert"
          width={16}
          height={16}
          sizes="16px"
          onError={() => {
            if (visibleLogoUrl !== BUNDLED_GENFEED_LOGO_URL) {
              setFailedLogoUrl(visibleLogoUrl);
            }
          }}
        />
      </span>
      <span
        aria-hidden="true"
        className="absolute inset-0 flex items-center justify-center text-foreground/62 opacity-0 transition-opacity duration-150 group-hover:text-foreground group-hover:opacity-100 group-focus-visible:text-foreground group-focus-visible:opacity-100"
      >
        <DirectionIcon className="size-4 stroke-[1.75]" />
      </span>
    </Button>
  );
}
