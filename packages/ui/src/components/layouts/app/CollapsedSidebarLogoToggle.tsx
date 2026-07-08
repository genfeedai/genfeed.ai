'use client';

import { ButtonVariant } from '@genfeedai/enums';
import { useThemeLogo } from '@genfeedai/hooks/ui/use-theme-logo/use-theme-logo';
import { EnvironmentService } from '@genfeedai/services/core/environment.service';
import { Button } from '@ui/primitives/button';
import Image from 'next/image';

type CollapsedSidebarLogoToggleProps = {
  onClick: () => void;
};

export default function CollapsedSidebarLogoToggle({
  onClick,
}: CollapsedSidebarLogoToggleProps) {
  const logoUrl = useThemeLogo();

  return (
    <Button
      type="button"
      variant={ButtonVariant.UNSTYLED}
      withWrapper={false}
      onClick={onClick}
      ariaLabel="Expand sidebar"
      className="fixed left-2 z-[60] hidden size-8 items-center justify-center rounded-md border border-border/70 bg-background/95 text-foreground shadow-sm backdrop-blur transition-colors hover:border-foreground/20 hover:bg-background-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 md:flex"
      style={{ top: 'calc(var(--desktop-titlebar-height) + 0.5rem)' }}
    >
      {logoUrl ? (
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
