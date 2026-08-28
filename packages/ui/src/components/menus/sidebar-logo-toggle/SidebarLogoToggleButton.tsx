'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { useThemeLogo } from '@genfeedai/hooks/ui/use-theme-logo/use-theme-logo';
import { EnvironmentService } from '@genfeedai/services/core/environment.service';
import { Button } from '@ui/primitives/button';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import Image from 'next/image';
import type { CSSProperties } from 'react';

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
  const DirectionIcon =
    direction === 'collapse' ? PanelLeftClose : PanelLeftOpen;

  return (
    <Button
      type="button"
      variant={ButtonVariant.GHOST}
      size={ButtonSize.ICON}
      withWrapper={false}
      onClick={onClick}
      ariaLabel={ariaLabel}
      className={cn(
        'relative flex size-8 flex-shrink-0 items-center justify-center rounded-md border-0 bg-transparent p-0 text-foreground/72 shadow-none transition-colors',
        'hover:bg-foreground/[0.06] hover:text-foreground',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
        className,
      )}
      data-sidebar-direction={direction}
      style={style}
      tooltip={ariaLabel}
    >
      {direction === 'collapse' ? (
        <DirectionIcon className="size-4 stroke-[1.75]" />
      ) : logoUrl ? (
        <Image
          src={logoUrl}
          alt={EnvironmentService.LOGO_ALT}
          className="size-4 object-contain dark:invert"
          width={16}
          height={16}
          sizes="16px"
        />
      ) : (
        <span className="text-sm font-bold leading-none">G</span>
      )}
    </Button>
  );
}
